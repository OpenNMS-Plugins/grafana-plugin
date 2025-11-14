import { convertLegacyAlarmTablePanel, isLegacyAlarmTablePanel } from './alarmTablePanel'
import { convertLegacyAlarmHistogramPanel, isLegacyAlarmHistogramPanel } from './alarmHistogramPanel'
import { convertLegacyFlowHistogramPanel, isLegacyFlowHistogramPanel } from './flowHistogramPanel'
import { convertLegacyGraphToTimeSeriesPanel, isLegacyGraphPanel } from './graphToTimeSeriesPanel'
import { getSourceDatasourceInfo } from './datasources'
import { updateEntityQuery } from './entityDs'
import { convertLegacyFilterPanel, isLegacyFilterPanel } from './filterPanel'
import { updateFlowQuery } from './flowDs'
import { updatePerformanceQuery } from './performanceDs'
import { DatasourceMetadata, DsType } from '../types'
import { updateTargetDatasource } from './utils'

// Convert Dashboard panels
// If panel has a legacy datasource, convert the query to use the new schema
// Then convert any OpenNMS panels
export const convertPanels = (panels: any[], datasourceMap: Map<string, DsType>, dsMetas: DatasourceMetadata[],
  unhideAllQueries: boolean, convertGraphToTimeSeries?: boolean) => {

  const convertedPanels: any[] = []

  for (const p of panels) {
    let panel = { ...p }

    convertPanelDatasources(panel, datasourceMap, dsMetas, unhideAllQueries)

    if (isLegacyFilterPanel(panel)) {
      panel = convertLegacyFilterPanel(panel, datasourceMap, dsMetas)
    } else if (isLegacyAlarmTablePanel(panel)) {
      panel = convertLegacyAlarmTablePanel(panel)
    } else if (isLegacyAlarmHistogramPanel(panel)) {
      panel = convertLegacyAlarmHistogramPanel(panel)
    } else if (isLegacyFlowHistogramPanel(panel)) {
      panel = convertLegacyFlowHistogramPanel(panel)
    } else if (isLegacyGraphPanel(panel) && convertGraphToTimeSeries) {
      panel = convertLegacyGraphToTimeSeriesPanel(panel)
    }

    // recursively process panel panels
    if (panel.panels) {
      panel.panels = convertPanels(panel.panels, datasourceMap, dsMetas, unhideAllQueries)
    }

    convertedPanels.push(panel)
  }

  return convertedPanels
}

const convertPanelDatasources = (panel: any, datasourceMap: Map<string, DsType>, dsMetas: DatasourceMetadata[],
  unhideAllQueries: boolean) => {

  // p.datasource could be:
  // - a template variable like '$datasource' which points to an OpenNMS DS
  //    in which case we leave as-is
  // - an object like { type, uid }, which points to an OpenNMS DS, in which case we update it to version 9
  // - an object like { uid }, which contains an OpenNMS DS type or template variable, in which case we leave it alone
  // - either of those which points to a non-OpenNMS DS, in which case leave as-is
  // - empty/null/undefined, in which case DS should be in the individual targets, leave as-is
  const panelDsInfo = getSourceDatasourceInfo(panel, datasourceMap)

  updateTargetDatasource(panel, panelDsInfo, dsMetas)

  if (panel.targets) {
    const targets: any[] = []

    for (const t of panel.targets) {
      let updatedTarget = { ...t }

      const targetDsInfo = getSourceDatasourceInfo(t, datasourceMap)
      const isOpenNmsDatasource = panelDsInfo.isOpenNmsDatasource || targetDsInfo.isOpenNmsDatasource
      const dsType = panelDsInfo.datasourceType || targetDsInfo.datasourceType

      if (isOpenNmsDatasource) {
        switch (dsType) {
          case 'entity':
            updatedTarget = updateEntityQuery(t)
            break
          case 'performance':
            updatedTarget = updatePerformanceQuery(t)
            break
          case 'flow':
            updatedTarget = updateFlowQuery(t)
            break
          default: break
        }

        if (unhideAllQueries) {
          updatedTarget.hide = false
        }

        updateTargetDatasource(updatedTarget, targetDsInfo, dsMetas)
      }

      targets.push(updatedTarget)
    }

    // TODO: if p.datasource is a pluginId

    panel.targets = targets
  }
}
