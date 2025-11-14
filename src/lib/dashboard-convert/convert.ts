import { convertDashboardFromV8 } from './convert-from-v8/convertFromV8'
import { convertDashboardToV12 } from './convert-v9-to-v12'
import { ConvertOptions, ConvertResponse } from './types'
import { isDefined } from '../parseUtils'

/**
 * Converts a Grafana Dashboard, which contains OPG elements, from one version to another.
 * If the sourceVersion is 8, then converts all the elements from the old OpenNMS Helm v8 format, to OPG v9 format.
 * The target version is 9 or 12; at this point it should generally just be 12.
 * OPG 9 should be compatible with Grafana 9, 10 and 11.0-11.2.
 * Anything past that should use targetVersion 12.
 * We do some additional parsing/mapping to make sure all Grafana v12 elements are present.
 *
 * @param sourceJson a string of Json representing a Grafana Dashboard. May be in any version from Grafana 8-12.
 * @param sourcePluginVersion The OPG plugin version of the sourceJson, from 8 to 12
 * @param targetPluginVersion The OPG plugin version to convert the sourceJson to, either 9 or 12.
 * @param dashboardTitle A title to give the converted dashboard
 * @param options Some additional conversion options which mostly affect converting from OPG 8 to OPG 9
 */
export const dashboardConvert = (sourceJson: string, sourceVersion: number, targetVersion: number,
  dashboardTitle: string, options: ConvertOptions): ConvertResponse => {
  
  let response: ConvertResponse = {
    json: sourceJson,
    isError: false,
    errorMessage: '',
    targetPluginVersion: targetVersion
  }

  if (sourceVersion === 8) {
    response = convertDashboardFromV8(sourceJson, dashboardTitle, options)
  }

  // return if there was an error
  if (response.isError) {
    return response
  }

  // return if we already converted from 8 to 9 and target version is '9'
  if (sourceVersion === 8 && targetVersion === 9) {
    return response
  }

  // for any target version above 9 we convert it to 12
  if ([10, 11, 12].includes(targetVersion) && response.dashboardV9) {
    let shouldIncrementDashboardVersion = options.incrementDashboardVersion

    // If we already incremented dashboard version because we did an 8 to 9 conversion above,
    // don't increment it again
    if (shouldIncrementDashboardVersion) {
      if (sourceVersion === 8 && isDefined(response.dashboardV9)) {
        shouldIncrementDashboardVersion = false
      }
    }

    const optionsV12 = {
      incrementDashboardVersion: shouldIncrementDashboardVersion,
      unhideAllQueries: options.unhideAllQueries,
      convertGraphToTimeSeries: options.convertGraphToTimeSeries
    }

    const responseV12: ConvertResponse = convertDashboardToV12(response, dashboardTitle, optionsV12)

    return responseV12
  }

  return {
    dashboardV9: response.dashboardV9,
    json: sourceJson,
    isError: true,
    errorMessage: 'Invalid targetVersion or dashboardV9',
    targetPluginVersion: targetVersion
  } as ConvertResponse
}
