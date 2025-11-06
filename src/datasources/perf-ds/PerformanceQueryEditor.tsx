import React, { useEffect, useState } from 'react'
import { Segment } from '@grafana/ui'
import { getTemplateSrv } from '@grafana/runtime'
import { API } from 'opennms'
import { SegmentSectionWithIcon } from 'components/SegmentSectionWithIcon'
import { DefaultOverrideAttributeQueryNodeLimit, PerformanceTypeOptions } from './constants'
import { PerformanceAttribute } from './PerformanceAttribute'
import { PerformanceExpression } from './PerformanceExpression'
import { PerformanceFilter } from './PerformanceFilter'
import { PerformanceStringProperty } from './PerformanceStringProperty'
import { PerformanceQueryEditorProps, QuickSelect, PerformanceStringPropertyState } from './types'
import { collectInterpolationVariables, interpolate } from './queries/interpolate'
import { getRemoteResourceId } from './queries/queryBuilder'
import { getStringProperties } from './PerformanceHelpers'
import { getTemplateVariable, isTemplateVariable } from '../../lib/variableHelpers'
import { OnmsResourceDto, OnmsRrdGraphAttribute } from '../../lib/api_types'
import { getMultiValues, isInteger, sanitizeFiqlQuery } from 'lib/utils'

export const PerformanceQueryEditor: React.FC<PerformanceQueryEditorProps> = ({ onChange, query, onRunQuery, datasource, ...rest }) => {
    const [performanceType, setPerformanceType] = useState<QuickSelect>(query.performanceType)

    const updateAttributeQuery = (attribute) => {
        onChange({
            ...query,
            performanceType,
            attribute
        })
    }

    const updateExpressionQuery = (expression, label) => {
        onChange({
            ...query,
            performanceType,
            expression,
            label
        })
    }

    const updateFilterQuery = (filter, filterState) => {
        onChange({
            ...query,
            performanceType,
            filter,
            filterState
        })
    }

    const updateStringQuery = (stringPropertyState) => {
        onChange({
            ...query,
            performanceType,
            stringPropertyState,
        })
    }

    useEffect(() => {
      onRunQuery()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query])

    const isPerformanceType = (value: number) => {
        if (performanceType && performanceType.value) {
            return performanceType.value === value
        }

        return false
    }

    // Limit for nodes searched can be set via Datasource Configuration.
    // See PerformanceConfigEditor and NodeAttributeLimitOverrideConfig
    // query: Optional search term, will perform a 'like' (wildcard) search on the node label.
    // Note, due to limitations in our FIQL implementation, this is case-sensitive, we
    // do not currently support API.Comparators.ILIKE
    const loadNodes = async (query?: string) => {
      let limit = DefaultOverrideAttributeQueryNodeLimit

      if (datasource.attributeQueryNodeLimit?.unlimited === true) {
        limit = 0
      } else if (datasource.attributeQueryNodeLimit?.limit !== undefined && datasource.attributeQueryNodeLimit.limit >= 0) {
        limit = datasource.attributeQueryNodeLimit.limit
      }

      let baseFilter: API.Filter

      if (query && query?.length > 0) {
        const sanitizedQuery = sanitizeFiqlQuery(query)
        const restriction = new API.Restriction('label', API.Comparators.LIKE, `*${sanitizedQuery}*`)
        baseFilter = new API.Filter().withAndRestriction(restriction)
      }

      const filter = {
        ...(baseFilter ?? new API.Filter()),
        limit
      } as API.Filter

      const nodes = await datasource.client.findNodes(filter, true)
      return nodes
    }

    /**
     * Load resources for the PerformanceAttribute Resources dropdown by either a node id (selected from
     * Node dropdown) or from a template variable that evaluates to a node id.
     */
    const loadResourcesByNode = async (value) => {
      let nodeId = value

      if (isTemplateVariable(value)) {
        nodeId = getTemplateVariable(value)
      } else if (value instanceof Object && value.id) {
        nodeId = value.id
      }

      if (isInteger(nodeId)) {
        return loadResourcesByNodeId(nodeId)
      }

      return []
    }

    const loadResourcesByNodeId = async (nodeId) => {
        const resourceData = await datasource.doResourcesForNodeRequest(nodeId)

        if (resourceData) {
            return resourceData.children.resource.map(r => {
                const label = (r.label && r.name && r.label !== r.name) ?
                    `${r.label} | ${r.name}` :
                    (r.label || r.name || '')

                const id = fixNodeResourceId(r.id)

                return {
                    ...r,
                    label,
                    id
                } as OnmsResourceDto
            })
        } else {
            return []
        }
    }

    // get just the resource portion of a node/resource expression
    const fixNodeResourceId = (id: string) => {
      const re = /node(Source)?\[.*?]\.(.*)$/
      const match = re.exec(id)
      
      if (match && match.length > 2) {
        return match[2]
      }

      return id
    }

    const loadAttributesByResourceAndNode = async (node, resource) => {
        // Note: similar to legacy 'suggestAttributes'
        const interpolationVars = collectInterpolationVariables(getTemplateSrv())

        const interpolatedNodeId = interpolate({ value: node.id || node.label }, ['value'], interpolationVars)?.[0].value || ''
        const interpolatedResourceId = interpolate({ value: resource.id || resource.label }, ['value'], interpolationVars)?.[0].value || ''
        const remoteResourceId = getRemoteResourceId(interpolatedNodeId, interpolatedResourceId)

        const resourceData = await datasource.doResourcesRequest(remoteResourceId)

        if (resourceData) {
            return Object.entries(resourceData.rrdGraphAttributes).map(([key, item]: [string, OnmsRrdGraphAttribute | any]) => {
                return { ...(item as {}), label: key }
            })

        } else {
            return []
        }
    }

    const loadFilters = async () => {
        const filters = await datasource.simpleRequest.doOpenNMSRequest({
            url: '/rest/measurements/filters',
            method: 'GET'
        })

        return filters.data.map((filter) => {
            return { ...filter, label: filter.name }
        })
    }

    const loadResourcesForStringPropertyState = async (performanceState: PerformanceStringPropertyState) => {
        // get all resources for the performanceState.node using select single node, multi nodes and template variables
        const resources: OnmsResourceDto[] = []

        if (performanceState?.node?.id || performanceState?.node?.label) {
            const nodeValues = getTemplateVariable(performanceState?.node)

            for (const node of getMultiValues(nodeValues)) {
                const result = await loadResourcesByNode(node)
                resources.push(...result)
            }
        }

        return resources
    }

    const loadStringPropertiesForState = async (performanceState: PerformanceStringPropertyState) => {
        const stringProperties: Array<{ label: string, value: string }> = []

        if (performanceState?.resource?.stringPropertyAttributes) {
            stringProperties.push(...getStringProperties(performanceState?.resource))
        } else if (isTemplateVariable(performanceState?.resource)) {
            const nodeValues = getTemplateVariable(performanceState?.node)
            const resourceIds = getTemplateVariable(performanceState?.resource)

            if (nodeValues && resourceIds) {
                const resources = await datasource.simpleRequest.getResourcesFor(nodeValues, resourceIds)
                resources.forEach(r => {
                    stringProperties.push(...getStringProperties(r))
                })
            }
        }

        return stringProperties
    }

    return (
        <div className='pf-query-editor'>
            <style>
                {`
                .bigger-labels label {
                    min-width: 32px;
                }
                .spacer {
                    margin-bottom: 6px;
                }
                .max-input {
                    max-width: 150px;
                }
                .pf-query-editor label, .pf-query-editor input {
                    min-width: 230px;
                    width: auto;
                }
                .pf-query-editor .pf-query-editor-attr-switch-field label {
                    min-width: 120px;
                    width: auto;
                }
                .pf-query-editor label.segment-with-icon {
                    min-width: 160px;
                    width: auto;
                }
                .pf-query-editor input {
                    border:1px solid transparent;
                    margin-bottom:0;
                }
            `}
            </style>
            <SegmentSectionWithIcon label='Type'>
                <Segment
                    placeholder='Choose Type'
                    value={performanceType}
                    onChange={(d) => setPerformanceType(d)}
                    options={[
                        PerformanceTypeOptions.Attribute,
                        PerformanceTypeOptions.Expression,
                        PerformanceTypeOptions.Filter,
                        PerformanceTypeOptions.StringProperty,
                    ]}
                />
            </SegmentSectionWithIcon>

            {
                isPerformanceType(PerformanceTypeOptions.Attribute.value) &&

                <PerformanceAttribute
                    enableInputValueOverrideComponents={datasource.enableInputValueOverrideComponents}
                    performanceAttributeState={query.attribute}
                    updateQuery={updateAttributeQuery}
                    loadNodes={loadNodes}
                    loadResourcesByNode={loadResourcesByNode}
                    loadAttributesByResourceAndNode={loadAttributesByResourceAndNode}
                />
            }

            {
                isPerformanceType(PerformanceTypeOptions.Expression.value) &&

                <PerformanceExpression query={query} updateQuery={updateExpressionQuery} />
            }

            {
                isPerformanceType(PerformanceTypeOptions.Filter.value) &&

                <PerformanceFilter query={query} updateQuery={updateFilterQuery} loadFilters={loadFilters} />
            }

            {
                isPerformanceType(PerformanceTypeOptions.StringProperty.value) &&

                <PerformanceStringProperty
                    query={query}
                    updateQuery={updateStringQuery}
                    loadNodes={loadNodes}
                    loadResourcesByNode={loadResourcesByNode}
                    loadResourcesForStringPropertyState={loadResourcesForStringPropertyState}
                    loadStringPropertiesForState={loadStringPropertiesForState}
                />
            }
        </div>
    )
}
