'use strict';

// Drives dpkg-buildpackage end to end: stages dist/ with a generated debian/ directory
// beside it and runs the build. Paths are arguments rather than being read from
// process.cwd() so the whole pipeline can be exercised against a fixture dist.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const copy = require('recursive-copy');
const which = require('which');

const { copyToArtifacts } = require('../artifacts');
const { DEBIAN_DIR } = require('../paths');
const { stageDist } = require('../stageDist');
const { renderChangelog, renderControl } = require('./metadata');

function findDpkgBuildpackage() {
  return which.sync('dpkg-buildpackage', { nothrow: true });
}

// dpkg-buildpackage writes its output to the parent of the directory it builds in, so
// the .deb lands beside a .dsc, a .changes, a .buildinfo and a source tarball. Only the
// .deb is published, and reconstructing its name gets the architecture suffix wrong, so
// ask the filesystem instead.
function findBuiltDebs(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.deb'))
    .map((file) => path.join(dir, file));
}

async function stageDebTree({
  distDir,
  workDir,
  pkgInfo,
  version,
  release,
  maintainer,
  debianDir = DEBIAN_DIR
}) {
  const staged = await stageDist({ distDir, targetDir: workDir });

  const debian = path.join(workDir, 'debian');
  fs.mkdirSync(debian, { recursive: true });

  // The templates are rendered below; copying them through as-is would both ship a
  // stray .mustache in the package and leave dpkg reading an unrendered control.
  await copy(debianDir, debian, { filter: ['**/*', '!**/*.mustache'] });

  fs.writeFileSync(path.join(debian, 'control'), renderControl({ pkgInfo, maintainer }));
  fs.writeFileSync(
    path.join(debian, 'changelog'),
    renderChangelog({ pkgInfo, version, release, maintainer })
  );

  return staged;
}

// Publishes into artifactsDir itself rather than handing the caller a path under
// buildRoot, because buildRoot is removed on the way out: the deb has to be copied out
// while it still exists, and doing that here is what lets the cleanup be unconditional.
async function buildDeb({
  distDir,
  buildRoot,
  artifactsDir,
  pkgInfo,
  pluginInfo,
  version,
  release,
  maintainer,
  verbose = false
}) {
  const log = verbose ? (...args) => console.log(...args) : () => {};

  const dpkgBuildpackage = findDpkgBuildpackage();

  if (!dpkgBuildpackage) {
    throw new Error('make-deb: dpkg-buildpackage executable not found on PATH');
  }

  // buildRoot is ours to own: starting from empty is what makes the deb produced by
  // this build unambiguous below, and it is deliberately not artifacts/ — building
  // there left a full copy of dist where CI collects artifacts whenever a build failed.
  fs.rmSync(buildRoot, { recursive: true, force: true });

  try {
    const workDir = path.join(buildRoot, pluginInfo.id);

    log('Staging the deb tree in ' + workDir);
    const staged = await stageDebTree({ distDir, workDir, pkgInfo, version, release, maintainer });
    log(staged + ' files staged, debian/ written for ' + maintainer);

    log('Running dpkg-buildpackage in ' + workDir);
    // -us -uc: do not sign the .dsc/.changes here. dpkg-buildpackage would sign as the
    // changelog's maintainer identity, which is not a key we hold; CI signs the built
    // .deb separately with the OpenNMS release key. Before make-deb.js checked the exit
    // status, that signing failure (status 25) was discarded and the build looked green.
    const result = spawnSync(dpkgBuildpackage, ['-us', '-uc'], {
      cwd: workDir,
      stdio: verbose ? ['inherit', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8'
    });

    if (result.error) {
      throw new Error('make-deb: dpkg-buildpackage could not be run: ' + result.error.message);
    }

    // spawnSync reports a non-zero exit only in `status`, never in `error`.
    if (result.status !== 0) {
      throw new Error(
        'make-deb: dpkg-buildpackage exited with status ' +
          result.status +
          '\n' +
          (result.stderr || result.stdout || '')
      );
    }

    const debs = findBuiltDebs(buildRoot);

    if (debs.length !== 1) {
      throw new Error(
        'make-deb: expected exactly one deb under ' +
          buildRoot +
          ', found ' +
          debs.length +
          (debs.length ? ': ' + debs.join(', ') : '')
      );
    }

    return { debPath: copyToArtifacts(debs[0], artifactsDir) };
  } finally {
    fs.rmSync(buildRoot, { recursive: true, force: true });
  }
}

module.exports = { buildDeb, findBuiltDebs, findDpkgBuildpackage, stageDebTree };
