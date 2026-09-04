#!/usr/bin/env node

// Builds the DEB for the OpenNMS plugin for Grafana.
//
// The work lives in the sibling build module so it can be unit tested; this file only
// resolves the real paths and package metadata and reports the result.
//
// Set MAKEDEB_DEBUG=1 for verbose output (dpkg-buildpackage's own output and the
// staging progress) when debugging a CI build.

const os = require('os');
const path = require('path');

const program = require('commander');

const { PROJECT_DIR } = require('../paths');
const { resolveVersionAndRelease } = require('../packageVersion');
const { buildDeb, findDpkgBuildpackage } = require('./build');
const { resolveMaintainer } = require('./maintainer');
const pkgInfo = require('../../package.json');
const pluginInfo = require('../../src/plugin.json');

const isDebug = process.env.MAKEDEB_DEBUG === '1';

const distDir = path.join(PROJECT_DIR, 'dist');
const artifactsDir = path.join(PROJECT_DIR, 'artifacts');
// Deliberately not under artifacts/: dpkg-buildpackage writes a .dsc, a .changes, a
// .buildinfo and a source tarball beside the .deb, and building in artifacts/ meant CI
// stored all of them, plus a full copy of dist whenever a build failed.
const buildRoot = path.join(os.tmpdir(), 'opennms-grafana-plugin-deb');

const { version, release: defaultRelease } = resolveVersionAndRelease(pkgInfo.version);

program
  .version(pkgInfo.version)
  .option('-r --release <release>', 'Specify release number of package', defaultRelease)
  .parse(process.argv);

const release = program.opts().release;

// debian/control and the changelog trailer must name the same identity, so both are
// generated from one value. DEBFULLNAME/DEBEMAIL override it.
const maintainer = resolveMaintainer();

async function main() {
  if (!findDpkgBuildpackage()) {
    console.error('dpkg-buildpackage executable not found');
    process.exit(1);
  }

  console.log(
    'Building DEB for ' + pluginInfo.name + ' (' + pluginInfo.id + ') ' + version + '-' + release
  );

  let debPath;

  try {
    ({ debPath } = await buildDeb({
      distDir,
      buildRoot,
      artifactsDir,
      pkgInfo,
      pluginInfo,
      version,
      release,
      maintainer,
      verbose: isDebug
    }));
  } catch (err) {
    console.error('DEB generation failed: ' + err.message);
    process.exit(1);
  }

  console.log('Wrote ' + debPath);
}

// Backstop: anything thrown outside the try above (or from an async rejection)
// should still report as a build failure rather than an unhandled rejection.
main().catch((err) => {
  console.error('DEB generation failed: ' + err.message);
  process.exit(1);
});
