import { getSourceDatasourceInfo } from './datasources'
import { DatasourceMetadata, DsType } from '../types'
import { updateTargetDatasource } from './utils'
import { isDefinedObject, isNonEmptyArray } from '../../parseUtils'

// Convert the datasource of each annotation query, the same way panels and their targets are done.
// An annotation is one of the four places a datasource ref lives, and it can name an OpenNMS
// datasource by legacy plugin id or by template variable, so it needs the same rewrite. Without
// this the legacy id survives into v12 as the uid of a plugin that does not exist there.
export const convertAnnotations = (annotations: any, datasourceMap: Map<string, DsType>,
  dsMetas: DatasourceMetadata[]) => {

  if (!isDefinedObject(annotations) || !isNonEmptyArray(annotations.list)) {
    return annotations
  }

  return {
    ...annotations,
    list: annotations.list.map((a: any) => {
      if (!isDefinedObject(a)) {
        return a
      }

      const annotation = { ...a }
      const dsInfo = getSourceDatasourceInfo(annotation, datasourceMap)

      updateTargetDatasource(annotation, dsInfo, dsMetas)

      return annotation
    })
  }
}
