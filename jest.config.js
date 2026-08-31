// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

// i18next prints a Locize marketing notice from init(), which @grafana/i18n and
// @grafana/ui trigger on import. It is suppressed automatically when NODE_ENV is
// 'production', but jest runs with NODE_ENV='test'. i18next removed the notice
// entirely in v26, but @grafana/i18n and @grafana/ui both require i18next ^25.
// https://github.com/i18next/i18next/issues/2407
process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';

const { grafanaESModules, nodeModulesToTransform } = require('./.config/jest/utils');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...require('./.config/jest.config'),
   // Inform jest to only transform specific node_module packages.
   transformIgnorePatterns: [nodeModulesToTransform([...grafanaESModules, 'opennms'])]
};
