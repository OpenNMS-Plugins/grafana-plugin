'use strict';

// The Debian maintainer identity used for debian/control and the generated changelog.
// DEBFULLNAME and DEBEMAIL are the standard Debian variables and are already set by the
// OpenNMS build environment, so honour them and fall back to the build account.

const DEFAULT_NAME = 'OpenNMS Build Account';
const DEFAULT_EMAIL = 'opennms@opennms.org';

function resolveMaintainer(env = process.env) {
  const name = env.DEBFULLNAME || DEFAULT_NAME;
  const email = env.DEBEMAIL || DEFAULT_EMAIL;

  return name + ' <' + email + '>';
}

module.exports = { resolveMaintainer, DEFAULT_NAME, DEFAULT_EMAIL };
