import { DatasourceMetadata, DsType } from '../types'
import { addVariationsToMap, getDatasourceTypeFromPluginId, isUpdatedDatasourceOfType } from './utils'

// Parse the Dashboard '__inputs' section, extracting any Datasource mappings and
// updating those items to use Version 9 versions
// The 'name' is the name of the variable which may be used elsewhere in queries
// The 'pluginId' should be the datasource ID
// We convert this to use the Version 9 versions, plus save off the variable in the map
// to substitute elsewhere
//
// "__inputs": [
//   {
//     "name": "DS_OPENNMS_PERFORMANCE",
//     "label": "OpenNMS Performance",
//     "description": "",
//     "type": "datasource",
//     "pluginId": "opennms-performance-datasource",
//     "pluginName": "OpenNMS Performance"
//   }
// ]
export const parseInputs = (source: any[], datasourceMap: Map<string,DsType>, dsMetas: DatasourceMetadata[]) => {
  const results: any[] = []

  for (const s of source) {
    if (s.type === 'datasource' && s.pluginId && s.pluginId.startsWith('opennms-')) {
      const target = { ...s }
      const name = s.name
      const pluginId = s.pluginId

      if (name && pluginId) {
        // find corresponding v9 datasource info and substitute
        const { datasourceType } = getDatasourceTypeFromPluginId(pluginId)
        let dsMeta = dsMetas.find(d => isUpdatedDatasourceOfType(d, datasourceType))

        if (!dsMeta) {
          console.log(`Dashboard convert: did not find Version 9 datasource for '${datasourceType}', falling back to first available:`)
          dsMeta = dsMetas.find(d => d.datasourceType && d.datasourceType === datasourceType)
        }

        if (dsMeta) {
          addVariationsToMap(name, datasourceType as DsType, datasourceMap)

          // keep existing name and label if possible, they may distinguish between multiple datasource instances of the same type
          target.label = target.label || dsMeta.name
          target.pluginId = dsMeta.type
          target.pluginName = dsMeta.name

          results.push(target)
          continue
        }
      }
    }

    // was not an OpenNms datasource, or we couldn't find a substitute, so just pass it through
    results.push(s)
  }

  return results
}
