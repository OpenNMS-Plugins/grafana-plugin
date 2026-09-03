'use strict';

// Shared by makerpm.js and makedeb.js so both derive the same version/release from
// package.json. A `-SNAPSHOT` version becomes an unqualified version at release 0,
// so that snapshot packages sort below the eventual release.
const SNAPSHOT_SUFFIX = '-SNAPSHOT';

function resolveVersionAndRelease(rawVersion) {
  if (typeof rawVersion !== 'string' || rawVersion === '') {
    throw new Error('package version must be a non-empty string, got: ' + JSON.stringify(rawVersion));
  }

  if (rawVersion.endsWith(SNAPSHOT_SUFFIX)) {
    return {
      version: rawVersion.slice(0, -SNAPSHOT_SUFFIX.length),
      release: '0'
    };
  }

  return { version: rawVersion, release: '1' };
}

module.exports = { resolveVersionAndRelease };
