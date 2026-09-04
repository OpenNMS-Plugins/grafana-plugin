'use strict';

// Publishes a built package where CI's sign and publish steps look for it. Shared by
// the rpm, deb and zip builders so all three land their output the same way.

const fs = require('fs');
const path = require('path');

// Overwrites rather than skipping, so a rebuild at the same version cannot silently
// ship a stale package.
function copyToArtifacts(packagePath, artifactsDir) {
  const target = path.join(artifactsDir, path.basename(packagePath));

  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.rmSync(target, { force: true });
  fs.copyFileSync(packagePath, target);

  return target;
}

module.exports = { copyToArtifacts };
