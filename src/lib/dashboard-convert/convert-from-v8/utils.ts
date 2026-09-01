import { SourceDatasourceInfo } from './datasources';
import { DatasourceMetadata, DsType } from '../types'
import { isTemplateVariableCandidate } from '../../utils'

// add 'name', '$name', '${name}' and '[[name]]' variations.
// All three spellings are valid in a dashboard, and a v8 dashboard exported from Grafana 8 may
// use any of them. Missing one means getSourceDatasourceInfo reports the panel as non-OpenNMS,
// so the v8 query is never converted and the raw v8 target survives into the output.
export const addVariationsToMap = (varName: string, dsType: DsType,  datasourceMap: Map<string,DsType>) => {
  // the regex must be global: replaceAll throws a TypeError on a non-global RegExp
  const rawName = varName.replaceAll(/[${}[\]]/g, '')

  datasourceMap.set(rawName, dsType)
  datasourceMap.set('$' + rawName, dsType)
  datasourceMap.set('${' + rawName + '}', dsType)
  datasourceMap.set('[[' + rawName + ']]', dsType)
}

// Grafana accepts three spellings of a variable reference. isTemplateVariableCandidate covers
// the two '$' forms only, and is paired elsewhere with extractRawVariableName, which cannot
// parse the '[[name]]' form, so this check stays local rather than widening the shared helper.
const isVariableReference = (value: string) => {
  const trimmed = value.trim()

  return isTemplateVariableCandidate(trimmed) || (trimmed.startsWith('[[') && trimmed.endsWith(']]'))
}

// returns a string which is one of the DsTypes or else empty string, and
// whether this is a "legacy" datasource or not (legacy is version < 9)
export const getDatasourceTypeFromPluginId = (pluginId: string) => {
  const legacyMatch = pluginId.match(/^opennms-helm-([^-]+)-datasource$/i)

  if (legacyMatch && legacyMatch.length > 0) {
    return {
      isLegacy: true,
      datasourceType: legacyMatch[1]
    }
  }

  const m = pluginId.match(/^opennms-([^-]+)-datasource$/i)

  if (m && m.length > 0) {
    return {
      isLegacy: false,
      datasourceType: m[1]
    }
  }

  return {
    isLegacy: false,
    datasourceType: ''
  }
}

export const getDashboardTitle = (json: string) => {
  try {
    const dashboard = JSON.parse(json)
    return dashboard?.title || ''
  } catch {
  }

  return ''
}

// Returns true if the given datasource is of the given type and is an 'updated'
// one, i.e. version 9-12 (as opposed to OPG v8).
// dsType is 'entity', 'performance', 'flows'
export const isUpdatedDatasourceOfType = (d: DatasourceMetadata, dsType: string) => {
  const updatedDatasourceVersions = [9, 10, 11, 12]

  // d.version is a string for the Datasource plugin version
  let datasourceVersion = 0

  let dsVersionString = String(d.version ?? '')

  if (dsVersionString && dsVersionString.length > 0) {
    if (dsVersionString.includes('.')) {
      const arr = dsVersionString.split('.')

      dsVersionString = arr[0]
    }

    datasourceVersion = Number.parseInt(dsVersionString, 10)
  }

  return d.datasourceType === dsType && d.version && updatedDatasourceVersions.includes(datasourceVersion)
}

// Checks if the datasource for a source (panel, panel target, etc.) is an OpenNMS one and if so,
// updates the type and uid
// Will retain the original uid if it's a template variable, e.g. pointing to a datasource in '__inputs'.
// sourceDsInfo is from calling getSourceDatasourceInfo(source, datasourceMap)
// source may be a panel, panel.target, etc. which contains a 'datasource' field
export const updateTargetDatasource = (source: any, sourceDsInfo: SourceDatasourceInfo, dsMetas: DatasourceMetadata[]) => {
  if (sourceDsInfo.isOpenNmsDatasource && sourceDsInfo.datasourceType) {
    const dsMeta = dsMetas.find(d => isUpdatedDatasourceOfType(d, sourceDsInfo.datasourceType))

    if (dsMeta) {
      // retain the uid if it's a template variable
      const dsUid = getTemplateVariableUid(source.datasource) ?? dsMeta.uid

      source.datasource = {
        type: dsMeta.type,
        uid: dsUid
      }
    }
  }
}

// If the datasource points at a template variable, that variable is the uid to keep, so that the
// converted dashboard still follows the variable instead of being pinned to one datasource.
// A uid from the converting machine would not exist on the Grafana the dashboard is imported into.
//
// The datasource may be the object form, { uid: '$datasource' }, or the bare string
// '$datasource', which has no 'uid' property to read.
// A string with no '$' is a datasource name rather than a variable, so it is not retained.
const getTemplateVariableUid = (datasource: any): string | undefined => {
  // typeof rather than the isString helper: that also accepts a String wrapper object, and
  // everything here comes from JSON.parse, so it is always a primitive
  if (typeof datasource === 'string') {
    return isVariableReference(datasource) ? datasource : undefined
  }

  return datasource?.uid && isVariableReference(datasource.uid) ? datasource.uid : undefined
}
