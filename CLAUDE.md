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

When a package has two major lines live in the tree (e.g. `@xmldom/xmldom` 0.8 and 0.9), use npm's scoped key syntax so neither line is force-upgraded across a major:

```json
"@xmldom/xmldom@^0.8.0": "^0.8.13",
"@xmldom/xmldom@^0.9.0": "^0.9.10"
```

Scoped keys match on the *requested spec*, not the resolved version, so they do not work against an exact pin — `@grafana/ui` requires `uuid` as `"11.1.0"`, which no range key matches. Use a nested override under the parent in that case.

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
- `MAKERPM_DEBUG=1` turns on verbose `make-rpm.js` output for CircleCI debugging
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
