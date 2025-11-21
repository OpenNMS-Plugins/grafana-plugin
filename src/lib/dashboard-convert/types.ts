import { Dashboard } from '@grafana/schema'

export type DsType = 'entity' | 'performance' | 'flow'

export interface DatasourceMetadata {
  /** Human-friendly name of datasource, e.g. "OpenNMS Entity" */
  name: string

  /** Grafana integer id of this datasource */
  id: number

  /** Grafana uid of this datasource, e.g. "xT5Xzsq7z" */
  uid: string

  /** e.g. 'opennms-entity-datasource */
  type: string

  /** raw version string, from plugin.json info.version
   * probably '9' for Version 9.x, '' for anything previous */
  version: string

  /** e.g. 8 or 9 */
  pluginVersion: number

  /** 'entity', 'performance', 'flow' */
  datasourceType?: DsType
}

export interface ConvertResponse {
  dashboardV9?: any
  dashboardV12?: Dashboard
  json: string
  isError: boolean
  errorMessage?: string
  targetPluginVersion: number // 9 or 12
  // version: string    // '9' or '12'
}

export interface ConvertOptions {
  incrementDashboardVersion: boolean
  unhideAllQueries: boolean
  convertGraphToTimeSeries: boolean
}
