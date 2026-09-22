#!/usr/bin/env node

'use strict';

// Runs Antora's xref validator and fails the build on any reference problem.
//
// This wrapper exists because --log-failure-level cannot express what we need.
// Antora accepts only warn, error, fatal or none, but Asciidoctor reports a
// dangling internal reference -- `<<some-anchor>>` where that anchor is not on the
// page -- at *info* level. That is not a warning it can fail on, so a broken
// reference was reported and the command still exited 0. That is exactly how
// getting_started/importing.adoc came to link to `#upgrade-dashboards`, an anchor
// that lives on installation/upgrading.adoc, for as long as it did.
//
// So: run Antora at --log-level=info with --log-failure-level=warn (which still
// covers warn and above on its own), then treat the info-level reference messages
// as failures too.

const path = require('path');
const { spawnSync } = require('child_process');

const { PROJECT_DIR } = require('../paths');

// Only reference problems, not every info-level message Antora emits. Anything
// Antora already fails on is left to Antora's own exit code.
const REFERENCE_PROBLEM = /^(possible invalid reference|target of (?:xref|image|include) not found)\b/;

// Antora records an absolute path for the file a message came from, but not on every
// record. This stands in for the missing ones, and must not be run through
// path.relative: that resolves it against the cwd and prints `../../..<cwd>/<unknown
// file>` whenever the script is invoked from outside the project directory.
const UNKNOWN_FILE = '<unknown file>';

const ANTORA = path.join(PROJECT_DIR, 'node_modules', '.bin', 'antora');
const GENERATOR = path.join(
  PROJECT_DIR,
  '.antora-tools',
  'node_modules',
  '@antora',
  'xref-validator'
);

// Antora logs one JSON object per line, but only when it decides not to pretty-print;
// --log-format=json makes that unconditional so this does not depend on whether CI
// happens to look like a TTY.
function run(playbook) {
  return spawnSync(
    ANTORA,
    [
      '--log-level=info',
      '--log-failure-level=warn',
      '--log-format=json',
      '--generator',
      GENERATOR,
      playbook
    ],
    { cwd: PROJECT_DIR, encoding: 'utf-8' }
  );
}

// Exported so the parsing can be tested without running Antora.
function collectProblems(output) {
  return (output || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        // A line that is not JSON is not a log record; Antora's own exit code
        // still covers anything that made it fail.
        return null;
      }
    })
    .filter((record) => record && REFERENCE_PROBLEM.test(record.msg || ''))
    .map((record) => ({
      msg: record.msg,
      file: (record.file || {}).path || UNKNOWN_FILE
    }));
}

function describeLocation(file, projectDir = PROJECT_DIR) {
  if (file === UNKNOWN_FILE) {
    return file;
  }

  return path.relative(projectDir, file);
}

function main() {
  const playbook = process.argv[2] || 'local-site.yml';
  const result = run(playbook);

  if (result.error) {
    console.error('validate-xrefs: could not run antora: ' + result.error.message);
    process.exit(1);
  }

  const combined = (result.stdout || '') + (result.stderr || '');

  // Pass Antora's own output through; it is the useful diagnostic.
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  const problems = collectProblems(combined);

  if (problems.length) {
    console.error(
      '\nvalidate-xrefs: ' + problems.length + ' reference problem(s) found:'
    );
    problems.forEach((problem) => {
      console.error('  ' + describeLocation(problem.file) + ': ' + problem.msg);
    });
    process.exit(1);
  }

  // Antora exits non-zero for warn and above on its own; do not mask that.
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }

  console.log('validate-xrefs: no reference problems found');
}

if (require.main === module) {
  main();
}

module.exports = { collectProblems, describeLocation, REFERENCE_PROBLEM, UNKNOWN_FILE };
