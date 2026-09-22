// Grafana exposes flot to plugins through its SystemJS shared-dependency map
// (see `jQueryFlotDeps` in Grafana's `sharedDependencies.ts`). These modules are
// side-effect only: importing one makes Grafana load flot and patch it onto the
// shared jQuery instance, which is what provides `$.plot`.
//
// Importing them explicitly matters as of grafana/grafana#131346, which drops
// jQuery and flot from Grafana's boot path and loads them on demand instead.
// Before that change flot was always attached to jQuery by the time a plugin
// loaded; after it, a plugin that never imports these gets a jQuery with no
// `.plot`.
declare module 'jquery.flot'
declare module 'jquery.flot.stack'
