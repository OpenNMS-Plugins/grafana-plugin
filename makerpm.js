#!/usr/bin/env node

// Node script for creating RPM file for our OPG assets

const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const rimraf = require('rimraf');
const which = require('which');

// not running speculate validator, it has some assumptions about file locations that are not valid in our case
// const validator = require('speculate/validator');
const generate = require('speculate/lib/generate');
const clean = require('speculate/lib/clean');
const program = require('commander');
const spawn = require('child_process').spawnSync;
const pkgInfo = require('./package.json');
const pluginInfo = require('./src/plugin.json');

// enable debug logging
// since it doesn't really affect performance, may want to keep it on
const isDebug = true;

console.log('Start makerpm');
const cwd = process.cwd();
const distDir = path.join(cwd, 'dist');
console.log('cwd: ', cwd);

// Get version from package.json
// If it's a snapshot, remove that and set release to 0
let version = pkgInfo.version;
let release = 1;

if (version.indexOf('-SNAPSHOT') > 0) {
  version = version.replace('-SNAPSHOT', '');
  release = '0';
}

// Ensure that rpmbuild executable exists
try {
  which.sync('rpmbuild');
} catch (err) {
  console.log('rpmbuild executable not found');
  process.exit(1);
}

program
  .version(pkgInfo.version)
  .option('-r --release <release>', 'Specify release number of package')
  .parse(process.argv);

const options = program.opts();
if (options.release === undefined) {
  options.release = release;
}

pkgInfo.version = version;
pkgInfo.release = release;
release = options.release;

const props = Object.assign({}, pluginInfo, pkgInfo);

if (isDebug) {
  console.log('props we are passing to generate:');
  console.dir(props);
}

console.log('Cleaning up after any previous RPM builds');
clean('.', pkgInfo);

console.log('Generating RPM spec for ' + props.name + ' (' + props.id + ') ' + props.version + '-' + options.release);

if (isDebug) {
  console.log('cwd: ', cwd);
  console.log('cwd contents:');
  fs.readdirSync(cwd).forEach(f => console.log(f));

  console.log('distDir: ', distDir);
  console.log('distDir contents:');
  fs.readdirSync(distDir).forEach(f => console.log(f));
}

async function runTasks() {
  try {
    console.log('Running makerpm tasks.');

    // generatedFiles is a list of filenames relative to the root directory
    // we only want the files in the `dist` directory
    console.log('Generating spec files...');
    const generatedFiles = await generate(distDir, props, release, pkgInfo.name);
    console.log('spec files generated.');
  
    console.log('Post-processing started.');

    console.log('\nspeculate reports that it created the following files:');

    generatedFiles.forEach(function (file) {
      console.log('  %s', file);
    });

    console.log('');
    console.log('Checking that these files are in the dist directory');
    fs.readdirSync(distDir).forEach(f => console.log(f));

    if (isDebug) {
      console.log('DEBUG more info on generated files...');

      generatedFiles.forEach(function (file) {
        const filePath = path.join(distDir, file);
        console.log('  %s', filePath);
      
        if (filePath.endsWith('.spec')) {
          console.log('Found spec file ' + filePath + '. Contents: ');

          spawn('cat',
            [filePath],
            { stdio: ['inherit', 'inherit', 'inherit'] }
          );
        }

        if (filePath.endsWith('.tar.gz')) {
          console.log('Found tar.gz file ' + filePath + '. Size: ');
          console.log(fs.statSync(filePath).size);

          console.log('tar.gz contents:');

          spawn('tar', 
            [ '-ztvf', filePath ],
            { stdio: ['inherit', 'inherit', 'inherit'] }
          );
        }
      });
    }

    console.log('Performing file operations.');

    const tmpDir = os.tmpdir();
    const rpmBuildDir = path.join(tmpDir, 'rpmbuild');
    
    console.log('Creating rpmBuildDir: ', rpmBuildDir);

    rimraf.sync(rpmBuildDir);
    fs.mkdirSync(rpmBuildDir);
    fs.mkdirSync(path.join(rpmBuildDir, 'SOURCES'));
    fs.mkdirSync(path.join(rpmBuildDir, 'RPMS'));
    fs.mkdirSync(path.join(rpmBuildDir, 'BUILD'));
    fs.copySync(path.join(distDir, 'SOURCES', pkgInfo.name + '.tar.gz'), path.join(rpmBuildDir, 'SOURCES', pkgInfo.name + '.tar.gz'));

    if (isDebug) {
      console.log('');
      console.log('Listing files in rpmbuild directory before running rpmbuild:');
      fs.readdirSync(rpmBuildDir).forEach(f => console.log(f));
    }

    console.log('');
    console.log('Running rpmbuild...');
    const specFile = path.join(distDir, 'SPECS', 'opennms-grafana-plugin.spec');

    const ret = spawn(
      'rpmbuild',
      [
        '--target', 'noarch',
        '--define', '_topdir ' + rpmBuildDir,
        '--define', 'pluginid ' + pluginInfo.id,
        '-ba',
        specFile
      ],
      {
        stdio: ['inherit', 'inherit', 'inherit']
      }
    );

    if (ret.error) {
      console.error('rpmbuild failed. Error: ' + ret.error.message);
      console.log('Full error:')
      console.dir(ret.error);
      process.exit(1);
    }

    console.log('rpmbuild complete');

    const targetDir = path.join('artifacts');
    console.log('Creating targetDir: ', targetDir);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir);
    }

    const rpm = pkgInfo.name + '-' + version + '-' + release + '.noarch.rpm';
    console.log('Creating rpm file: ', rpm);

    if (fs.existsSync(path.join(targetDir, rpm))) {
      fs.unlinkSync(path.join(targetDir, rpm));
    }

    const rpmFrom = path.join(rpmBuildDir, 'RPMS', 'noarch', rpm);
    const rpmTo = path.join(targetDir, rpm);

    console.log('Copying rpm from "' + rpmFrom + '" to "' + rpmTo + '"');
    fs.copySync(rpmFrom, rpmTo);

    console.log('');
    console.log('Cleaning up...');

    console.log('Removing rpmBuildDir');
    rimraf.sync(rpmBuildDir);

    console.log('Removing generated files...');
    generatedFiles.forEach(file => {
      const filePath = path.join(distDir, file);
      console.log('Removing: ' + filePath);

      fs.unlinkSync(filePath);
    });

    const distSPECS = path.join(distDir, 'SPECS');
    const distSOURCES = path.join(distDir, 'SOURCES');

    console.log('Removing ' + distSPECS);
    rimraf.sync(distSPECS);
    console.log('Removing ' + distSOURCES);
    rimraf.sync(distSOURCES);

    if (isDebug) {
      console.log('');
      console.log('Listing files in dist directory:');
      fs.readdirSync(distDir).forEach(f => console.log(f));

      console.log('');
      console.log('Listing files in cwd directory:');
      fs.readdirSync(cwd).forEach(f => console.log(f));
    
      console.log('');
      console.log('Listing files in artifacts directory. RPM should be here:');
      fs.readdirSync(path.join(cwd, 'artifacts')).forEach(f => console.log(f));
    }

    console.log('');
    console.log('Post-processing completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error in RPM generation:', err.message);
    console.log('Full error:')
    console.dir(err);
    process.exit(1);
  }
}

runTasks();
