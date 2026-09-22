import { DataSourceInstanceSettings, DataSourceJsonData } from '@grafana/data'

/**
 * Test double for the subset of Grafana's DataSourceSrv that the v8 converter uses.
 *
 * convertDashboardFromV8 calls getDataSourceSrv().getList() and hands the result to
 * getDatasourceMetadata, which only looks at name, id, uid, type and meta.info.version.
 * The version matters: isUpdatedDatasourceOfType treats a major version of 9 or above as
 * an "updated" (v9+) datasource, which is what a v8 plugin id gets rewritten to.
 */
const datasource = (name: string, id: number, uid: string, type: string, version: string) => {
  return {
    name,
    id,
    uid,
    type,
    meta: { info: { version } }
  } as unknown as DataSourceInstanceSettings<DataSourceJsonData>
}

export const fakeOpenNmsDatasources = [
  datasource('OpenNMS Entities', 1, 'onms-entity', 'opennms-entity-datasource', '12.0.2'),
  datasource('OpenNMS Performance', 2, 'onms-perf', 'opennms-performance-datasource', '12.0.2'),
  datasource('OpenNMS Flows', 3, 'onms-flow', 'opennms-flow-datasource', '12.0.2'),
  datasource('Prometheus', 4, 'prom-1', 'prometheus', '12.0.0')
]

export const fakeDataSourceSrv = {
  getList: () => fakeOpenNmsDatasources
}
