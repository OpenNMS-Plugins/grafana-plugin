'use strict';

// What belongs in a distributable package built from dist/, shared by the rpm, deb
// and zip builders so the three artifacts cannot drift apart.

// rpmbuild's working directories live under dist/ while an RPM is being built, so
// they must never end up inside a package.
//
// `test` is excluded because webpack copies `src/**/*.json` into dist with no ignore
// list, which drags the jest fixtures under src/test along with it.
const EXCLUDED_TOP_LEVEL = ['SOURCES', 'SPECS', 'RPMS', 'SRPMS', 'test', '.git'];

// recursive-copy takes an include-then-exclude pattern list. Excluding both the
// directory and its subtree is required: excluding only `test/**` still creates an
// empty `test` directory in the output.
function recursiveCopyFilter(additionalPatterns = []) {
  return ['**/*']
    .concat(EXCLUDED_TOP_LEVEL.flatMap((name) => ['!' + name, '!' + name + '/**']))
    .concat(additionalPatterns);
}

module.exports = { EXCLUDED_TOP_LEVEL, recursiveCopyFilter };
