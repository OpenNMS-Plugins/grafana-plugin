import alarmHistogramPanel from '../../panels/alarm-histogram/plugin.json'
import alarmTablePanel from '../../panels/alarm-table/plugin.json'
import dashboardConvertPanel from '../../panels/dashboard-convert/plugin.json'
import filterPanel from '../../panels/filter-panel/plugin.json'
import flowHistogramPanel from '../../panels/flow-histogram/plugin.json'
import entityDatasource from '../../datasources/entity-ds/plugin.json'
import flowDatasource from '../../datasources/flow-ds/plugin.json'
import performanceDatasource from '../../datasources/perf-ds/plugin.json'

/**
 * Versions of the OPG datasource and panel plugins, keyed by plugin id.
 *
 * These are the versions Grafana sees at runtime: '__requires[].version' names one of these
 * plugins, not the app, and so does a panel's 'pluginVersion'. They are deliberately NOT the
 * app's version from src/plugin.json, which is a different number ('12.0.2-SNAPSHOT' against
 * the nested plugins' '12'). Writing the app version into either field would claim a minimum
 * that a correctly installed plugin does not meet.
 */
const openNmsPlugins = [
  alarmHistogramPanel,
  alarmTablePanel,
  dashboardConvertPanel,
  filterPanel,
  flowHistogramPanel,
  entityDatasource,
  flowDatasource,
  performanceDatasource
]

const versionsByPluginId = new Map<string, string>(
  openNmsPlugins.map(p => [p.id, String(p.info.version)])
)

/**
 * The version of the OPG plugin with the given id, or undefined if it is not one of ours.
 * Legacy Helm ids ('opennms-helm-alarm-table-panel') resolve to their current equivalent.
 */
export const getOpenNmsPluginVersion = (pluginId?: any): string | undefined => {
  if (typeof pluginId !== 'string' || !pluginId) {
    return undefined
  }

  return versionsByPluginId.get(pluginId) ??
    versionsByPluginId.get(pluginId.replace('opennms-helm-', 'opennms-'))
}
