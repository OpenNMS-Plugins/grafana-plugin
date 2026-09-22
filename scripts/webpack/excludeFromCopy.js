'use strict';

// The scaffolded Grafana webpack config copies `src/**/*.json` (and svg/png/html) into
// dist with no ignore list, which drags the jest fixtures under src/test along with
// them. The config is not ours to edit (.config/ is scaffolded), and webpack-merge
// concatenates plugin arrays rather than reconfiguring the existing plugin, so we
// reach into the CopyWebpackPlugin instance and add the ignore list to its patterns.

function isCopyPluginWithPatterns(plugin) {
  return Boolean(
    plugin && plugin.constructor && plugin.constructor.name === 'CopyPlugin' && Array.isArray(plugin.patterns)
  );
}

function applyCopyIgnore(plugins, ignore) {
  const copyPlugins = (plugins || []).filter(isCopyPluginWithPatterns);

  if (copyPlugins.length === 0) {
    // `patterns` is not documented API. Fail the build rather than quietly stop
    // excluding, which would put the fixtures back into dist and invalidate the
    // signed MANIFEST.txt again.
    throw new Error(
      'webpack.config.ts: no CopyPlugin with a `patterns` array found in the base config. ' +
        'copy-webpack-plugin has probably changed; update scripts/webpack/excludeFromCopy.js.'
    );
  }

  copyPlugins.forEach((plugin) => {
    plugin.patterns = plugin.patterns.map((pattern) => {
      const globOptions = Object.assign({}, pattern.globOptions);

      globOptions.ignore = (globOptions.ignore || []).concat(ignore);

      return Object.assign({}, pattern, { globOptions });
    });
  });

  return plugins;
}

module.exports = { applyCopyIgnore };
