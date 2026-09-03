'use strict';

// Drives rpmbuild end to end: renders the spec, packs the source archive, lays out
// an rpmbuild tree and runs the build. Paths are arguments rather than being read
// from process.cwd() so the whole pipeline can be exercised against a fixture dist.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const which = require('which');

const { createSourceArchive } = require('./archive');
const { renderSpec, isNoarch } = require('./spec');

const PROJECT_DIR = path.resolve(__dirname, '..', '..');

function findRpmbuild() {
  return which.sync('rpmbuild', { nothrow: true });
}

// The built file is name-version-release[.dist].arch.rpm, and both the dist tag and
// the architecture depend on spec config. Reconstructing that name got it wrong and
// reported successful builds as failures, so ask the filesystem instead.
function findBuiltRpms(topDir) {
  const rpmsDir = path.join(topDir, 'RPMS');

  if (!fs.existsSync(rpmsDir)) {
    return [];
  }

  return fs
    .readdirSync(rpmsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((archDir) =>
      fs
        .readdirSync(path.join(rpmsDir, archDir.name))
        .filter((file) => file.endsWith('.rpm'))
        .map((file) => path.join(rpmsDir, archDir.name, file))
    );
}

function buildRpm({
  distDir,
  topDir,
  pkgInfo,
  pluginInfo,
  version,
  release,
  projectDir = PROJECT_DIR,
  verbose = false
}) {
  const log = verbose ? (...args) => console.log(...args) : () => {};

  const rpmbuild = findRpmbuild();

  if (!rpmbuild) {
    return Promise.reject(new Error('make-rpm: rpmbuild executable not found on PATH'));
  }

  const specsDir = path.join(distDir, 'SPECS');
  const sourcesDir = path.join(distDir, 'SOURCES');
  const specPath = path.join(specsDir, pkgInfo.name + '.spec');
  const archivePath = path.join(sourcesDir, pkgInfo.name + '.tar.gz');

  // Clean dist, not the cwd: these are the directories we are about to write, and a
  // leftover SPECS or SOURCES from an earlier run would otherwise collide.
  const cleanDist = () => {
    fs.rmSync(specsDir, { recursive: true, force: true });
    fs.rmSync(sourcesDir, { recursive: true, force: true });
  };

  cleanDist();

  return Promise.resolve()
    .then(() => {
      log('Rendering spec file: ' + specPath);
      fs.mkdirSync(specsDir, { recursive: true });
      fs.writeFileSync(specPath, renderSpec({ pkgInfo, pluginInfo, version, release, projectDir }));

      log('Creating source archive: ' + archivePath);
      return createSourceArchive(distDir, archivePath);
    })
    .then(() => {
      const buildSourcesDir = path.join(topDir, 'SOURCES');
      const tmpDir = path.join(topDir, 'tmp');

      // topDir is ours to own: starting from empty is what makes the rpm produced by
      // this build unambiguous below.
      fs.rmSync(topDir, { recursive: true, force: true });
      ['SOURCES', 'RPMS', 'BUILD', 'SRPMS', 'tmp'].forEach((dir) =>
        fs.mkdirSync(path.join(topDir, dir), { recursive: true })
      );
      fs.copyFileSync(archivePath, path.join(buildSourcesDir, path.basename(archivePath)));

      log('Running rpmbuild in ' + topDir);
      const result = spawnSync(
        rpmbuild,
        [
          // Must agree with the template's BuildArch, which follows the same flag.
          ...(isNoarch(pkgInfo) ? ['--target', 'noarch'] : []),
          '--define', '_topdir ' + topDir,
          // rpmbuild defaults %_tmppath to a directory that need not exist on the
          // build host, which fails the build before it starts.
          '--define', '_tmppath ' + tmpDir,
          '-ba',
          specPath
        ],
        { stdio: verbose ? ['inherit', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' }
      );

      if (result.error) {
        throw new Error('make-rpm: rpmbuild could not be run: ' + result.error.message);
      }

      // spawnSync reports a non-zero exit only in `status`; checking `error` alone
      // lets a failed build through.
      if (result.status !== 0) {
        throw new Error(
          'make-rpm: rpmbuild exited with status ' + result.status + '\n' + (result.stderr || result.stdout || '')
        );
      }

      const rpms = findBuiltRpms(topDir);

      if (rpms.length !== 1) {
        throw new Error(
          'make-rpm: expected exactly one rpm under ' +
            path.join(topDir, 'RPMS') +
            ', found ' +
            rpms.length +
            (rpms.length ? ': ' + rpms.join(', ') : '')
        );
      }

      return { rpmPath: rpms[0], specPath, archivePath };
    })
    .finally(cleanDist);
}

// Publishes the built rpm where CI's publish step looks for it. Overwrites rather
// than skipping, so a rebuild at the same version cannot silently ship a stale rpm.
function copyToArtifacts(rpmPath, artifactsDir) {
  const target = path.join(artifactsDir, path.basename(rpmPath));

  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.rmSync(target, { force: true });
  fs.copyFileSync(rpmPath, target);

  return target;
}

module.exports = { buildRpm, copyToArtifacts, findRpmbuild, PROJECT_DIR };
