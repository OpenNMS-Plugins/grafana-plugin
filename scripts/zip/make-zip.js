#!/usr/bin/env node

// Builds the distributable ZIP of the OpenNMS plugin for Grafana.
//
// The work lives in the sibling build module so it can be unit tested; this file only
// resolves the real paths and package metadata and reports the result.
//
// The zip is named with the raw package.json version, unlike the rpm and the deb which
// split it into version and release. Those two need the split for package sort order; a zip
// has no such semantics, and keeping the snapshot suffix distinguishes a snapshot build from
// a release, which a bare version with a release number of 0 would not.
//
// Set MAKEZIP_DEBUG=1 for verbose output (zip's own output and the staged file count)
// when debugging a CI build.

const os = require('os');
const path = require('path');

const { PROJECT_DIR } = require('../paths');
const { buildZip, findZip } = require('./build');
const pkgInfo = require('../../package.json');
const pluginInfo = require('../../src/plugin.json');

const isDebug = process.env.MAKEZIP_DEBUG === '1';

const distDir = path.join(PROJECT_DIR, 'dist');
const artifactsDir = path.join(PROJECT_DIR, 'artifacts');
const stagingDir = path.join(os.tmpdir(), 'opennms-grafana-plugin-zip');
const zipPath = path.join(artifactsDir, pkgInfo.name + '-' + pkgInfo.version + '.zip');

async function main() {
  if (!findZip()) {
    console.error('zip executable not found');
    process.exit(1);
  }

  console.log(
    'Building ZIP for ' + pluginInfo.name + ' (' + pluginInfo.id + ') ' + pkgInfo.version
  );

  try {
    await buildZip({
      distDir,
      stagingDir,
      zipPath,
      pkgId: pluginInfo.id,
      verbose: isDebug
    });
  } catch (err) {
    console.error('ZIP generation failed: ' + err.message);
    process.exit(1);
  }

  console.log('Wrote ' + zipPath);
}

// Backstop: anything thrown outside the try above (or from an async rejection)
// should still report as a build failure rather than an unhandled rejection.
main().catch((err) => {
  console.error('ZIP generation failed: ' + err.message);
  process.exit(1);
});
