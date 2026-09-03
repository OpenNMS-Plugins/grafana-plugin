#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const spawn = require('child_process').spawnSync;
const copy = require('recursive-copy');
const rimraf = require('rimraf');
const which = require('which');

const { recursiveCopyFilter } = require('../distContents');
const pkginfo = require('../../package.json');
const plugininfo = require('../../src/plugin.json');

try {
  which.sync('zip');
} catch (err) {
  console.log('zip executable not found');
  process.exit(1);
}

// Resolved from this file rather than from process.cwd(): the script no longer sits
// at the project root, so the two are only the same by convention.
const topdir = path.resolve(__dirname, '..', '..');

const version = pkginfo.version;

const pkgname = pkginfo.name;
const pkgid = plugininfo.id;
const srcdir = path.join(topdir, 'dist');
const tmpdir = path.join(topdir, 'tmp');
const workdir = path.join(tmpdir, pkgid);
const packagedir = path.join(topdir, 'artifacts');
const zipfile = path.join(packagedir, `${pkgname}-${version}.zip`);

rimraf.sync(workdir);
rimraf.sync(zipfile);
fs.mkdirsSync(workdir);
fs.mkdirsSync(packagedir);
return copy(path.join(srcdir), workdir, {
  dot: true,
  filter: recursiveCopyFilter([
    '!packages',
    '!packages/**',
  ]),
  junk: false,
}).then((results) => {
  console.info(results.length + ' files copied to ' + workdir);

  console.info('* running zip');
  const ret = spawn('zip', ['-r', zipfile, pkgid], { // NOSONAR
    cwd: path.join(tmpdir),
    stdio: ['inherit', 'inherit', 'inherit'],
  });
  if (ret.error) {
    console.log('zip failed: ' + ret.error.message);
    process.exit(1);
  }

  // spawnSync reports a non-zero exit only in `status`, never in `error`.
  if (ret.status !== 0) {
    console.log('zip exited with status ' + ret.status);
    process.exit(1);
  }

  rimraf.sync(tmpdir);
  console.info('Wrote ' + zipfile);
  process.exit(0);
}).catch((error) => {
  console.log('Copy failed: ' + error);
  process.exit(1);
});
