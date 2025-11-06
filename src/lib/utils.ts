import { loadPluginCss } from '@grafana/runtime'
import cloneDeep from 'lodash/cloneDeep'
import escapeRegExp from 'lodash/escapeRegExp'

let cssInitialized = false

export function initializeCss() {
  if (!cssInitialized) {
    cssInitialized = true

    loadPluginCss({
      dark: 'plugins/opennms-opennms-app/styles/dark.css',
      light: 'plugins/opennms-opennms-app/styles/light.css',
    })
  }
}

export function assignModelProperties(target, source, defaults = {}) {
  for (const key in defaults) {
    if (!defaults.hasOwnProperty(key)) {
      continue
    }

    target[key] = source[key] === undefined ? defaults[key] : source[key]
  }
}

export function selectOptionsForCurrentValue(variable) {
  let i, y, value, option
  const selected = [] as any[]

  for (i = 0; i < variable.options.length; i++) {
    option = variable.options[i]
    option.selected = false

    if (Array.isArray(variable.current.value)) {
      for (y = 0; y < variable.current.value.length; y++) {
        value = variable.current.value[y]
        if (option.value === value) {
          option.selected = true
          selected.push(option)
        }
      }
    } else if (option.value === variable.current.value) {
      option.selected = true
      selected.push(option)
    }
  }

  return selected
}

export function setOptionAsCurrent(variable, option) {
  variable.current = cloneDeep(option || {})

  if (Array.isArray(variable.current.text) && variable.current.text.length > 0) {
    variable.current.text = variable.current.text.join(' + ')
  } else if (Array.isArray(variable.current.value) && variable.current.value[0] !== '$__all') {
    variable.current.text = variable.current.value.join(' + ')
  }

  selectOptionsForCurrentValue(variable)

  return variableUpdated(variable)
}

export function variableUpdated(variable, emitChangeEvents = false) {
  const dashboardSrv = variable.dashboardSrv
  const templateSrv = variable.templateSrv

  // if there is a variable lock ignore cascading update because we are in a boot up scenario
  if (variable.initLock) {
    return Promise.resolve()
  }

  const getVariables = templateSrv.getVariables.bind(templateSrv) || dashboardSrv.dashboard.getVariables.bind(dashboardSrv.dashboard)
  const variables = getVariables()
  const promises = [] as Array<Promise<any>>

  // in theory we should create an efficient sub-list of variables to update, but for now just do them all YOLO
  variables.forEach(v => {
    // variables don't always seem to have updateOptions method, so check here
    if (v.updateOptions) {
      promises.push(v.updateOptions())
    }
  })

  templateSrv.setGlobalVariable(variable.id, variable.current)

  return Promise.all(promises).then(() => {
    if (emitChangeEvents) {
      dashboardSrv.dashboard.templateVariableValueUpdated()
      dashboardSrv.dashboard.startRefresh()
    }
  })
}

export const variableRegex = /\$(\w+)|\[\[([\s\S]+?)(?::(\w+))?\]\]|\${(\w+)(?:\.([^:^}]+))?(?::(\w+))?}/g

export const variableRegexExec = (variableString) => {
  variableRegex.lastIndex = 0
  return variableRegex.exec(variableString)
}

export function containsVariable(...args) {
  const variableName = args[args.length - 1]
  args[0] = isString(args[0]) ? args[0] : Object['values'](args[0]).join(' ')

  const variableString = args.slice(0, -1).join(' ')
  const matches = variableString.match(variableRegex)

  const isMatchingVariable =
    matches !== null
      ? matches.find(match => {
        const varMatch = variableRegexExec(match)
        return varMatch !== null && varMatch.indexOf(variableName) > -1
      })
      : false

  return !!isMatchingVariable
}

/**
 * Converts an input string into a string array of selected values.
 *
 * The input string may be the value of a multi-selection template variable. In this case the input string is
 * delimited by curly braces that enclose a comma separated list of values.
 *
 * The dropUnresolved parameter determines if an empty array is returned if the input starts with '$'.
 * The dropAll parameter determines if an empty array is returned if the input is "all".
 */
export function processSelectionVariable(input: string, dropUnresolved: boolean, dropAll: boolean): string[] {
  if (input) {
    if (input.startsWith('{') && input.endsWith('}')) {
      input = input.substring(1, input.length - 1)
    }

    const args = getInputsAsArray(input)

    if (dropAll && args.some(s => s === 'all')) {
      return []
    } else if (dropUnresolved && input.startsWith('$')) {
      return []
    } else if (dropAll && input === 'all') {
      return []
    } else {
      return args
    }
  } else {
    return []
  }
}

export function getInputsAsArray(input: string) {
  const pattern = /(\[[^\]]*\])/g

  // handle conversation type 
  const inputArrays = input.match(pattern)

  if (inputArrays && inputArrays.length > 0) {
    const args: string[] = []
    inputArrays.forEach(array => {
      args.push(array)
    })

    return args
  } else if (input.indexOf(',') >= 0) {
    return input.split(',').map(s => s.trim())
  } else {
    return [input]
  }
}

/**
 * Grafana oftens returns values that are either the raw value or else a one-element array with the value.
 * Utility function to get either.
 */
export function getValueOrFirstElement<T>(input: T | T[]): T {
  return Array.isArray(input) && input.length > 0 ? input[0] : (input as T)
}

/** Checks if the given index is the first index of the given t. */
export function isFirst<T>(t: T, index: number, array: T[]) {
  return array.indexOf(t) === index
}

/**
 * Converts multiple (possibly multi-selection) inputs into a string array of all contained selections.
 *
 * Unresolved template variables (detected by a leading '$' sign) are ignored. This allows to remove template variables
 * from a dashboard without having to adjust queries that use them.
 *
 * An empty array is returned if "all" would be included in the selections. Duplicates are removed.
 */
export function processSelectionVariables(input?: string[]): string[] {
  if (input) {
    const mapped = input.map(i => processSelectionVariable(i, true, false))

    if (mapped.some(m => m.some(s => s === 'all'))) {
      return []
    } else {
      return ([] as string[]).concat(...mapped).filter(isFirst)
    }
  } else {
    return []
  }
}

export class OpenNMSGlob {
  private static globExpressions: string[] = ['*', '|']

  static getGlobAsRegexPattern(expr: string) {
    return escapeRegExp(expr).replace(/\\\*/ig, '.*').replace(/\\\|/ig, '|')
  }

  /**
   * Check if expression contains allowed glob characters
   * @param expr expression
   * @returns true if expression contains allowed glob characters ('*', '|')
   */
  static hasGlob(expr: string): boolean {
    return [...expr].some((char) => {
      return OpenNMSGlob.globExpressions.includes(char)
    })
  }
}

/**
 * Swap items in an array
 * @param thisArray 
 */
export function swap(thisArray: any[], colIndex1: number, colIndex2: number): any[] {
  const tmp = thisArray[colIndex1]
  thisArray[colIndex1] = thisArray[colIndex2]
  thisArray[colIndex2] = tmp

  return thisArray
}

/**
 * Swap table rows column values
 * @param colIndex1 
 * @param colIndex2 
 */
export function swapColumns(rows: any[][], colIndex1: number, colIndex2: number): any[][] {
  if (rows && rows.length > 0 && colIndex1 >= 0 && colIndex2 >= 0) {
    for (let i = 0; i < rows.length; i++) {
      if (colIndex1 >= rows[i].length || colIndex2 >= rows[i].length) {
        throw new Error('Index out of bounds')
      }

      rows[i] = swap(rows[i], colIndex1, colIndex2)
    }
  }

  return rows
}

export function getNodeFilterMap(filterParam?: string): Map<string, string> {
  const filters = filterParam ? filterParam.split('&') : []
  const filtermap = new Map<string, string>()

  filters.forEach((filter, index, arr) => {
    let propValue = filter ? filter.split('=') : null

    if (propValue && propValue.length === 2) {
      const propertyKey = propValue[0].trim()
      const propertyValue = propValue[1].trim().replace(/^["'](.+(?=["']$))["']$/, '$1')

      filtermap.set(propertyKey, propertyValue)
    }
  })

  return filtermap
}

export const getNumberOrDefault = (value: any, defaultValue: number) => {
  return isNaN(parseInt(value, 10)) ? defaultValue : parseInt(value, 10)
}

export const getNodeResource = (nodeId) => {
  const prefix = nodeId.indexOf(':') > 0 ? 'nodeSource[' : 'node['

  return `${prefix}${nodeId}]`
}

export function getNodeAsResourceQuery(nodeId: string | undefined) {
  if (!nodeId) {
    return nodeId
  }

  return getNodeResource(nodeId)
}

/**
 * Retrieve the node id value from the resource id
 * @param resource : resource id as <nodeId>.<resourceId>
 * @returns Node Id 
 */
export const getNodeIdFromResourceId = (resource): string => {
  const matches = resource.match(/node(Source)?\[([^\]]+)?\]\..*/)

  if (matches && matches.length === 3) {
    return matches[2]
  } else {
    return resource
  }
}

export const getResourceId = (resource): string => {
  const matches = resource.match(/node(Source)?\[[^\]]*?\]\.(.*)/)

  if (matches && matches.length === 3) {
    return matches[2]
  } else {
    return resource
  }
}

/**
 * Returns true if 'variable' appears to be a Grafana template variable, i.e. in the form '${var}' or '$var'.
 */
export const isTemplateVariableCandidate = (variable: string) => {
  variable = (variable || '').trim()

  return !!variable &&
    (
      (variable.startsWith('${') && variable.endsWith('}')) ||
      (variable.startsWith('$') && !variable.includes('{') && !variable.includes('}'))
    )
}

/**
 * Given a Grafana template variable name in the form '$var' or '${var}', return 'var', i.e. the "raw" variable name.
 */
export const extractRawVariableName = (templateVar: string) => {
  const trimmed = (templateVar || '').trim()

  if (trimmed && trimmed.startsWith('$')) {
    return trimChar(trimChar(trimmed, '$'), '{', '}')
  }

  return trimmed
}

/**
 * Modify a string by trimming the starting and ending character(s) in a string passed in the arguments.
 * Ending character is optional.
 * @param str string to modify 
 * @param start character/string to trim at start of the string
 * @param end If specified, character/string to trim at the end of a string
 * @returns the string without the start and end characters passed as arguments (if they exist)
 */
export const trimChar = (str: string, start: string, end?: string) => {
  str = (str || '').trim()

  if (!str || !start) {
    return str
  }

  let result: string = str

  if (str.startsWith(start) && (!end || str.endsWith(end))) {
    if (end && end.length > 0) {
      result = str.substring(str.indexOf(start) + 1, str.lastIndexOf(end))
    } else {
      result = str.substring(str.indexOf(start) + 1)
    }
  }

  return result
}

export const isMultiValueString = (value: any): boolean => {
  if (isString(value)) {
    const s = value as string

    return s.startsWith('{') && s.endsWith('}')
  }

  return false
}

export const getMultiValues = (values: string | undefined): string[] => {
  if (isUndefined(values)) {
    return []
  }

  const valuesStr = !isString(values) ? String(values) : values as string

  return trimChar(valuesStr, '{', '}').split(',')
}

export const capitalize = (value: string) => {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : ''
}

export const isInteger = (num: any) => {
    return !isUndefined(num) && num !== null && ((parseInt(num, 10) + '') === (num + ''))
}

/**
 * Returns true if value is non-null and is a primitive string or a String object
 */
export const isString = (value) => {
  return value !== null && (typeof(value) === 'string' || value instanceof String)
}

export const isUndefined = (value) => {
  return typeof value === 'undefined'
}

export const valueOrDefault = (value, def) => {
  return isUndefined(value) ? def : value
}

/**
 * Remove any characters that causes issues with FIQL queries.
 */
export const sanitizeFiqlQuery = (value: string) => {
  return value.replaceAll(/[^A-Za-z0-9=_ -]/g, '')
}
