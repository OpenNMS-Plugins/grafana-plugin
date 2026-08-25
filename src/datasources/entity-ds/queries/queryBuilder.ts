import { TypedVariableModel } from '@grafana/data'
import { TemplateSrv } from '@grafana/runtime'
import { API } from 'opennms'
import { EntityQuery, EntityQueryRequest, FilterEditorData } from './../types'
import { ALL_SELECTION_VALUE, EntityTypes } from '../../../constants/constants'
import { isInteger, trimChar } from '../../../lib/utils'
import { ResolvedVariable, resolveVariable } from '../../../lib/variableResolution'
import { getAttributeMapping } from './attributeMappings'
import { getFilterId } from '../EntityHelper'

const isMultiVariable = (templateVar) => {
    return !!(templateVar?.multi || templateVar?.isMulti)
}

const isEmptyNodeRestriction = (clause: API.Clause) => {
    const restriction = clause.restriction
    return restriction.attribute === 'node' && restriction.value === '{}'
}

// annoyingly, depending on how you interact with the UI, if one value is selected it will
// *either* be an array with 1 entry, or just the raw value >:|
// so we normalize it back to just the raw value here if necessary
const normalizeSingleArrayValue = (value: any): string | string[] => {
    if (Array.isArray(value) && value.length === 1) {
        return value[0]
    }

    // could be a string, or multi-valued string[]
    return value
}

const normalizeMultiArrayValue = (currentValue: any[], restriction: API.Restriction) => {
  const replacement = new API.NestedRestriction()

  for (const value of currentValue) {
      if (restriction.comparator.id === API.Comparators.EQ.id) {
          replacement.withOrRestriction(new API.Restriction(restriction.attribute, restriction.comparator, value))
      } else if (restriction.comparator.id === API.Comparators.NE.id) {
          replacement.withAndRestriction(new API.Restriction(restriction.attribute, restriction.comparator, value))
      } else {
          throw new Error(`Unable to query "${restriction.attribute}": multi-select values with variable substitution must be either "=" or "!="`)
      }
  }

  return replacement
}

const removeEmptyClauses = (clauses: API.Clause[], remove: API.Clause[]) => {
    for (const r of remove) {
        const i = clauses.indexOf(r)
        if (i >= 0) {
            clauses.splice(i, 1)
        }
    }
}

const simpleVariableSubstitution = (value, variableName, request: EntityQueryRequest<EntityQuery>, templateSrv) => {
    // Range must be of type date, otherwise it is not parseable by the OpenNMS client
    if (variableName === 'range_from') {
        return request.range.from
    } else if (variableName === 'range_to') {
        return request.range.to
    } else {
        return templateSrv.replace(value, request.scopedVars)
    }
}

const subtituteNodeRestriction = (clause: API.Clause) => {
    const restriction = clause.restriction

    // Handle "node" as a special case, updating restrictions to either foreignSource+foreignId or node.id
    if (restriction.attribute === 'node') {
        if (restriction.value.indexOf(':') > 0) {
            if (restriction.comparator.id !== API.Comparators.EQ.id) {
                console.warn('Using a comparator other than EQ will probably not work as expected with a foreignSource:foreignId node criteria.')
            }

            const nodeCriteria = restriction.value.split(':')
            const replacement = new API.NestedRestriction(
                new API.Clause(new API.Restriction('node.foreignSource', restriction.comparator, nodeCriteria[0]), API.Operators.AND),
                new API.Clause(new API.Restriction('node.foreignId', restriction.comparator, nodeCriteria[1]), API.Operators.AND),
            )
            clause.restriction = replacement
        } else if (isInteger(restriction.value)) {
            clause.restriction = new API.Restriction('node.id', restriction.comparator, restriction.value)
        } else {
            console.warn('Found a "node" criteria but it does not appear to be a node ID nor a foreignSource:foreignId tuple.', restriction)
        }
    }
}

/**
 * Perform variable substitution for clauses.
 *
 * This will be called recursively if clause.restriction is actually a NestedRestriction OR
 * if the clause has a multi-valued template variable in which case we call recursively to create clauses from the resulting values.
 *
 * Note: templateSrv is derived from '@grafana/runtime' TemplateSrv but is actually a class having
 * quite a few more methods, etc., so we use 'any' instead. See:
 * https://github.com/grafana/grafana/blob/main/public/app/features/templating/template_srv.ts
 */
const substitute = (clauses: API.Clause[], request: EntityQueryRequest<EntityQuery>, templateSrv: any) => {
    const remove: API.Clause[] = []
    const clausesWithRestrictions = clauses.filter(c => c.restriction)

    for (let clause of clausesWithRestrictions) {
        if (clause.restriction instanceof API.NestedRestriction) {
            // this is actually a NestedRestriction, recurse through subclauses
            substitute(clause.restriction.clauses, request, templateSrv)
        } else if (clause.restriction.value) {
            // clause.restriction.value may be:
            // - a template variable (in $var or ${var} or ${var:text} format)
            // - an actual value (e.g. a node id or label), for example for multi-valued template variables and we
            //   broke it up into nested restrictions below
            const restriction = clause.restriction as API.Restriction
            const variableName: string = templateSrv.getVariableName(restriction.value) || ''
            const templateVariable: TypedVariableModel | undefined = getTemplateVariable(templateSrv, variableName)

            // Resolve the variable in *this* query's scope. For a repeated panel or row that is the
            // single value belonging to this clone, not every value selected on the dashboard.
            const resolved: ResolvedVariable | undefined = templateVariable
                ? resolveVariable(templateSrv, templateVariable, request.scopedVars)
                : undefined

            // A repeat clone is showing one specific value, so "all" can never apply to it; only an
            // un-repeated panel gets the "querying everything means no restriction" shortcut.
            const isMultiValued = isMultiVariable(templateVariable) && !resolved?.isLocalOverride

            // Process template variables set to "all"
            if (isMultiValued && resolved?.isAllInDashboardScope) {
                // if we're querying "all" we just dump the clause altogether
                remove.push(clause)
                continue
            }

            let skipSimpleSubstitution = false

            // Process multiple selection template variables
            if (isMultiValued) {
                const currentValues: string | string[] = getCurrentValuesFromMultiValuedTemplateVariables(resolved, variableName, restriction.value)

                const normalizedValue = normalizeSingleArrayValue(currentValues)

                // now if it's *still* an array, we chop it up into nested restrictions
                if (Array.isArray(normalizedValue)) {
                    const replacement = normalizeMultiArrayValue(normalizedValue, restriction)

                    // we've turned a single restriction into a nested one, so re-process it as a
                    // collection and skip the simple replacement below
                    clause.restriction = replacement
                    substitute(clause.restriction.clauses, request, templateSrv)
                    skipSimpleSubstitution = true
                }
            }

            if (!skipSimpleSubstitution) {
                restriction.value = simpleVariableSubstitution(restriction.value, variableName, request, templateSrv)
            }

            if (isEmptyNodeRestriction(clause)) {
                remove.push(clause)
            } else if (clause.restriction.attribute === 'node') {
                subtituteNodeRestriction(clause)
            }
        }
    }

    removeEmptyClauses(clauses, remove)
}

/**
 * Get the values of a multi-valued template variable, accounting for a ':text' specifier on the
 * template variable reference.
 * @param resolved the variable as resolved for this query, see lib/variableResolution
 * @param variableName The template variable name, without any decoration
 * @param restrictionValue The value from the restriction clause, should be a template variable reference like '$node', '${node}' or '${node:text}'
 * @returns The values of the multi-valued template variable
 */
const getCurrentValuesFromMultiValuedTemplateVariables = (resolved: ResolvedVariable | undefined, variableName: string, restrictionValue: string) => {
  // OPG-466. If restrictionValue has a format attribute, e.g. '${node:text}', use the resolved
  // 'texts' instead of the 'values'
  const originalValueTrimmed = trimChar(trimChar(restrictionValue, '$'), '{', '}')
  const hasTextFormat = originalValueTrimmed === `${variableName}:text`

  let currentValues: string | string[] = []

  if (resolved) {
    currentValues = hasTextFormat ? resolved.texts : resolved.values
  }

  return currentValues
}

export const getTemplateVariable = (templateSrv: any, name: string) => {
    const variables: TypedVariableModel[] = templateSrv.getVariables()

    if (name && variables && variables.length) {
        return variables.find(v => v.name === name)
    }

    return undefined
}

const isValidClauseRestriction = (clause) => {
    return clause?.restriction?.attribute && clause?.restriction?.comparator && clause?.restriction?.value
}

// Given a query filter, build a cloned one which does template variable substitution, etc.
// Clone Filter to make substitution possible
// (otherwise substitution would happen in original query,
// and overwriting the $<variable> or [[variable]] in restrictions which may not be the intention)
export const buildQueryFilter = (filter: API.Filter, request: EntityQueryRequest<EntityQuery>, templateSrv: TemplateSrv): API.Filter => {
    filter.clauses = filter.clauses.filter(clause => isValidClauseRestriction(clause))
    const clonedFilter = API.Filter.fromJson(filter)

    // Before replacing any variables, add a global time range restriction (which is hidden to the user)
    if (request && request.enforceTimeRange) {
        if (!request.entityType || request.entityType === EntityTypes.Alarms) {
            clonedFilter.withAndRestriction(new API.NestedRestriction()
                .withAndRestriction(new API.Restriction('lastEventTime', API.Comparators.GE, '$range_from'))
                .withAndRestriction(new API.Restriction('lastEventTime', API.Comparators.LE, '$range_to'))
            )
        }
    }

    // Substitute $<variable> or [[variable]] in the restriction value
    substitute(clonedFilter.clauses, request, templateSrv)

    // Remove any empty clauses
    // This could happen e.g. if there was a multi-value template variable that has no values selected
    clonedFilter.clauses = clonedFilter.clauses.filter(clause =>
      (clause.restriction?.clauses && clause.restriction?.clauses.length > 0) ||
      isValidClauseRestriction(clause))

    return clonedFilter
}

/**
 * Merge any filters having selected values from the FilterPanel into the given filter.
 * @param entityType An EntityTypes value
 */
export const mergeFilterPanelFilters = (entityType: string, originalFilter: API.Filter, filterEditorData: FilterEditorData) => {
    // only include filters targeting the given entityType
    const filtersToMerge = filterEditorData?.activeFilters.filter(f => f.entity.label === entityType) || []

    for (const filter of filtersToMerge) {
        const filterId = getFilterId(filter)
        const selectableValues = filterEditorData?.selectableValues.find(sv => sv.filterId === filterId)

        if (selectableValues?.values) {
            // get all selected values that are non-empty and also not 'All', converted to strings
            const values = selectableValues?.values.map(sv => (sv.value || '').toString()).filter(v => v.length > 0 && v !== ALL_SELECTION_VALUE)

            if (values) {
                const queryAttribute = filter.attribute.id || filter.attribute.label || ''
                const mappedAttribute = getAttributeMapping(entityType, queryAttribute)

                if (values.length === 1) {
                    const restriction = new API.Restriction(mappedAttribute, API.Comparators.EQ, values[0])
                    originalFilter.withAndRestriction(restriction)
                } else if (values.length > 1) {
                    const nestedRestriction = new API.NestedRestriction()

                    for (const value of values) {
                        const restriction = new API.Restriction(mappedAttribute, API.Comparators.EQ, value)
                        nestedRestriction.withOrRestriction(restriction)
                    }

                    originalFilter.withAndRestriction(nestedRestriction)
                }
            }
        }
    }
}
