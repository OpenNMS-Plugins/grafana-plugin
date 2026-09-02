'use strict';

// Builds the gzipped source tarball that rpmbuild consumes, rooted at dist/ so the
// extracted tree is exactly what gets installed into the Grafana plugin directory.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const tar = require('tar-fs');

const { EXCLUDED_TOP_LEVEL } = require('../distContents');

const EXCLUDED = new RegExp('^(' + EXCLUDED_TOP_LEVEL.join('|').replace(/\./g, '\\.') + ')(/|$)');

function isExcluded(sourceDir, absolutePath) {
  const relativePath = path.relative(sourceDir, absolutePath).split(path.sep).join('/');

  return EXCLUDED.test(relativePath);
}

// rpm assigns ownership via %defattr, so the ids recorded in the tarball are noise.
// Zeroing them keeps the archive identical regardless of who ran the build.
function normalizeOwnership(header) {
  header.uid = 0;
  header.gid = 0;
  header.uname = 'root';
  header.gname = 'root';

  return header;
}

function createSourceArchive(sourceDir, targetFile) {
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });

  const pack = tar.pack(sourceDir, {
    ignore: (name) => isExcluded(sourceDir, name),
    map: normalizeOwnership,
    sort: true
  });

  const target = fs.createWriteStream(targetFile);
  const gzip = zlib.createGzip();

  return new Promise((resolve, reject) => {
    pack.on('error', reject);
    gzip.on('error', reject);
    target.on('error', reject);
    target.on('close', resolve);

    pack.pipe(gzip).pipe(target);
  });
}

module.exports = { createSourceArchive };
