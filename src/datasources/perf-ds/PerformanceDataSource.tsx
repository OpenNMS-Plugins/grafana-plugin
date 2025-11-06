import { DataFrame, DataQueryResponse, DataSourceApi, DataSourceInstanceSettings, MetricFindValue } from '@grafana/data'
import { TemplateSrv, getTemplateSrv, getBackendSrv } from '@grafana/runtime'
import cloneDeep from 'lodash/cloneDeep'
import { DefaultOverrideAttributeQueryNodeLimit, PerformanceTypeOptions } from './constants'
import { measurementResponseToDataFrame } from './PerformanceHelpers'
import { ClientDelegate } from 'lib/client_delegate'
import { findFunctions, formatNodeToMetricFindValue, parseFunctionAttributes } from 'lib/function_formatter'
import { SimpleOpenNMSRequest } from 'lib/simpleRequest'
import { getNodeIdFromResourceId, OpenNMSGlob, getResourceId, trimChar } from 'lib/utils'
import {
    OnmsMeasurementsQueryRequest,
    OnmsMeasurementsQueryResponse,
    OnmsMeasurementsQuerySource,
    PerformanceDataSourceOptions,
    PerformanceQuery,
    PerformanceQueryRequest
} from './types'
import { OnmsResourceDto } from '../../lib/api_types'
import { collectInterpolationVariables, interpolate } from './queries/interpolate'
import {
    buildAttributeQuerySource,
    buildExpressionQuery,
    buildFilterQuery,
    buildPerformanceMeasurementQuery,
    getRemoteResourceId,
    isValidAttributeTarget,
    isValidExpressionTarget,
    isValidFilterTarget,
    isValidMeasurementQuery
} from './queries/queryBuilder'
import { queryStringProperties } from './queries/queryStringProperties'

export class PerformanceDataSource extends DataSourceApi<PerformanceQuery> {
    type: string
    url?: string
    name: string
    enableInputValueOverrideComponents: boolean
    attributeQueryNodeLimit: { unlimited: boolean, limit: number }
    client: ClientDelegate
    simpleRequest: SimpleOpenNMSRequest
    templateSrv: TemplateSrv

    constructor(instanceSettings: DataSourceInstanceSettings<PerformanceDataSourceOptions>) {
        super(instanceSettings)
        this.type = instanceSettings.type
        this.url = instanceSettings.url
        this.name = instanceSettings.name
        this.enableInputValueOverrideComponents = instanceSettings.jsonData.enableInputValueOverrideComponents || false
        this.attributeQueryNodeLimit = instanceSettings.jsonData.attributeQueryNodeLimit ?? { unlimited: false, limit: DefaultOverrideAttributeQueryNodeLimit }

        this.client = new ClientDelegate(instanceSettings, getBackendSrv())
        this.simpleRequest = new SimpleOpenNMSRequest(getBackendSrv(), this.url)
        this.templateSrv = getTemplateSrv()
    }

    isQueryValidStringPropertySearch = (targets: PerformanceQuery[]) => {
        const activeTargets = targets.filter(t => !t.hide)

        const totalStrings = activeTargets.filter((t) =>
            t.performanceType &&
            t.performanceType.value &&
            t.performanceType.value === PerformanceTypeOptions.StringProperty.value &&
            t.stringPropertyState?.stringProperty?.value)

        let typeOfQuery = 'normal'

        if (totalStrings.length > 0 && totalStrings.length === activeTargets.length) {
            typeOfQuery = 'string'
        } else if (totalStrings.length > 0 && totalStrings.length < activeTargets.length) {
            typeOfQuery = 'invalid'
        }
        return typeOfQuery;
    }

    async createSourcesFromAttributeTarget(query: OnmsMeasurementsQueryRequest,
        target: PerformanceQuery, options: PerformanceQueryRequest<PerformanceQuery>) {

        const source = buildAttributeQuerySource(target);
        const interpolationVars = collectInterpolationVariables(this.templateSrv, options.scopedVars)
        const attributes = ['nodeId', 'resourceId', 'attribute', 'datasource', 'label']

        const callback = (interpolatedSource: OnmsMeasurementsQuerySource) => {
            if (interpolatedSource.nodeId !== undefined) {
                // Calculate the effective resource id after the interpolation
                interpolatedSource.resourceId = getRemoteResourceId(interpolatedSource.nodeId, interpolatedSource.resourceId);
                // remove nodeId since it should not be part of the Rest API measurement request payload
                delete interpolatedSource.nodeId;
            }
        }

        let sources = interpolate(source, attributes, interpolationVars, callback)

        // There is no need for include scopedVars here, because additional resources and attributes are defined
        // using glob expressions, so they will never come from template variables.
        // If they come from template variables they should be already handled in the previous interpolate call.
        const additionalSources = await this.getAdditionalSources(sources)

        if (additionalSources.length > 0) {
            sources = sources.concat(additionalSources)
        }
        if (query.source && query.source.length > 0) {
            return query.source.concat(sources)
        }

        return sources
    }

    createExpressionsFromExpressionTarget(query: OnmsMeasurementsQueryRequest,
        target: PerformanceQuery, options: PerformanceQueryRequest<PerformanceQuery>, i: number) {

        const expression = buildExpressionQuery(target, i)
        const interpolationVars = collectInterpolationVariables(this.templateSrv, options.scopedVars)
        const attributes = ['value', 'label']

        const expressions = interpolate(expression, attributes, interpolationVars)

        if (query.expression && query.expression.length > 0) {
            return query.expression.concat(expressions)
        }

        return expressions
    }

    createFiltersFromFilterTarget(query: OnmsMeasurementsQueryRequest,
        target: PerformanceQuery, options: PerformanceQueryRequest<PerformanceQuery>) {

        const interpolationVars = collectInterpolationVariables(this.templateSrv, options.scopedVars)
        const attributes = Object.keys(target.filterState)
        const interpolatedFilterParams = interpolate(target.filterState, attributes, interpolationVars)
        const filters = buildFilterQuery(target, interpolatedFilterParams)

        // Only add the filter attribute to the query when one or more filters are specified since
        // OpenNMS versions before 17.0.0 do not support it
        if (filters.length > 0) {
            if (query.filter && query.filter.length > 0) {
                return query.filter.concat(filters)
            } else {
                return filters
            }
        }

        return query.filter
    }

    async stringPropertySearch(request: PerformanceQueryRequest<PerformanceQuery>) {
        return queryStringProperties(this.client, this.simpleRequest, this.templateSrv, request)
    }

    async query(options: PerformanceQueryRequest<PerformanceQuery>): Promise<DataQueryResponse> {
        const searchType = this.isQueryValidStringPropertySearch(options?.targets);

        if (searchType === 'string') {
            return this.stringPropertySearch(options);
        } else if (searchType === 'invalid') {
            throw new Error('string property queries cannot be mixed with other kinds of queries')
        }

        const maxDataPoints = options.maxDataPoints || 300;
        const intervalMs = options.intervalMs || 60 * 1000;
        const start = options.range.from.valueOf();
        const end = options.range.to.valueOf();
        let step = Math.floor((end - start) / maxDataPoints);
        step = (step < intervalMs) ? intervalMs : step;

        const query = buildPerformanceMeasurementQuery(start, end, step, maxDataPoints)

        let dataFrames: DataFrame[] = []

        for (let i = 0; i < options.targets.length; i++) {
            const target = options.targets[i];

            if (target.performanceType?.value === PerformanceTypeOptions.Attribute.value) {
                if (isValidAttributeTarget(target)) {
                    query.source = await this.createSourcesFromAttributeTarget(query, target, options)
                }
            } else if (target.performanceType?.value === PerformanceTypeOptions.Expression.value) {
                if (isValidExpressionTarget(target)) {
                    query.expression = this.createExpressionsFromExpressionTarget(query, target, options, i)
                }
            } else if (target.performanceType?.value === PerformanceTypeOptions.Filter.value) {
                if (isValidFilterTarget(target)) {
                    query.filter = this.createFiltersFromFilterTarget(query, target, options)
                }
            }
        }

        if (isValidMeasurementQuery(query)) {
            const responseData = await this.doMeasurementQuery(query)

            if (responseData) {
                try {
                    // convert to DataFrame format
                    dataFrames = measurementResponseToDataFrame(responseData)
                } catch (e) {
                    console.error(e);
                }
            }
        }

        return { data: dataFrames } as DataQueryResponse
    }

    async metricFindQuery(query, options) {
      if (!query) {
        return []
      }

      const functions = findFunctions(query)

      for (const func of functions) {
        func.arguments = this.replaceTemplateVariablesInArguments(func.arguments)

        if (func.name === 'locations') {
          return this.metricFindLocations()
        } else if (func.name === 'nodeFilter') {
          const { labelFormat, valueFormat, attributes } = parseFunctionAttributes(func.arguments)
          return this.metricFindNodeFilterQuery(attributes, labelFormat, valueFormat)
        } else if (func.name === 'nodeResources') {
          return this.metricFindNodeResourceQuery(func.arguments)
        } else {
          console.warn('Unknown function in query: ' + query, func)
        }
      }

      return []
    }

    async testDatasource(): Promise<any> {
        return await this.client.testConnection()
    }

    async doMeasurementQuery(query: OnmsMeasurementsQueryRequest) {
        const response = await this.simpleRequest.doOpenNMSRequest({
            url: '/rest/measurements',
            data: query,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        return response && response.data ? response.data as OnmsMeasurementsQueryResponse : null
    }

    async doResourcesRequest(resourceId: string) {
        const response = await this.simpleRequest.doOpenNMSRequest({
            url: '/rest/resources/' + encodeURIComponent(resourceId),
            method: 'GET',
            params: {
                depth: -1
            }
        })

        return response && response.data ? response.data as OnmsResourceDto : null
    }

    /**
     * Get OnmsResourceDto's by using rest/resources/fonode endpoint
     * @param nodeId 
     * @returns 
     */
    async doResourcesForNodeRequest(nodeId: string) {
      const response = await this.simpleRequest.doOpenNMSRequest({
        url: '/rest/resources/fornode/' + encodeURIComponent(nodeId),
        method: 'GET'
      })

      return response && response.data ? response.data as OnmsResourceDto : null
    }

    async metricFindLocations() {
      return await this.simpleRequest.getLocations()
    }

    async metricFindNodeFilterQuery(query: string, labelFormat: string, valueFormat: string) {
      const nodes = await this.simpleRequest.getNodesByFilter(query)
      const results: MetricFindValue[] = []

      nodes.forEach(node => {
        const hasFsFid = node.foreignSource !== null && node.foreignId !== null
        const fallbackValueFormat = hasFsFid ? 'fs:fid' : 'id'

        const { text, value } = formatNodeToMetricFindValue(node, labelFormat || 'label', valueFormat || fallbackValueFormat)

        results.push({ text, value, expandable: true })
      })

      // ensure template variable value displays (e.g. dropdowns) are in alphabetical order based on text label
      results.sort((a, b) => a.text.localeCompare(b.text))

      return results
    }

    async metricFindNodeResourceQuery(options: any[]) {
      let query = ''
      let textProperty = 'id'
      let resourceType = '*'
      let regex = null

      if (options.length > 0) {
        query = options[0]
      }
      if (options.length > 1) {
        textProperty = options[1]
      }
      if (options.length > 2) {
        resourceType = options[2]
      }
      if (options.length > 3) {
        regex = options[3]
      }

      if (!query) {
        return []
      }

      return await this.getNodeResources(query, textProperty, resourceType, regex)
    }

    async getNodeResources(nodes: string, textProperty: string, resourceType: string, regex?: string | null) {
        const nodeResources = await this.simpleRequest.getResourcesFor(nodes)
        const results: MetricFindValue[] = []

        nodeResources.forEach((resource) => {
            const resourceWithoutNodePrefix = resource.id.match(/node(Source)?\[.*?\]\.(.*)/)

            if (!resourceWithoutNodePrefix) {
                throw new Error(`No resources found for node: ${resource.id}`)
            }

            let textValue

            switch (textProperty) {
                case 'id':
                    textValue = resourceWithoutNodePrefix[2]
                    break;
                case 'label':
                    textValue = resource.label
                    break;
                case 'name':
                    textValue = resource.name
                    break;
                default:
                    textValue = resourceWithoutNodePrefix[2]
                    console.warn(`Unknown resource property '${textProperty}' specified. Using 'id' instead.`);
            }

            if (((resourceType === '*' && resourceWithoutNodePrefix) ||
                (resourceWithoutNodePrefix[2].indexOf(resourceType + '[') === 0)) &&
                (!regex || new RegExp(regex).test(textValue))) {
                results.push({ text: textValue, value: resourceWithoutNodePrefix[2], expandable: true });
            }
        })

        return results
    }

    async getAdditionalSources(sources: OnmsMeasurementsQuerySource[]) {
        let additionalSources: OnmsMeasurementsQuerySource[] = []

        for (const source of sources) {
            const resourceId = this.templateSrv.replace(source.resourceId)
            const attribute = this.templateSrv.replace(source.attribute)

            if (OpenNMSGlob.hasGlob(attribute) || OpenNMSGlob.hasGlob(resourceId)) {
                const extraQueries = await this.getSourcesFor(source)
                if (extraQueries) {
                    additionalSources = additionalSources.concat(extraQueries)
                }
            }
        }

        return additionalSources
    }

    async getSourcesFor(source: OnmsMeasurementsQuerySource) {
        const result: OnmsMeasurementsQuerySource[] = []

        const resourceId = this.templateSrv.replace(source.resourceId)
        const attribute = this.templateSrv.replace(source.attribute)
        const nodeId = getNodeIdFromResourceId(resourceId)
        const responseResources = await this.doResourcesForNodeRequest(nodeId)

        if (responseResources) {
            let nodeResources: OnmsResourceDto[] = this.flattenResourcesWithAttributes([responseResources], [])
            // get only queries with glob expressions
            const globQueryResource = new RegExp(OpenNMSGlob.getGlobAsRegexPattern(resourceId))
            const globQueryAttribute = new RegExp(OpenNMSGlob.getGlobAsRegexPattern(attribute))

            nodeResources = OpenNMSGlob.hasGlob(resourceId) ?
                nodeResources.filter(r => globQueryResource.test(getRemoteResourceId(nodeId, getResourceId(r.id)))) :
                nodeResources.filter(r => getResourceId(r.id) === getResourceId(resourceId))

            //find all matching resourceId and attribues
            nodeResources.forEach(resource => {
                let resourceAttributes = Object.entries(resource.rrdGraphAttributes)
                resourceAttributes = OpenNMSGlob.hasGlob(attribute) ?
                    resourceAttributes.filter(([k, o]) => globQueryAttribute.test(k)) :
                    resourceAttributes.filter(([k, o]) => k === attribute)

                resourceAttributes.forEach(([k, o]) => {
                    const sourceClone = cloneDeep(source)
                    sourceClone.resourceId = resource.id
                    sourceClone.attribute = o.name
                    sourceClone.label += `-${resource.id}-${o.name}`
                    result.push(sourceClone)
                })
            })
        }

        return result
    }

    flattenResourcesWithAttributes = (resources: OnmsResourceDto[], resourcesWithAttributes: OnmsResourceDto[]) => {
        resources.forEach(resource => {
            if (resource.rrdGraphAttributes !== undefined && Object.keys(resource.rrdGraphAttributes).length > 0) {
                resourcesWithAttributes.push(resource)
            }
            if (resource.children !== undefined && resource.children.resource.length > 0) {
                this.flattenResourcesWithAttributes(resource.children.resource, resourcesWithAttributes)
            }
        })

        return resourcesWithAttributes
    }

    /**
     * Used when defining template variables, hence there is no scopedVars argument in templateSrv.replace() method
     * @param args 
     * @returns 
     */
    replaceTemplateVariablesInArguments = (args?: string[]) => {
        if (args && Array.isArray(args)) {
            args = args.map(arg => trimChar(this.templateSrv.replace(arg), '{', '}'))
        }
        return args
    }
}
