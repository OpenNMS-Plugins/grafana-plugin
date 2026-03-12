import { getDataSourceSrv } from '@grafana/runtime'
import { getDatasourceMetadata } from './datasources'
import { parseInputs } from './inputs'
import { parseRequires } from './requires'
import { convertPanels } from './panels'
import { parseTemplating } from './templating'
import { ConvertOptions, ConvertResponse, DsType } from '../types'
import { convertToInt, isDefined, isNonEmptyArray } from '../../parseUtils'

// Convert a Dashboard from HELM v8 to OPG v9 format
export const convertDashboardFromV8 = (sourceJson: string, dashboardTitle: string, options: ConvertOptions): ConvertResponse => {
  let source: any = {}
  
  const dsSrv = getDataSourceSrv()
  const datasources = dsSrv.getList()
  const dsMetas = getDatasourceMetadata(datasources)

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

  // This will be very similar to Grafana Schema Dashboard, but may not be exact
  // Use the convertToV12 functions to convert this to a fully Grafana V12 Dashboard
  // compatible object
  const dashboard: any = {
    ...source
  }

  // find all datasource aliases / template variables
  const datasourceMap = new Map<string,DsType>()
  const inputsArray = source['__inputs'] || []
  const requiresArray = source['__requires'] || []

  const parsedInputs = parseInputs(inputsArray, datasourceMap, dsMetas)

  if (isNonEmptyArray(parsedInputs)) {
    dashboard['__inputs'] = parsedInputs
  }

  const parsedRequires = parseRequires(requiresArray, datasourceMap, dsMetas)

  if (isNonEmptyArray(parsedRequires)) {
    dashboard['__requires'] = parsedRequires
  }

  const templating = source['templating'] || {}
  const parsedTemplating = parseTemplating(templating, datasourceMap, dsMetas)
  dashboard.templating = parsedTemplating

  const panels = source.panels || []
  const convertedPanels = convertPanels(panels, datasourceMap, dsMetas, options.unhideAllQueries, options.convertGraphToTimeSeries)
  dashboard.panels = convertedPanels

  // remove uid, Grafana will create a new unique one when user imports the Dashboard json
  delete dashboard.uid

  if (dashboardTitle) {
    dashboard.title = dashboardTitle
  }

  if (isDefined(source.version)) {
    dashboard.version = convertToInt(source.version, 1)
  } else {
    dashboard.version = 1
  }

  if (options.incrementDashboardVersion) {
    dashboard.version++
  }

  const dashboardJson = JSON.stringify(dashboard, null, 2)

  return {
    dashboardV9: dashboard,
    json: dashboardJson,
    isError: false,
    targetPluginVersion: 9
  } as ConvertResponse
}
