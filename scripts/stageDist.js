'use strict';

// Copies the built plugin out of dist/ into a staging directory, applying the shared
// list of things that never belong in a distributable. The deb and the zip both do
// this before handing the tree to their packaging tool, and they must agree on what
// lands in it; the rpm packs its tarball with tar-fs instead but honours the same list.

const fs = require('fs');
const copy = require('recursive-copy');

const { recursiveCopyFilter } = require('./distContents');

// recursive-copy reports a missing source as an ENOENT on lstat, which surfaced as
// 'Copy failed: ...' and said nothing about the actual mistake, which is almost always
// a packaging run against a tree that was never built.
function assertDistExists(distDir) {
  if (!fs.existsSync(distDir)) {
    throw new Error('dist directory not found at ' + distDir + '; run `npm run build` first');
  }
}

async function stageDist({ distDir, targetDir, extraExcludes = [] }) {
  assertDistExists(distDir);

  const results = await copy(distDir, targetDir, {
    dot: true,
    junk: false,
    filter: recursiveCopyFilter(extraExcludes)
  });

  return results.length;
}

module.exports = { assertDistExists, stageDist };
