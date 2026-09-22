import { DataSourceInstanceSettings, DataSourceJsonData } from '@grafana/data'
import { DatasourceMetadata, DsType } from '../types'
import { getDatasourceTypeFromPluginId } from './utils'
import { isString } from '../../utils'

// Datasource info found in panel or target/query
export interface SourceDatasourceInfo {
  isOpenNmsDatasource: boolean
  isTemplateVariable: boolean
  datasourceType: string
}

// Get datasource info from either a panel or a target
// Legacy entries e.g. for panels, may be in various forms:
// 1. datasource is a string:
// "panels:" [
//     {
//         "datasource": "opennms-performance-datasource"
//     }
// ]
//
// 2. datasource is an object with type and uid:
//
// "panels:" [
//     {
//         "datasource": {
//             "type": "opennms-performance-datasource",
//             "uid": "ab1z3q4d"
//         }
//     }
// ]
//
// 3. datasource is an object with just uid, and uid is a string or template variable
//
// "panels:" [
//     {
//         "datasource": {
//             "uid": "$datasource"
//         }
//     }
// ]
//
export const getSourceDatasourceInfo = (source: any, datasourceMap: Map<string,DsType>): SourceDatasourceInfo => {
  if (source?.datasource) {
    if (isString(source.datasource) && datasourceMap.has(source.datasource)) {
      // 1. datasource is a string naming a template variable we know about
      const dsType = datasourceMap.get(source.datasource) || ''

      return {
        isOpenNmsDatasource: true,
        isTemplateVariable: true,
        datasourceType: dsType
      }
    } else if (isString(source.datasource)) {
      // 1b. datasource is a bare plugin id, e.g. 'opennms-helm-entity-datasource'.
      // Not a variable, so it resolves to the installed datasource rather than being retained.
      const { datasourceType } = getDatasourceTypeFromPluginId(source.datasource as string)

      if (datasourceType) {
        return {
          isOpenNmsDatasource: true,
          isTemplateVariable: false,
          datasourceType
        }
      }
    } else if (!isString(source.datasource) && source.datasource?.type) {
      // 2. datasource is an object with type, and may also have a template variable as uid
      const { datasourceType } = getDatasourceTypeFromPluginId(source.datasource.type)

      if (datasourceType) {
        const uid: string = source.datasource.uid || ''

        return {
          isOpenNmsDatasource: true,
          isTemplateVariable: uid.startsWith('$'),
          datasourceType
        }
      }
    } else if (!isString(source.datasource) && !source.datasource?.type && source.datasource?.uid) {
      // 3. datasource is an object with uid only
      const uid: string = source.datasource.uid || ''
      const dsType = datasourceMap.get(uid)

      if (dsType) {
        return {
          isOpenNmsDatasource: true,
          isTemplateVariable: uid.startsWith('$'),
          datasourceType: dsType
        }
      }
    }
  }

  return {
    isOpenNmsDatasource: false,
    isTemplateVariable: false,
    datasourceType: ''
  }
}

// extract metadata info we care about from datasourceSrv.getList() call
export const getDatasourceMetadata = (data: Array<DataSourceInstanceSettings<DataSourceJsonData>>) => {
  const metas: DatasourceMetadata[] = []

  for (const ds of data) {
    if (ds.type?.startsWith('opennms-')) {
      const meta = {
        name: ds.name,
        id: ds.id,
        uid: ds.uid,
        type: ds.type,
        version: ds.meta?.info?.version || '',
        pluginVersion: 8,
        datasourceType: undefined
      } as DatasourceMetadata

      if (meta.version) {
        const arr = meta.version.split('.')

        if (arr && arr.length > 0) {
          meta.pluginVersion = Number.parseInt(arr[0], 10)
        }
      }

      const { datasourceType } = getDatasourceTypeFromPluginId(meta.type || '')

      if (datasourceType) {
        meta.datasourceType = datasourceType as DsType
        metas.push(meta)
      }
    }
  }

  return metas
}
