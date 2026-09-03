#!/usr/bin/env node

/* jshint esversion: 6 */

const fs = require('fs-extra');
const path = require('path');
const spawn = require('child_process').spawnSync;
const copy = require('recursive-copy');
const rimraf = require('rimraf');
const which = require('which');
const program = require('commander');

const { recursiveCopyFilter } = require('../distContents');
const { resolveMaintainer } = require('./maintainer');
const { renderChangelog, renderControl, PROJECT_DIR } = require('./metadata');
const { resolveVersionAndRelease } = require('../packageVersion');
const pkginfo = require('../../package.json');
const plugininfo = require('../../src/plugin.json');

try {
  which.sync('dpkg-buildpackage');
} catch (err) {
  console.log('dpkg-buildpackage executable not found');
  process.exit(1);
}

// The previous `if (version.indexOf('-SNAPSHOT'))` was truthy for -1 too, so every
// build was released as 0 whether or not it was a snapshot.
const { version, release: defaultRelease } = resolveVersionAndRelease(pkginfo.version);

program
  .version(pkginfo.version)
  .option('-r --release <release>', 'Specify release number of package', defaultRelease)
  .parse(process.argv);

const release = program.opts().release;

pkginfo.version = version;
pkginfo.release = release;


// debian/control and the changelog trailer must name the same identity, so both are
// generated from one value. DEBFULLNAME/DEBEMAIL override it.
const maintainer = resolveMaintainer();

// Resolved from this file rather than from process.cwd(): the script no longer sits
// at the project root, so the two are only the same by convention.
const pkgid   = plugininfo.id;
const workdir = path.join(PROJECT_DIR, 'artifacts', pkgid);
const distdir = path.join(PROJECT_DIR, 'dist');

rimraf.sync(workdir);
fs.mkdirsSync(workdir);
return copy(distdir, workdir, {
  dot: true,
  junk: false,
  filter: recursiveCopyFilter([
    '!**/*.changes',
    '!**/*.deb',
    '!**/*.dsc',
    '!**/*.tar.gz',
  ])
}).then((results) => {
  console.log(results.length + ' files copied to ' + workdir);

  const debian = path.join(workdir, 'debian');
  fs.mkdirsSync(debian);

  // The templates are rendered below; they must not be copied through as-is.
  return copy(path.join(__dirname, 'debian'), debian, {
    filter: ['**/*', '!**/*.mustache']
  }).then((_copyResults) => {
    console.log('debian/ directory copied');

    console.log('* writing control and changelog for ' + maintainer);
    fs.writeFileSync(path.join(debian, 'control'), renderControl({ pkgInfo: pkginfo, maintainer }));
    fs.writeFileSync(
      path.join(debian, 'changelog'),
      renderChangelog({ pkgInfo: pkginfo, version, release, maintainer })
    );

    console.log('* running dpkg-buildpackage');
    // -us -uc: do not sign the .dsc/.changes here. dpkg-buildpackage would sign as the
    // changelog's maintainer identity, which is not a key we hold; CI signs the built
    // .deb separately with the OpenNMS release key. Before make-deb.js checked the exit
    // status, that signing failure (status 25) was discarded and the build looked green.
    const ret = spawn('dpkg-buildpackage', ['-us', '-uc'], {
      cwd: workdir,
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    if (ret.error) {
      console.log('dpkg-buildpackage failed: ' + ret.error.message);
      process.exit(1);
    }

    // spawnSync reports a non-zero exit only in `status`, never in `error`.
    if (ret.status !== 0) {
      console.log('dpkg-buildpackage exited with status ' + ret.status);
      process.exit(1);
    }

    rimraf.sync(workdir);

    process.exit(0);
  });
}).catch((error) => {
  console.log('Copy failed: ' + error);
  process.exit(1);
});
