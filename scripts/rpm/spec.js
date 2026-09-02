'use strict';

// Renders the RPM spec file from src/rpm/spec.mustache.
//
// This used to be delegated to speculate, but speculate 6.x hardcodes its own
// systemd-service spec template and silently ignores package.json's
// `spec.specTemplate` / `spec.installDir`, which packaged the plugin into
// /usr/lib with a bogus service unit and a system user instead of into the
// Grafana plugin directory. We render our own template so that config is live.
//
// The template uses triple-stache ({{{ }}}) throughout: mustache escapes `/` as
// `&#x2F;` with double-stache, which would mangle every path in the spec.

const fs = require('fs');
const path = require('path');
const mustache = require('mustache');

const PROJECT_DIR = path.resolve(__dirname, '..', '..');

function requireValue(value, message) {
  if (value === undefined || value === null || value === '') {
    throw new Error('makerpm: ' + message);
  }

  return value;
}

function isNoarch(pkgInfo) {
  return (pkgInfo.spec || {}).noarch !== false;
}

function buildView({ pkgInfo, pluginInfo, version, release }) {
  const specConfig = pkgInfo.spec || {};
  const installDir = requireValue(specConfig.installDir, 'package.json spec.installDir is required');
  const pluginId = requireValue(pluginInfo.id, 'plugin.json id is required');
  const postInstallCommands = specConfig.post || [];
  const executableFiles = (specConfig.executable || []).map((file) => path.posix.join(installDir, pluginId, file));

  return {
    name: requireValue(pkgInfo.name, 'package.json name is required'),
    version: requireValue(version, 'version is required'),
    release: requireValue(release, 'release is required'),
    description: requireValue(pkgInfo.description, 'package.json description is required'),
    license: requireValue(pkgInfo.license, 'package.json license is required'),
    pluginId,
    installDir,
    requires: specConfig.requires || [],
    buildRequires: specConfig.buildRequires || [],
    noarch: isNoarch(pkgInfo),
    dist: specConfig.dist,
    postInstallCommands,
    hasPostInstallCommands: postInstallCommands.length > 0,
    executableFiles,
    hasExecutableFiles: executableFiles.length > 0
  };
}

function renderSpec({ pkgInfo, pluginInfo, version, release, projectDir = PROJECT_DIR }) {
  const specConfig = pkgInfo.spec || {};
  const templatePath = path.resolve(
    projectDir,
    requireValue(specConfig.specTemplate, 'package.json spec.specTemplate is required')
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error('makerpm: spec template not found: ' + templatePath);
  }

  return mustache.render(fs.readFileSync(templatePath, 'utf-8'), buildView({ pkgInfo, pluginInfo, version, release }));
}

module.exports = { renderSpec, isNoarch };
