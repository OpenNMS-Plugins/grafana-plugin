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

Transitive dependency CVEs are fixed via `overrides` in `package.json`. To fix a new transient dep vulnerability, add an entry under `overrides`, delete `package-lock.json`, and re-run `npm install`. Run `osv-scanner -L package-lock.json` to check.

## CI/CD Notes

- CI runs `@grafana/plugin-validator` with `grafana-plugin-validator-config.yaml`
- `osv-scanner` checks CVEs in `package-lock.json`; to temporarily disable: set `osv-scanner.enabled: false` in the config yaml (revert before production builds)
- Build artifacts are RPM/DEB/ZIP via `makerpm.js`, `makedeb.js`, `makezip.js`
- `makerpm.js` has `const isDebug = false` — set `true` for CircleCI debugging

## Support Matrix

- **Grafana**: 12.0.0+
- **OpenNMS**: Horizon 33+ or Meridian 2024+
- **Node.js**: 22.x (>=22 <25)
