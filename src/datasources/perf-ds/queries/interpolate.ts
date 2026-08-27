import { ScopedVars } from '@grafana/data'
import { TemplateSrv } from '@grafana/runtime'
import cloneDeep from 'lodash/cloneDeep'
import { resolveVariables } from '../../../lib/variableResolution'
import { isString } from '../../../lib/utils'

export interface InterpolationArrayVariable {
    name: string;
    value: string[];
}

export interface InterpolationVariable {
    name: string;
    value: string | string[];
}

/**
 * Collect the template variables that need to be interpolated, resolved to the values that apply
 * to *this* query.
 *
 * For a panel or row repeated over a variable, that is the single value belonging to this clone;
 * otherwise it is every selected value, which interpolate() then fans out into one measurement
 * source per value. See lib/variableResolution for why reading variable.current directly does not
 * work under Dashboard Scenes (OPG-521).
 */
export const collectInterpolationVariables = (templateSrv: TemplateSrv, scopedVars?: ScopedVars): InterpolationVariable[] => {
    return resolveVariables(templateSrv, scopedVars).map(resolved => ({
        name: resolved.name,
        value: resolved.values
    }))
}

/**
 * Returns whether the given value possibly contains a variable reference.
 */
const isVariableReferenceCandidate = (value: any): boolean => {
  return value !== undefined && value !== null && value !== '' &&
    isString(value) && (value as string).includes('$')
}

/**
 * Get a regex pattern for the given variable name which includes braces and an optional format.
 */
const getVariableWithBracesReferencePattern = (name: string) => {
  return '\\${' + name + '(?::[a-zA-Z0-9]+)?}'
}

/**
 * Checks whether a query (e.g. Performance Attribute query string) contains a template variable reference
 * such as $var, ${var}, ${var:fmt}.
 * @param queryValue Value of the query string
 * @param variableName Value of the template variable, without any decoration
 * @returns boolean. Could (in future) return an object such as { found: boolean, format?: string } if we want to know whether
 *   we need to check the brace format during variable interpolation replacement.
 */
const containsVariableReference = (queryValue: any, variableName: string) => {
    if (!isVariableReferenceCandidate(queryValue)) {
        return false
    }

    const strValue = queryValue as string || ''

    if (strValue.indexOf('$' + variableName) >= 0) {
      return true
    }

    if (strValue.includes('${' + variableName)) {
      const pattern = getVariableWithBracesReferencePattern(variableName)
      const r = new RegExp(pattern)

      return r.test(strValue)
    }

    return false
}

/**
 * Replaces any and all variable references in a query with their interpolated values.
 */
const replaceQueryValueWithVariables = (queryValue: any, variables: InterpolationVariable[]) => {
    // simple check so we don't bother to run regexes on values that definitely do not
    // contain interpolated variable references
    if (!isVariableReferenceCandidate(queryValue)) {
      return queryValue
    }

    let interpolatedValue: string = queryValue as string

    variables.forEach(variable => {
        // Note: variable.value should be a string at this point, not an array, since it
        // already went through cartesianProductOfVariables()
        // Just making sure here :)
        let variableValue: string = variable.value as string ?? ''
        if (Array.isArray(variable.value) && variable.value.length > 0) {
          variableValue = variable.value[0]
        }

        // check for '$variableName' syntax
        // we add word boundary at the end so we don't have spurious partial matches on variables
        // having same beginning portion of name
        let regexVarName = '\\$' + variable.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        regexVarName = regexVarName + '\\b'

        interpolatedValue = interpolatedValue.replace(new RegExp(regexVarName, 'g'), variableValue)

        // check for ${var} with optional ${var:format} where 'format' must be alphanumeric
        const regexWithBracesAndFormat = getVariableWithBracesReferencePattern(variable.name)
        interpolatedValue = interpolatedValue.replace(new RegExp(regexWithBracesAndFormat, 'g'), variableValue)
    })

    return interpolatedValue
}

const cartesianProductOfArrays = <T>(arrays: T[][]): T[][] => {
    // Based on the code from http://stackoverflow.com/questions/15298912/
    // javascript-generating-combinations-from-n-arrays-with-m-elements
    const r: T[][] = []
    const max = arrays.length - 1;

    const helper = (arr: T[], i: number) => {
        for (let j = 0, l = arrays[i].length; j < l; j++) {
            const a = arr.slice(0); // clone arr
            a.push(arrays[i][j]);

            if (i === max) {
                r.push(a);
            } else {
                helper(a, i + 1);
            }
        }
    }

    helper([], 0);
    return r;
}

/**
 * Takes variables in the form:
 * [
 *   { name: 'node', value: ['1', '6'] },       // index == 0
 *   { name: 'ifIndex', value: ['8', '9'] } .   // index == 1
 * ]
 * and converts them to the form:
 * [
 *   [                                          // index == 0
 *     { name: 'node', value: '1' },
 *     { name: 'node', value: '6' }
 *   ],
 *   [                                          // index == 1
 *     { name: 'ifIndex', value: '8' },
 *     { name: 'ifIndex', value: '9' }
 *   ]
 * ]
 * 
 * Note that the array index of the outer array points to the values for the same variable name
 */
const cartesianProductOfVariables = (variables: InterpolationVariable[]) => {
    // Collect the values from all of the variables
    const allValues: string[][] = variables.map(v => Array.isArray(v.value) ? v.value : [v.value])

    // Generate the cartesian product
    const productOfAllValues = cartesianProductOfArrays<string>(allValues)

    // Rebuild the variables
    const productOfAllVariables = [] as InterpolationVariable[][]

    productOfAllValues.forEach((rowOfValues: string[]) => {
        const rowOfVariables = [] as InterpolationVariable[]

        for (let i = 0, l = variables.length; i < l; i++) {
            const variable: InterpolationVariable = cloneDeep(variables[i])
            variable.value = rowOfValues[i]
            rowOfVariables.push(variable)
        }

        productOfAllVariables.push(rowOfVariables)
    })

    return productOfAllVariables
}

/**
 * Replaces the source's attributes with the values of the referenced variables.
 *
 * If a referenced variable contains multiple values or if there are multiple referenced variables
 * then we generate copies of the source with all of the possible permutations.
 *
 * See perf_ds_interpolate_spec.ts for examples.
 *
 * T is actually going to be:
 * - OnmsMeasurementsQuerySource for Attribute queries
 * - OnmsMeasurementsQueryExpression for Expression queries
 * - PerformanceQuery.filterState (just an object) for Filter queries
 * 
 * @param object
 *    the query object of type T to interpolate, see above
 * @param attributes
 *    a list of attributes on a given object that should be checked for variable interpolation.
 * @param interpolationVars
 *    a list of variable names and values from Grafana templateSrv of the form [{ name: 'varname', value: ['value1', 'value2'] }, ...]
 * @param callback
 *    an optional callback made with the object after variable substitution has been performed
 * @returns an array of objects of type T (see above) containing variable substitutions;
 *    if no substitutions were performed, the array will contain the original object
 */
export const interpolate = <T>(object: T,
    attributes: string[],
    interpolationVars: InterpolationVariable[],
    callback: (src: T) => void = () => {}): T[] => {

    // Add the index variable with a single value
    const variablesWithIndex = [...interpolationVars]
    variablesWithIndex.push({ name: 'index', value: ['0'] })

    // Collect the list of variables that are referenced by one or more of the keys
    const referencedVariables = [] as InterpolationVariable[]

    // Note: we could keep track of what variables are referenced by which attribute queries,
    // and also whether variables may have been referenced using ${var} or ${var:fmt} format
    // to not perform as many regexes, but keeping it simpler for now

    variablesWithIndex.forEach(variable => {
        const isVariableReferenced = attributes.find(attribute => containsVariableReference(object[attribute], variable.name))

        if (isVariableReferenced) {
            referencedVariables.push(variable)
        }
    })

    if (referencedVariables.length < 1) {
        // No variables are referenced, nothing to substitute
        callback(object)
        return [object]
    }

    // Generate all possible permutations of the referenced variable's values
    const productOfAllVariables = cartesianProductOfVariables(referencedVariables)

    // Perform the required variable substitution
    const objects = [] as T[]
    let index = 0

    productOfAllVariables.forEach((rowOfReferencedVariables: InterpolationVariable[]) => {
        // Update the value of the index variable to reflect the index of the row
        rowOfReferencedVariables.forEach(variable => {
            if (variable.name === 'index') {
                variable.value = 'idx' + index
                index += 1
            }
        })

        const o = { ...(object as any) }

        attributes.forEach(attribute => {
            o[attribute] = replaceQueryValueWithVariables(o[attribute], rowOfReferencedVariables)
        })

        callback(o)
        objects.push(o)
    })

    return objects
}
