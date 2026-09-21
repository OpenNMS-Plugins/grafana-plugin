# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A **Grafana App Plugin** (`type: "app"`) that integrates OpenNMS® Horizon™/Meridian™ with Grafana 12.x for monitoring dashboards. It includes 3 data sources, 5 custom panels, and bundled dashboards. The `opennms` npm library handles all REST API communication with OpenNMS.

## Commands

```bash
# Development
npm run dev          # One-time development build
npm run watch        # Watch mode (webpack -w)
npm run server       # Start Grafana via docker-compose

# Production
npm run build        # Production webpack build
npm run typecheck    # TypeScript type checking (tsc --noEmit)

# Testing
npm test             # Run all Jest tests
npm run test:watch   # Watch mode (changed files only)
npx jest src/test/react/function_formatter.spec.ts  # Single test file
npx jest --testNamePattern="parenthesize"           # Tests matching pattern

# Linting
npm run lint         # ESLint
npm run lint:fix     # Auto-fix ESLint issues

# E2E
npm run e2e          # Playwright tests
```

Tests live in `src/test/react/*.spec.ts`.

## Architecture

### Plugin Structure

```
src/
  datasources/
    entity-ds/     # Alarms, nodes, IP/SNMP interfaces, outages, services
    perf-ds/       # Time-series performance metrics
    flow-ds/       # NetFlow v5/v9, IPFIX, sFlow
  panels/
    alarm-table/       # Interactive alarm management table
    alarm-histogram/
    filter-panel/      # Global dashboard filter (uses localStorage for cross-panel state)
    flow-histogram/
    dashboard-convert/
  components/          # Root App and AppConfig components
  lib/                 # Shared utilities
  hooks/               # React hooks
  dashboards/          # Bundled JSON dashboard definitions
```

### OpenNMS Client Layer

Each datasource instantiates two request objects in its constructor:
- **`ClientDelegate`** (`src/lib/client_delegate.ts`) — wraps the `opennms.Client` with `Rest.GrafanaHTTP`, handles auth decoding, timeouts. Used for structured model queries (nodes, alarms, etc.)
- **`SimpleOpenNMSRequest`** (`src/lib/simpleRequest.ts`) — thin wrapper around `getBackendSrv()` for direct REST calls (flows, resources, etc.)

### Data Source Pattern

Each datasource (e.g., `perf-ds`) has:
- `*DataSource.ts` — extends `DataSourceApi`, implements `query()` and `testDatasource()`
- `*QueryEditor.tsx` — query builder UI
- `*ConfigEditor.tsx` — datasource settings UI
- `queries/` — query building logic separated from the datasource class
- `types.ts` — TypeScript interfaces for the datasource

### Filter Panel / Entity DS Cross-Panel State

The Filter Panel stores active filters in **localStorage**. The Entity DS reads these in `query()` via `loadFilterEditorData()` and merges them with the query's own filters using `mergeFilterPanelFilters()`. The dashboard UID is used as the storage key.

## Key Conventions

### Critical: `opennms` Model Objects and `toJSON()`

**Never** pass `OnmsNode[]`, `OnmsEnum`, or other `opennms` model objects directly to Grafana `SelectableValue` components. Grafana uses `json-source-map` to diff panel state; it expects `toJSON()` to return a `String`, but `opennms` models return objects — causing runtime `TypeError`.

Always convert to plain objects:
```typescript
const selectableValues = nodes.map(n => ({
  id: n.id,
  label: n.label,
  value: { id: n.id, label: n.label }
}))
```

### Config Extension Pattern

Do **not** modify files in `.config/`. Override at the root level:
- ESLint → `eslint.config.mjs`
- TypeScript → `tsconfig.json`
- Jest → `jest.config.js`
- Webpack → `webpack.config.ts` (merges with `.config/webpack/webpack.config`)

### Webpack: Help README Copying

`webpack.config.ts` copies `datasources/*/help-README.md` → `README.md` in `dist/`. The `help-README.md` files are the end-user-facing docs shown in Grafana's "?" tooltip; the top-level `README.md` is developer-facing.

### Jest: ESM Transform

The `opennms` package is ESM and must be included in the transform list:
```javascript
transformIgnorePatterns: [nodeModulesToTransform([...grafanaESModules, 'opennms'])]
```

### Security: `npm overrides`

Transitive dependency CVEs are fixed via `overrides` in `package.json`. To fix a new transient dep vulnerability, add an entry under `overrides`, then:

```bash
rm -rf node_modules package-lock.json && npm install
osv-scanner -L package-lock.json
```

**Delete `node_modules` too, not just the lockfile.** Regenerating the lockfile alone leaves already-installed packages in place, so npm reuses them and the new overrides silently fail to take effect — you get a lockfile that does not match `overrides`.

When a package has two major lines live in the tree (e.g. `picomatch` 2.x and 4.x), use npm's scoped key syntax so neither line is force-upgraded across a major:

```json
"picomatch@^2.0.0": "^2.3.2",
"picomatch@^4.0.0": "^4.0.4"
```

Scoped keys match on the *requested spec*, not the resolved version, so they do not work against an exact pin — `@grafana/ui` requires `uuid` as `"11.1.0"`, which no range key matches. Use a nested override under the parent in that case:

```json
"react-router-dom-v5-compat": {
  "react-router": "^7.18.0"
}
```

That one is load-bearing: `react-router-dom-v5-compat` hard-pins `react-router` to exactly `6.30.6`, the last of a line with two unpatched CVEs and no 6.x fix. The nested override collapses it onto the root `react-router@7`. It also has to stay aligned with whatever major the root `react-router-dom` is on — when the override sat on `^6` while the root was on `^7`, a from-scratch resolution produced a lockfile that `npm install` accepted and `npm ci` rejected.

Re-check scoped keys when the tree moves: an override whose spec no longer matches any requester is silently inert, not an error. `@xmldom/xmldom` had 0.8 and 0.9 lines live until `x2js` 3.4.5 moved to `^0.9.12`, which left the 0.8 scoped key matching nothing.

A full reinstall also re-resolves every `^` range, so it can surface breakage unrelated to the CVE work. Run `npm run build`, `npm run dev`, `npm test` and `npm run typecheck` afterwards — `npm run build` in particular is the only one that exercises `webpack.config.ts` through ts-node.

## CI/CD Notes

- CI runs `@grafana/plugin-validator` with `grafana-plugin-validator-config.yaml`
- `osv-scanner` checks CVEs in `package-lock.json`; to temporarily disable: set `osv-scanner.enabled: false` in the config yaml (revert before production builds)
- Build artifacts are RPM/DEB/ZIP via `npm run package:rpm|deb|zip`. Everything packaging
  lives under `scripts/` — `scripts/rpm/` (`make-rpm.js`, `spec.mustache`), `scripts/deb/`
  (`make-deb.js`, `debian/`), `scripts/zip/` (`make-zip.js`) — and is tested by
  `src/test/packaging/`. Packaging inputs must **not** move back under `src/`: webpack sweeps
  `src/` into `dist` and `npm run sign` attests everything in `dist`
- CI invokes the `npm run package:*` scripts, so entry-point paths are not hardcoded in
  `.circleci/config.yml`
- `MAKERPM_DEBUG=1` / `MAKEDEB_DEBUG=1` / `MAKEZIP_DEBUG=1` turn on verbose output for
  CircleCI debugging. Each entry point is a thin wrapper; the work lives in a sibling
  `build.js` that takes paths as arguments so it can be tested against a fixture `dist`
- CI executors: `make-rpm` runs on `rockylinux/rockylinux:9` and `make-deb` on
  `node:22-trixie`; `make-tarball`/`make-zip` need only node, `tar` and `zip` and run on
  `node-executor`. `opennms/build-env` is **not** an option any more — its newest
  RHEL-family tag is CentOS 8 with Node 16 and its newest Debian tag is bullseye with
  Node 18, both far below this repo's `engines` (`>=22 <25`). Neither image carries a
  JDK, because nothing in this pipeline uses Java
- `sign-packages/install-deb-dependencies` pins
  `-o Dir::Etc::sourcelist=sources.list -o Dir::Etc::sourceparts=-`, and Debian 12+ ships
  its sources as deb822 in `/etc/apt/sources.list.d/debian.sources` with no
  `/etc/apt/sources.list` at all. On its own the orb step therefore refreshes nothing and
  fails with "Unable to locate package debsigs". `make-deb` runs a plain `apt-get update`
  first (it needs `debhelper` anyway); the orb passes `-o APT::Get::List-Cleanup=0`, so
  those lists survive into its own call. Do not drop that step
- `build-docs` runs on `node-executor` and takes Antora from this repo's own `@antora`
  devDependencies, so it **must install them itself**: the job requires only `pre-build`,
  which checks out and never runs `npm ci`. That did not matter while the antora image
  carried Antora globally, and it is why the first attempt failed in CI with
  `spawnSync .../node_modules/.bin/antora ENOENT` while passing locally against a tree
  that already had `node_modules`. Verify docs changes against a clean clone, not the
  working tree. There is deliberately no `docs-executor`: every `opennms/antora` tag,
  newest included, is Alpine 3.18 on **Node 16**, and Antora 3.2 requires Node >= 20, so
  that image cannot run current Antora at all. Do **not** reintroduce it. The symptom it
  produced was `diagChan.tracingChannel is not a function` out of `pino` — the CLI
  resolves `@antora/site-generator` from the playbook directory first, so the image's
  Node 16 loaded the repo's own copy and died in its `pino@10` (Node >= 20) dependency.
  Both the image bundle and the repo tree must therefore stay on the same Node
- `@antora/xref-validator` is **not** on npmjs.org — only a GitLab tarball — so it cannot
  be a devDependency. `npm run validate-xrefs` installs it itself, into `.antora-tools/`
  (gitignored) and pinned to a commit rather than `main`, which has not moved since 2022.
  `build-docs` just calls that script, so the pinned commit lives in exactly one place.
  Two flags in it are load-bearing — `--omit=optional`, and the
  `--log-failure-level=warn` covered under strictness below:
  - `--omit=optional`: the validator declares `@antora/*` as `optionalDependencies` on a
    floating `^3.0.0-alpha.1` range, so installing them gives it a second Antora that can
    drift from the lockfile's. Omitted, its bare `require`s fall through to
    `./node_modules` and it validates with the same Antora that `npm run docs` generates
    with. Verified via `require.resolve`, not assumed
  Xref validation is **strict**, and getting there took two steps because
  `--log-failure-level` alone cannot express it:
  - Antora's default `failure_level` is **`fatal`**, so even a `target of xref not
    found` (logged at `error`) exited **0**. Both `validate-xrefs` and `docs` now pass
    `--log-failure-level=warn`, which covers warn and above — including missing images
    and includes, not just xrefs. Note these are options of the **`generate`
    subcommand**: placed before it, Antora reads them as stray positional arguments and
    dies with "too many arguments for 'generate'"
  - Asciidoctor reports a dangling *internal* reference — `<<some-anchor>>` where that
    anchor is not on the page — at **`info`**, and `failure_level` accepts only
    warn/error/fatal/none, so that class can never fail on Antora's exit code alone.
    `scripts/docs/validateXrefs.js` wraps the validator, runs it at
    `--log-level=info --log-format=json`, and fails on any reference message whatever
    level it was logged at. `collectProblems` is exported and covered by
    `src/test/docs/validate_xrefs.spec.ts`. This is the gap that let
    `getting_started/importing.adoc` link to `#upgrade-dashboards` — an anchor on
    `installation/upgrading.adoc` — while CI stayed green
- `<<module:page.adoc#anchor, text>>` **is** valid in Antora and resolves to a proper
  cross-page link; a static "is this anchor on this page" check flags those as broken and
  is wrong. What is actually broken is a bare `<<anchor>>` naming an anchor on a
  *different* page: it renders as `href="#anchor"` and goes nowhere. Prefer
  `xref:module:page.adoc#anchor[text]` for anything cross-page
- Antora validates the page half of an xref target and **never** the `#anchor` half, so
  `xref:installation:upgrading.adoc#typo[]` resolves the page, renders a link to nowhere
  and reports nothing at any log level. `scripts/docs/validateAnchors.js` covers that,
  and `build-docs` runs it as a third step because it reads the site `npm run docs`
  builds. It works on the **generated HTML**, not the AsciiDoc source, and deliberately
  so: anchors come from auto-generated section ids (subject to `idprefix`/`idseparator`),
  `[[x]]`, `[#x]`, block ids and discrete headings, so deriving them from source means
  reimplementing Asciidoctor — which reports good links as broken. The rendered `id`
  attributes are ground truth. It checks whole pages rather than scoping to `<article>`,
  which would couple it to the UI bundle's markup and silently check nothing if a future
  bundle renamed that element; every fragment link outside `<article>` in this site is a
  bare `href="#"` navbar toggle, which is skipped anyway
- The docs UI bundle comes from `OpenNMS/antora-ui-opennms` (v3.1.1), matching
  `antora-playbook-local.yml` in the main OpenNMS repo. The old
  `opennms-forge/antora-ui-opennms` bundle is a different repo whose newest release is
  v3.1.0 from 2022. The bundle is only presentation assets — it has no bearing on the
  Node/Antora version problem above
- Rocky 9 carries no `nodejs`, so `make-rpm` installs `nodejs npm rpm-build` explicitly
  (`rpm-sign` comes from the signing orb). `tar`, which the spec's `%setup` shells out
  to, needs no listing: it is in the base image *and* a declared dependency of
  `rpm-build`. An earlier version of this note claimed the opposite, because the probe
  used `which` — which Rocky 9 does **not** ship — so `which tar` failed and read as a
  missing tar. Probe for binaries with `command -v`, never `which`. The orb's
  `.rpmmacros` forces a bzip2 payload (`w0.bzdio`), which keeps the RPM installable on
  older rpm than el9's zstd default would
- The deb builds under the system temp directory, never under `artifacts/`.
  `dpkg-buildpackage` writes a `.dsc`, `.changes`, `.buildinfo` and source tarball beside the
  `.deb`, and only the `.deb` is signed and published; building in `artifacts/` shipped all of
  them to CI and left a full copy of `dist` there on failure. Each builder cleans its working
  tree in a `finally`, not on the success path only
- `make-rpm.js` renders `scripts/rpm/spec.mustache` itself. Do **not** reintroduce `speculate`: 6.x
  hardcodes its own systemd-service spec template and ignores `spec.specTemplate` /
  `spec.installDir`, which silently packaged the plugin into `/usr/lib` with a bogus service
  unit. `src/test/packaging/rpm_spec.spec.ts` guards against this
- The spec template must use triple-stache (`{{{ }}}`): mustache escapes `/` as `&#x2F;`,
  which would mangle every path in the spec
- `scripts/distContents.js` is the single list of what never belongs in a distributable. The
  scaffolded webpack config copies `src/**/*.json` into `dist` with no ignore list, which used
  to drag the jest fixtures under `src/test` into `dist/test`; `webpack.config.ts` now adds
  that list as a `CopyWebpackPlugin` ignore. This matters because `npm run sign` walks `dist`
  and writes a **signed** `MANIFEST.txt` — anything in `dist` gets attested, and stripping it
  at packaging time leaves the manifest declaring files the package does not contain, which
  fails `@grafana/plugin-validator`. Keep things out of `dist`; do not strip them later

## Support Matrix

- **Grafana**: 12.0.0+
- **OpenNMS**: Horizon 33+ or Meridian 2024+
- **Node.js**: 22.x (>=22 <25)
