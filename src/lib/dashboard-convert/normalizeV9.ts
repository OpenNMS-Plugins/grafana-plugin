import { ConvertOptions, ConvertResponse } from './types'
import { convertToInt, isDefined } from '../parseUtils'

/**
 * Normalize a Dashboard that is already in OPG v9 format so that it can be re-imported.
 * No element conversion is performed; the datasources, panels and queries are already v9.
 * We only do the housekeeping that makes the Json safe to import as a new Dashboard:
 * strip the uid, optionally retitle, and set/increment the version.
 */
export const normalizeDashboardV9 = (sourceJson: string, dashboardTitle: string,
  options: ConvertOptions): ConvertResponse => {

  let source: any

  try {
    source = JSON.parse(sourceJson)
  } catch (e: any) {
    return {
      json: '',
      isError: true,
      errorMessage: `Error parsing source Json: ${e.message || '(unknown)'}`,
      targetPluginVersion: 9
    }
  }

  const dashboard: any = { ...source }

  // remove uid, Grafana will create a new unique one when user imports the Dashboard json
  delete dashboard.uid

  if (dashboardTitle) {
    dashboard.title = dashboardTitle
  }

  dashboard.version = isDefined(source.version) ? convertToInt(source.version, 1) : 1

  if (options.incrementDashboardVersion) {
    dashboard.version++
  }

  return {
    dashboardV9: dashboard,
    json: JSON.stringify(dashboard, null, 2),
    isError: false,
    targetPluginVersion: 9
  }
}
