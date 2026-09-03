# Development Notes

## OPG Version: 12

A place to put various notes that may help in development, or discuss odd behaviors.


## Testing

Unit tests live in `src/test/react/*.spec.ts` and run with `npm test`.

`test/dashboards/` holds dashboards for manual testing against a real Grafana and OpenNMS. They are *not* bundled into the plugin — only `src/dashboards/` is shipped. Import one via **Dashboards → New → Import** and paste the JSON; each prompts for the datasource it needs, so there are no UIDs to edit.

### `opg-521-repeat-test-dashboard.json`

Covers repeating panels and rows over a multi-value template variable (OPG-521). Needs an OpenNMS Performance datasource and an SNMP node reporting `hrStorageIndex` resources.

Select three or more storage volumes, then watch `POST /rest/measurements` in the browser Network tab:

| Panel | Expected |
|-------|----------|
| A. Repeated panel | one request per clone, each with exactly **1** entry in `source` |
| B. Not repeated, multi-value | **one** request with **N** entries in `source`, N series in the one panel |
| C. Repeated row | one request per row clone, each with exactly **1** entry in `source` |

Panel B is the regression guard: a repeat fix that pins the variable too aggressively breaks multi-value fan-out, and the panel count alone will not show it. Checking the `source` array length is what distinguishes fixed from broken — the request *count* looks the same either way, because each clone has always had its own `SceneQueryRunner`.

Also worth running with the picker set to **All**, and with **`?scenes=false`** appended to the dashboard URL, which forces the pre-Scenes renderer on Grafana 12 and exercises the legacy interpolation path. That query parameter is gone in Grafana 13.


## swc/core

Seems to be some errors with grafana libraries and `@swc/core`, you may get `Failed to load native bindings` or similar errors.

Solution for now is to force use of `@swc/core` version `1.3.75`. It seems some incompatibility was introduced in `@swc/core` `1.3.76`.

Should monitor this to see if a solution has been found so we can bump up our `@swc/core` version.

See:

https://community.grafana.com/t/build-a-panel-plugin-error/100984/3



## Packaging layout

Everything that builds a distributable lives under `scripts/`, one directory per artifact
type, and each is driven by an `npm run` script rather than by invoking the file directly:

| Command | Entry point | Inputs alongside it |
| --- | --- | --- |
| `npm run package:rpm` | `scripts/rpm/make-rpm.js` | `spec.mustache` |
| `npm run package:deb` | `scripts/deb/make-deb.js` | `debian/` |
| `npm run package:zip` | `scripts/zip/make-zip.js` | — |

These used to sit at the repository root (`makerpm.js`, `makedeb.js`, `makezip.js`) with their
templates under `src/rpm/` and `src/debian/`. The templates in particular do not belong in
`src/`: webpack sweeps `src/` into `dist` with broad copy globs and `npm run sign` then attests
everything in `dist` into a signed `MANIFEST.txt`, so a packaging input with a matching
extension would ship in the plugin and break the signature. See *Package contents* below.

## make-rpm.js

`make-rpm.js` renders the RPM `spec` file from `scripts/rpm/spec.mustache` and then runs
`rpmbuild`. It is a thin wrapper; the work lives in sibling modules so that it can be unit
tested:

| Module | Responsibility |
| --- | --- |
| `scripts/rpm/spec.js` | Renders `scripts/rpm/spec.mustache` into a spec file |
| `scripts/rpm/archive.js` | Packs the `dist` tree into the source tarball rpmbuild consumes |
| `scripts/rpm/build.js` | Lays out an rpmbuild tree, runs rpmbuild, returns the built rpm |

The `spec` section of `package.json` supplies `specTemplate`, `installDir` and `requires`.

Set `MAKERPM_DEBUG=1` for verbose output, including rpmbuild's own output, when debugging a
CircleCI build.

### Why we no longer use speculate

We previously used `specit`, an unmaintained fork of `bbc/speculate`, and then moved to
`bbc/speculate` itself. **`speculate` 6.x hardcodes its own spec template** (see
[lib/spec.js](https://github.com/bbc/speculate/blob/master/lib/spec.js)) and silently ignores
`spec.specTemplate` and `spec.installDir`. `specit` honoured both; `speculate` does not.

That template is written for a systemd Node service, so the RPM it produced installed the
plugin into `/usr/lib/opennms-grafana-plugin`, created a system user, ran
`systemctl enable` on a nonexistent service unit and required `nodejs` — none of which is
correct for a Grafana plugin, and Grafana never saw the plugin at all. Rather than
post-process someone else's template, we render our own; `speculate` was only contributing a
small `tar-fs` wrapper beyond that, so it was dropped in favour of `mustache` and `tar-fs`
directly.

`speculate/lib/validator` (note: `speculate/validator` is not a valid module path) only checks
that a `package.json` can be required from the directory it is given. That is why it failed
here — it was being handed `dist`, which has no `package.json` — and it tells us nothing that
`make-rpm.js` does not already know, so it is not used.

## make-deb.js

`make-deb.js` stages `dist` with a generated `debian/` directory beside it and runs
`dpkg-buildpackage`. Like the rpm it is a thin wrapper over testable modules:

| Module | Responsibility |
| --- | --- |
| `scripts/deb/build.js` | Stages the build tree, runs dpkg-buildpackage, publishes the deb |
| `scripts/deb/metadata.js` | Renders `debian/control` and the changelog |
| `scripts/deb/maintainer.js` | Resolves the maintainer identity from `DEBFULLNAME`/`DEBEMAIL` |

`Depends` is derived from the same `package.json` `spec.requires` the rpm's `Requires` comes
from, so the two cannot disagree about which Grafana the plugin needs.

The build happens in a directory under the system temp directory, **not** under `artifacts/`.
`dpkg-buildpackage` writes a `.dsc`, a `.changes`, a `.buildinfo` and a source tarball beside
the `.deb`, and only the `.deb` is signed and published; building in `artifacts/` meant CI
stored all of them, and left a full copy of `dist` there whenever a build failed.

Set `MAKEDEB_DEBUG=1` for verbose output, including dpkg-buildpackage's own output.

## make-zip.js

`make-zip.js` stages `dist` into a directory named for the plugin id and zips that directory —
Grafana identifies a plugin by the zip's top-level directory name. `scripts/zip/build.js` holds
the work.

The zip is named with the raw `package.json` version, so a snapshot build keeps its snapshot
suffix in the filename. That is deliberate: the rpm and deb split the version into version and
release because their packaging formats need it for sort order, and a zip has no such
semantics. Keeping the suffix also distinguishes a snapshot from a release, which a bare
version with a release number of 0 would not.

Set `MAKEZIP_DEBUG=1` for verbose output, including zip's own output.

## Shared packaging modules

| Module | Responsibility |
| --- | --- |
| `scripts/paths.js` | `PROJECT_DIR` and `DEBIAN_DIR`, resolved from the file's own location |
| `scripts/packageVersion.js` | Derives version and release from `package.json` (rpm and deb) |
| `scripts/distContents.js` | What belongs in a package built from `dist` (all three) |
| `scripts/stageDist.js` | Copies `dist` into a staging directory, applying that list (deb and zip) |
| `scripts/artifacts.js` | Publishes a built package into `artifacts/` (all three) |

All three builders resolve their paths from `scripts/paths.js` rather than `process.cwd()`, so
they work from any working directory, and each removes its own working tree in a `finally`
rather than only on the success path.


## Package contents

Only the contents of `dist` belong in the package, so the source tarball is rooted at `dist`
and the spec's `%install` copies the archive root. `scripts/distContents.js` lists what never
belongs in a distributable, and is used in two places.

The important one is the build. `npm run build` is followed by `npm run sign`, which walks
`dist` and writes a **signed** `MANIFEST.txt` listing every file it finds. The scaffolded
webpack config copies `src/**/*.json` into `dist` with no ignore list, so the jest fixtures
under `src/test` used to land in `dist/test`, get signed into the manifest, and then be
stripped again by the packaging scripts — leaving a manifest that declared files the package
did not contain, which `@grafana/plugin-validator` rejects. `webpack.config.ts` therefore
applies the list as a `CopyWebpackPlugin` ignore so those files never reach `dist` at all.
`.config/` is scaffolded and webpack-merge concatenates plugin arrays rather than
reconfiguring the existing plugin, so `scripts/webpack/excludeFromCopy.js` reaches into the
`CopyWebpackPlugin` instance. It throws if it cannot find one, because silently not excluding
would break the signature again.

The packaging scripts apply the same list as a second line of defence. That is now redundant
for `test`, but it still matters for the `SPECS`/`SOURCES` directories the RPM build creates
inside `dist` while it runs.

## Packaging tests

`src/test/packaging/` covers all three builders: spec rendering and the source archive for the
rpm, `debian/control` and changelog rendering and build-tree staging for the deb, the shared
`dist` exclusions and staging, and the resolved packaging paths.

The end-to-end tests build a real package from a fixture `dist` and interrogate the result —
`rpm -qp` for the rpm, `unzip -Z1` for the zip. Each skips itself when its tool is not on
`PATH`: `rpmbuild` and `zip` are usually present on a developer machine, `dpkg-buildpackage`
generally is not, so the deb's end-to-end tests skip outside a Debian build host. To run those,
use the CI image:

```bash
docker run --rm -v "$PWD":/work -w /work opennms/build-env:debian-jdk11-b10453 \
  bash -lc './scripts/deb/make-deb.js --release 1'
```

Note that the jest suite is not currently run by `.circleci/config.yml` at all, so every one of
these tests is a local-and-pre-commit check rather than a CI gate.


## grafana/plugin-validator

This is run in `.circleci/config.yml`, `validate-packages` step. `@grafana/plugin-validator` is a package from Grafana that validates plugins.

We have to pass this validation in order for Grafana to accept our plugin and put it on their app store. They may have additional validation, but this at least helps us comply.

The `-config` argument points to a yaml configuration file. One main thing is the `osv-scanner` which runs security vulnerability checks, basically checking everything
in our `package-lock.json` to see if there are CVEs, etc.

If we are temporarily non-compliant but you are trying to just get a build done in CircleCI, you can update `grafana-plugin-validator-config.yaml` as follows:

```
analyzers:
  osv-scanner:
    enabled: false
```

**Make sure** to set this back to `true` before actual production builds.

## osv-scanner

This is a tool that Grafana will run to see if we have any npm libraries with security vulnerabilities, etc. in our Grafana plugin code.

You can run this locally. On a Mac:

```
brew install osv-scanner

# from your main grafana-plugins directory
osv-scanner -L package-lock.json
```

This outputs a table with any possible issues.

If there are any libraries that have something in `FIXED VERSION`, you'll need to make sure to update, include transient dependencies.

## transient dependencies

You may be able to fix some transient dependencies, i.e. some libraries failing the `osv-scanner` but aren't direct dependencies.

Use the `npm overrides` mechanism in the `package.json`. Delete **both** `node_modules` and `package-lock.json`, then rerun `npm install` — regenerating the lockfile alone leaves the already-installed packages in place, npm reuses them, and the new overrides silently do not take effect.

```
"overrides": {
  "opennms": {
    "striptags": "^3.2.0"
  },
  "html-to-formatted-text": {
    "striptags": "^3.2.0"
  }
}
```

## Issue with Grafana, json-source-map and our opennms-js OnmsEnum / toJSON representation
## opennms-js and json-source-map isJSON issue

This is described more fully here: https://github.com/OpenNMS/opennms-js/pull/1118

Just note that if `opennms-js` has any model data classes which have a `toJSON` method (which returns a somewhat more human-readable version of the object), it will also have this fix, meaning the object will also have a fake `.replace()` method on it. Should not cause any issues, but just noting it here.

More details...

This is a bit long-winded, but it was tricky to debug.

There is an issue with how Grafana saves and serializes panel data and our `opennms-js` implementation of `OnmsEnum` 
and derived classes.

In cases where we are using the Grafana `SegmentAsync` dropdown, which has a `loadOptions` function to
load nodes (ultimately via `opennms-js` and to our Rest API), we need to make sure that the `loadNodes` prop receives a
`SelectableValue<T>[]`, e.g. `SelectableValue<PerformanceAttributeItemState>[]`, and
*not* an `OnmsNode[]`.

While `OnmsNode` has an `id` and `label` which `SelectableValue<T>` might be expecting, there's another issue.

When you make a change in a query editor, Grafana saves off the panel state.
Grafana does a `jsonDiff` by serializing the old and new state.
They use the `json-source-map` npm library to stringify objects (recursively) before diffing.

`json-source-map` has a line where if an object has a `toJSON()` function, it uses
it to stringify the object. It expects `toJSON()` to return a `String`.

Our `OnmsEnum`, and derived classes (for example `OnmsManagedType`, used in `OnmsIpInterface.isManaged`,
used in `OnmsNode.ipInterfaces`), has a `toJSON()` function defined, but it returns
an object `{ id: this.i, label: this.l }` instead of a `String`.

The Grafana code then calls `getDashboardChanges`, `getPanelChanges`:

```
  const diff = jsonDiff(originalSaveModel, saveModel);
```

`jsonDiff` calls `jsonMap.stringify()` (`jsonMap` is from `json-source-map`) which calls `_stringify`.

`_stringify` does a check if the item is an object and has a `toJSON` function and calls it.

Then also inside json-source-map:

```
function quoted(str) {
  str = str.replace(ESC_QUOTE, '\\$&')
  ...
```

This throws a `TypeError` since `str` is actually an `OnmsNode`, not a `String`, and does not have a
`replace` function.

```
  case 'object':
    if (_data === null) {
      out('null');
    } else if (typeof _data.toJSON == 'function') {
      out(quoted(_data.toJSON()));
    }
```

See: https://github.com/epoberezkin/json-source-map/blob/master/index.js, `_stringify`.

See: https://github.com/grafana/grafana/blob/main/public/app/features/dashboard-scene/panel-edit/PanelEditor.tsx where `getPanelChanges` is called.

See: https://github.com/grafana/grafana/blob/main/public/app/features/dashboard-scene/saving/getDashboardChanges.ts where the `jsonDiff` occurs.

If we do the conversion from `OnmsNode` to a `SelectableValue<T>`, `json-source-map` will call their `stringifyObject` since
the object does not have a `toJSON`, and it should work correctly.

Example, in `PerformanceQueryEditor.tsx`:

```
const nodes = await datasource.client.findNodes(filter, true)

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
