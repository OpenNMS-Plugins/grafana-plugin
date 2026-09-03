# OpenNMS Plugin for Grafana - Development Guide

This is a Grafana application plugin that integrates with OpenNMS® Horizon™ and OpenNMS® Meridian™ to create monitoring dashboards with performance metrics, fault management (alarms), inventory, and NetFlow data.

## Project Structure

This is a **Grafana App Plugin** (`type: "app"`) that includes:
- **3 Data Sources**: Performance (`perf-ds`), Entities (`entity-ds`), Flows (`flow-ds`)
- **5 Custom Panels**: Alarm Table, Alarm Histogram, Dashboard Convert, Filter Panel, Flow Histogram
- **Bundled Dashboards**: Flow Deep Dive, Cortex Flow Deep Dive, Dashboard Converter, About

The app uses Grafana 12.x APIs and depends on the `opennms` npm library for REST API communication.

### Directory Structure

- `src/datasources/` - Three data source plugins (entity-ds, flow-ds, perf-ds)
- `src/panels/` - Five custom panel plugins
- `src/components/` - Root app component and config
- `src/lib/` - Shared utilities including `ClientDelegate` (OpenNMS client wrapper)
- `src/hooks/` - React hooks like `useOpenNMSClient`
- `src/dashboards/` - JSON dashboard definitions
- `src/test/react/` - Jest unit tests (*.spec.ts files)
- `.config/` - Grafana-provided build configuration (do not modify directly)
- `docs/` - Antora documentation source
- `spec/` - RPM spec file templates

## Build, Test, and Lint

### Development
```bash
npm run dev          # Development build with webpack
npm run watch        # Watch mode (alias for start)
npm run start        # Watch mode
npm run server       # Start Grafana via docker-compose
```

### Building
```bash
npm run build        # Production build
npm run sign         # Sign the plugin (requires Grafana signing)
npm run typecheck    # TypeScript type checking
```

### Testing
```bash
# Jest Unit Tests
npm run test         # Run all tests
npm run test:watch   # Watch mode for changed files only
npm run test:ci      # CI mode with max 4 workers

# Run a single test file
npx jest src/test/react/function_formatter.spec.ts

# Run tests matching a pattern
npx jest --testNamePattern="parenthesize"

# E2E Tests (Playwright)
npm run e2e                  # Run Playwright tests
npm run e2e:update           # Update screenshots
```

**Note**: Tests are in `src/test/react/*.spec.ts`, not in a top-level `tests/` directory.

### Linting
```bash
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix issues
```

### Documentation
```bash
npm run docs                # Build Antora docs
npm run validate-xrefs      # Validate cross-references in docs
```

## Architecture

### OpenNMS Client Integration

All data sources use the `opennms` npm library to communicate with OpenNMS REST APIs:

1. **ClientDelegate** (`src/lib/client_delegate.ts`) - Wraps the `opennms.Client` class
   - Handles authentication (basic auth, token decoding)
   - Configures timeout and search limits
   - Uses `Rest.GrafanaHTTP` adapter for Grafana's backend service

2. **useOpenNMSClient Hook** (`src/hooks/useOpenNMSClient.ts`) - React hook to get the client from a datasource reference

3. **Data Source Pattern** - Each datasource (perf-ds, entity-ds, flow-ds) extends Grafana's `DataSourceApi` and includes:
   - `module.ts` - Plugin registration
   - `*DataSource.ts` - Main datasource class with `query()` and `testDatasource()` methods
   - `*QueryEditor.tsx` - Query builder UI
   - `*ConfigEditor.tsx` - Datasource settings UI
   - `types.ts` - TypeScript interfaces
   - `plugin.json` - Plugin metadata

### Panel Plugins

Each panel plugin follows a similar structure:
- `module.ts` - Registers the `PanelPlugin`
- `*Panel.tsx` - Main panel component
- `plugin.json` - Panel metadata

### Key Conventions

#### Avoiding `toJSON()` Serialization Issues

**Critical**: When using `opennms` library models (e.g., `OnmsNode`, `OnmsEnum`, `OnmsManagedType`) in Grafana query editors:

- **Do NOT** pass `OnmsNode[]` or similar model objects directly to `SelectableValue` components
- **Always convert** to plain objects first: `{ id, label, value }` structure

**Why**: Grafana uses `json-source-map` to diff panel state changes. The library expects `toJSON()` to return a `String`, but `opennms` classes return objects, causing runtime errors.

**Example** (from DEVELOPMENT.md):
```typescript
const nodes = await datasource.client.findNodes(filter, true)

// Convert to SelectableValue
const selectableValues: SelectableValue<PerformanceAttributeItemState>[] = nodes.map(n => {
  return {
    id: n.id,
    label: n.label,
    value: {
      id: n.id,
      label: n.label
    }
  }
})

return selectableValues
```

See DEVELOPMENT.md section "opennms-js and json-source-map isJSON issue" for full details.

#### Jest Configuration

- Jest uses `@swc/jest` for fast transpilation
- **Transform ignore patterns**: The `opennms` package is ESM and must be transformed
  ```javascript
  transformIgnorePatterns: [nodeModulesToTransform([...grafanaESModules, 'opennms'])]
  ```
- Timezone is forced to UTC in `jest.config.js` for consistent snapshot testing

#### Webpack Customization

The project extends `.config/webpack/webpack.config` in `webpack.config.ts`:
- Copies datasource help files (`help-README.md` → `README.md`) for Grafana's "?" tooltip
- Replaces `%OPG_DOCS_BASE_URL%` template variable with production docs URL
- Uses `sha256` hash function for output

#### Package Management

- **Node version**: 20.x (see `.nvmrc` and `engines` in package.json)
- **Package manager**: npm 10.8.1
- **Overrides**: Uses npm `overrides` to fix transitive dependency security issues (see DEVELOPMENT.md section on osv-scanner)

#### Configuration Extends Pattern

Do not modify files in `.config/`. Instead:
- ESLint: Edit `eslint.config.mjs` in project root
- TypeScript: Edit `tsconfig.json` in project root
- Jest: Edit `jest.config.js` in project root
- Webpack: Edit `webpack.config.ts` in project root
- Prettier: Edit `.prettierrc.js` in project root

See `.config/README.md` for examples.

## CI/CD (CircleCI)

- **Grafana Plugin Validator**: Runs in `validate-packages` job (see `.circleci/grafana-plugin-validator-config.yaml`)
- **Security Scanning**: Uses `osv-scanner` to check for CVEs in dependencies
- **Build artifacts**: Creates RPM, DEB, and ZIP packages via `npm run package:rpm`,
  `npm run package:deb`, `npm run package:zip` (entry points under `scripts/rpm/`,
  `scripts/deb/`, `scripts/zip/`)
- **Signing**: Plugin must be signed via `@grafana/sign-plugin` for Grafana to load it

### Known Issues

#### swc/core Version Lock

Force use of `@swc/core` version `1.3.75` or compatible. Version `1.3.76+` has incompatibilities with Grafana libraries causing "Failed to load native bindings" errors.

Monitor https://community.grafana.com/t/build-a-panel-plugin-error/100984/3 for resolution.

#### RPM Build Details (scripts/rpm/make-rpm.js)

- Renders `scripts/rpm/spec.mustache` directly with `mustache`; the reusable pieces live
  alongside it under `scripts/` and are tested by `src/test/packaging/`
- Do **not** reintroduce `speculate`: 6.x hardcodes its own systemd-service spec template and
  ignores `spec.specTemplate` / `spec.installDir`, which silently packaged the plugin into
  `/usr/lib` with a bogus service unit instead of into the Grafana plugin directory
- Only includes `dist/` in the RPM (not `node_modules`), minus the entries in
  `scripts/distContents.js`
- Set `MAKERPM_DEBUG=1` for CircleCI debugging

## Support Matrix

- **OpenNMS**: Horizon 33+ or Meridian 2024+
- **Grafana**: 12.0.0+
- **Node.js**: 20.x to <23

## Documentation

Full user documentation is built with Antora and published to https://docs.opennms.com/grafana-plugin/latest/

For development notes and gotchas, see `DEVELOPMENT.md`.
