'use strict';

// Builds the plugin ZIP: stages dist/ under a directory named for the plugin id and
// zips that directory. Paths are arguments rather than being read from process.cwd()
// so the whole pipeline can be exercised against a fixture dist.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const which = require('which');

const { stageDist } = require('../stageDist');

function findZip() {
  return which.sync('zip', { nothrow: true });
}

async function buildZip({ distDir, stagingDir, zipPath, pkgId, verbose = false }) {
  const log = verbose ? (...args) => console.log(...args) : () => {};

  const zip = findZip();

  if (!zip) {
    throw new Error('make-zip: zip executable not found on PATH');
  }

  // stagingDir is ours to own, so start from empty: `zip -r` updates an archive in
  // place, and a leftover tree from an earlier run would be folded into the new one.
  fs.rmSync(stagingDir, { recursive: true, force: true });

  try {
    // Grafana identifies a plugin by the zip's top-level directory name, so the
    // staged tree has to sit under the plugin id rather than at the archive root.
    const pluginDir = path.join(stagingDir, pkgId);

    const staged = await stageDist({
      distDir,
      targetDir: pluginDir,
      // Vestigial from when packages were built inside dist; harmless, and cheap
      // insurance against a stray package directory being shipped.
      extraExcludes: ['!packages', '!packages/**']
    });

    log(staged + ' files staged in ' + pluginDir);

    // Same reason: `zip` adds to an existing archive, so a rebuild at the same
    // version would keep files that are no longer in dist.
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    fs.rmSync(zipPath, { force: true });

    log('Running zip in ' + stagingDir);
    const result = spawnSync(zip, ['-r', zipPath, pkgId], {
      cwd: stagingDir,
      stdio: verbose ? ['inherit', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8'
    });

    if (result.error) {
      throw new Error('make-zip: zip could not be run: ' + result.error.message);
    }

    // spawnSync reports a non-zero exit only in `status`, never in `error`.
    if (result.status !== 0) {
      throw new Error(
        'make-zip: zip exited with status ' + result.status + '\n' + (result.stderr || result.stdout || '')
      );
    }

    return { zipPath };
  } finally {
    // Not in a `process.exit` path: exit() would skip this and leave a full copy of
    // dist behind, which the previous script did on every failure.
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

module.exports = { buildZip, findZip };
