#!/usr/bin/env node

'use strict';

// Checks that every in-page anchor the built docs link to actually exists.
//
// Antora validates the *page* half of an xref target and never the `#anchor`
// half, so `xref:installation:upgrading.adoc#typo[]` resolves the page, renders a
// link to nowhere and reports nothing -- at any log level. That is the last silent
// class of broken reference, and scripts/docs/validateXrefs.js cannot see it.
//
// This works on the generated HTML rather than the AsciiDoc source on purpose.
// Anchors come from auto-generated section ids (subject to idprefix/idseparator),
// `[[x]]`, `[#x]`, block ids and discrete headings; deriving that set from source
// means reimplementing Asciidoctor, and getting it wrong reports links that are in
// fact perfectly good. The rendered `id` attributes are ground truth.
//
// Run it after `npm run docs`, which is what produces the site it reads.

const fs = require('fs');
const path = require('path');

const { PROJECT_DIR } = require('../paths');

const DEFAULT_SITE_DIR = path.join(PROJECT_DIR, 'public');

// The UI bundle's assets. No pages, and its ids are not ours to police.
const UI_ASSET_DIR = '_';

// Anything with a scheme (http:, https:, mailto:, tel:, javascript:) or
// protocol-relative is not a link into the built site.
const HAS_SCHEME = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

// Asciidoctor generates these itself, in matched pairs; they are not authored.
const GENERATED_FRAGMENT = /^_footnote(?:def|ref)_\d+$/;

function collectIds(html) {
  const ids = new Set();

  for (const match of html.matchAll(/\sid="([^"]*)"/g)) {
    if (match[1] !== '') {
      ids.add(match[1]);
    }
  }

  // `name` counts only on <a>. Harvesting it everywhere makes every page's
  // <meta name="description">, <meta name="generator"> and <meta name="viewport">
  // into anchors, so `#description` -- a plausible typo for a section whose real id
  // is `_description` -- resolves silently on all 26 pages. Asciidoctor emits `id`
  // for anchors; `<a name=>` is only here for hand-written passthrough HTML.
  for (const match of html.matchAll(/<a\s[^>]*\bname="([^"]*)"/g)) {
    if (match[1] !== '') {
      ids.add(match[1]);
    }
  }

  return ids;
}

function extractAnchorLinks(html) {
  const links = [];

  for (const match of html.matchAll(/\shref="([^"]*)"/g)) {
    if (match[1].includes('#')) {
      links.push(match[1]);
    }
  }

  return links;
}

// Returns the file the fragment must live in and the fragment itself, or null when
// the link is not ours to check.
function resolveTarget(pageFile, href) {
  if (HAS_SCHEME.test(href)) {
    return null;
  }

  const hashAt = href.indexOf('#');
  const relative = href.slice(0, hashAt);
  const raw = href.slice(hashAt + 1);

  // `href="#"` is a chrome affordance (dropdown toggles), not a reference.
  if (raw === '') {
    return null;
  }

  let fragment = raw;

  try {
    fragment = decodeURIComponent(raw);
  } catch {
    // A fragment that is not valid percent-encoding is still worth checking as
    // written, so fall through with the raw value rather than skipping the link.
  }

  if (GENERATED_FRAGMENT.test(fragment)) {
    return null;
  }

  // A root-relative href is resolved against the published site URL, not the output
  // directory. Antora writes `/grafana-plugin/_/css/site.css` for a file that lives at
  // <siteDir>/_/css/site.css, because site.url contributes the `/grafana-plugin`
  // prefix. So resolving one against the page escapes siteDir entirely, and resolving
  // it against siteDir keeps a prefix that is not a directory -- both report a correct
  // link as broken. Mapping it properly needs site.url, which this script deliberately
  // does not read. Antora emits these for UI assets and the 404 page and never with a
  // fragment, so skip rather than guess.
  if (relative.startsWith('/')) {
    return null;
  }

  let file;

  if (relative === '') {
    file = pageFile;
  } else if (relative.endsWith('/')) {
    file = path.resolve(path.dirname(pageFile), relative, 'index.html');
  } else {
    file = path.resolve(path.dirname(pageFile), relative);
  }

  return { file, fragment };
}

function listHtmlFiles(dir) {
  const files = [];

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== UI_ASSET_DIR) {
          walk(full);
        }
      } else if (entry.name.endsWith('.html')) {
        files.push(full);
      }
    }
  };

  walk(dir);

  return files.sort();
}

function findBrokenAnchors(siteDir = DEFAULT_SITE_DIR) {
  if (!fs.existsSync(siteDir)) {
    throw new Error(
      'validate-anchors: no built site at ' + siteDir + ' -- run `npm run docs` first'
    );
  }

  const pages = listHtmlFiles(siteDir);
  const idCache = new Map();
  const problems = [];
  let checked = 0;

  const idsIn = (file) => {
    if (!idCache.has(file)) {
      if (fs.existsSync(file)) {
        idCache.set(file, collectIds(fs.readFileSync(file, 'utf-8')));
      } else {
        idCache.set(file, null);
      }
    }

    return idCache.get(file);
  };

  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf-8');

    for (const href of extractAnchorLinks(html)) {
      const target = resolveTarget(page, href);

      if (target === null) {
        continue;
      }

      checked += 1;

      const ids = idsIn(target.file);

      if (ids === null) {
        problems.push({
          page,
          href,
          reason: 'target page not found: ' + path.relative(siteDir, target.file)
        });
      } else if (!ids.has(target.fragment)) {
        problems.push({
          page,
          href,
          reason:
            'no id="' +
            target.fragment +
            '" in ' +
            (target.file === page ? 'this page' : path.relative(siteDir, target.file))
        });
      }
    }
  }

  return { problems, checked, pages: pages.length };
}

function main() {
  const siteDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SITE_DIR;

  let result;

  try {
    result = findBrokenAnchors(siteDir);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (result.problems.length) {
    console.error(
      'validate-anchors: ' +
        result.problems.length +
        ' broken anchor link(s) in ' +
        result.pages +
        ' pages:'
    );

    for (const problem of result.problems) {
      console.error(
        '  ' +
          path.relative(siteDir, problem.page) +
          '  ->  ' +
          problem.href +
          '\n      ' +
          problem.reason
      );
    }

    process.exit(1);
  }

  console.log(
    'validate-anchors: ' +
      result.checked +
      ' anchor links across ' +
      result.pages +
      ' pages, all resolved'
  );
}

if (require.main === module) {
  main();
}

module.exports = { collectIds, extractAnchorLinks, resolveTarget, findBrokenAnchors };
