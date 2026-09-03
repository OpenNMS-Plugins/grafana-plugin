#!/usr/bin/env node

// Builds the RPM for the OpenNMS plugin for Grafana.
//
// The work lives in the sibling modules so it can be unit tested; this file only
// resolves the real paths and package metadata and reports the result.
//
// Set MAKERPM_DEBUG=1 for verbose output (rpmbuild's own output, and the generated
// spec and archive listings) when debugging a CI build.

const os = require('os');
const fs = require('fs');
const path = require('path');

const program = require('commander');

const { PROJECT_DIR } = require('../paths');
const { resolveVersionAndRelease } = require('../packageVersion');
const { buildRpm, copyToArtifacts, findRpmbuild } = require('./build');
const pkgInfo = require('../../package.json');
const pluginInfo = require('../../src/plugin.json');

const isDebug = process.env.MAKERPM_DEBUG === '1';

const distDir = path.join(PROJECT_DIR, 'dist');
const artifactsDir = path.join(PROJECT_DIR, 'artifacts');
const topDir = path.join(os.tmpdir(), 'rpmbuild');

const { version, release: defaultRelease } = resolveVersionAndRelease(pkgInfo.version);

program
  .version(pkgInfo.version)
  .option('-r --release <release>', 'Specify release number of package', defaultRelease)
  .parse(process.argv);

const release = program.opts().release;

async function main() {
  if (!findRpmbuild()) {
    console.error('rpmbuild executable not found');
    process.exit(1);
  }

  if (!fs.existsSync(distDir)) {
    console.error('dist directory not found at ' + distDir + '; run `npm run build` first');
    process.exit(1);
  }

  console.log(
    'Building RPM for ' + pluginInfo.name + ' (' + pluginInfo.id + ') ' + version + '-' + release
  );

  let failure = null;

  try {
    const { rpmPath } = await buildRpm({
      distDir,
      topDir,
      pkgInfo,
      pluginInfo,
      version,
      release,
      verbose: isDebug
    });

    const artifact = copyToArtifacts(rpmPath, artifactsDir);
    console.log('Wrote ' + artifact);
  } catch (err) {
    failure = err;
  } finally {
    // Not in a `process.exit` path: exit() would skip this and leak the build tree.
    fs.rmSync(topDir, { recursive: true, force: true });
  }

  if (failure) {
    console.error('RPM generation failed: ' + failure.message);
    process.exit(1);
  }
}

// Backstop: anything thrown outside the try above (or from an async rejection)
// should still report as a build failure rather than an unhandled rejection.
main().catch((err) => {
  console.error('RPM generation failed: ' + err.message);
  process.exit(1);
});
