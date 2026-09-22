'use strict';

// The directories the scripts under scripts/ work from, resolved once from this
// file's own location. They run both directly and through npm scripts
// (`npm run package:*`, `npm run validate-xrefs`), so process.cwd() is not a
// reliable base: it only agreed with the project root while these scripts sat at
// the root, which they no longer do.
//
// Deriving them here rather than in each module means a future move of scripts/ has
// exactly one relative depth to update instead of one per consumer.

const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');

// The debian/ tree make-deb.js copies into the build directory, and the directory
// holding the control template metadata.js renders. Both consumers must agree.
const DEBIAN_DIR = path.join(__dirname, 'deb', 'debian');

module.exports = { PROJECT_DIR, DEBIAN_DIR };
