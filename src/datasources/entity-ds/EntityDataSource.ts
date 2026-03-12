import { DataQueryResponse, DataSourceApi, DataSourceInstanceSettings } from '@grafana/data'
import { TemplateSrv, getBackendSrv, getTemplateSrv } from '@grafana/runtime'
import { ClientDelegate } from 'lib/client_delegate'
import { SimpleOpenNMSRequest } from 'lib/simpleRequest'
import { capitalize, extractRawVariableName, getNodeFilterMap, isTemplateVariableCandidate } from 'lib/utils'
import { API, Model } from 'opennms'
import { EntityTypes } from '../../constants/constants'
import { loadFilterEditorData } from '../../lib/localStorageService'
import { formatNodeToMetricFindValue, getEntityTypeFromFuncName, parseFunctionInfo, OnmsEntityFunctionInfo } from 'lib/function_formatter'
import {
  getColumns,
  getPropertyComparators,
  getQueryEntityType,
  getSearchProperties,
  getTemplateVariable,
  isLocationQuery,
  isMetricMetadataQuery,
  isSituationAttribute,
  metricFindLocations,
  queryEntity
} from './EntityHelper'
import { getAttributeMapping } from './queries/attributeMappings'
import { buildQueryFilter, mergeFilterPanelFilters } from './queries/queryBuilder'
import {
  EntityDataSourceOptions,
  EntityQuery,
  EntityQueryRequest,
  OnmsTableData
} from './types'

export class EntityDataSource extends DataSourceApi<EntityQuery> {
    type: string
    url?: string
    name: string
    client: ClientDelegate
    simpleRequest: SimpleOpenNMSRequest
    templateSrv: TemplateSrv

    constructor(instanceSettings: DataSourceInstanceSettings<EntityDataSourceOptions>) {
        super(instanceSettings)
        this.type = instanceSettings.type
        this.url = instanceSettings.url
        this.name = instanceSettings.name
        this.client = new ClientDelegate(instanceSettings, getBackendSrv())
        this.simpleRequest = new SimpleOpenNMSRequest(getBackendSrv(), this.url)
        this.templateSrv = getTemplateSrv()
    }

    async query(request: EntityQueryRequest<EntityQuery>): Promise<DataQueryResponse> {
        const fullData: OnmsTableData[] = []

        // - May need to get dashboard info (via backendSrv or direct via Dashboard HTTP API)
        //   and see if there is actually a FilterPanel in the current dashboard.
        //   Right now just checking for localStorage data, which could
        //   possibly exist even if the FilterPanel had been deleted
        // - FilterPanel should perhaps get events to know when it has been deleted and clear
        //   localStorage. May be able to subscribe to EventBus

        // get data from any FilterPanels that may be active
        const dashboardUid = request.dashboardUID || ''
        const filterEditorData = dashboardUid ? loadFilterEditorData(dashboardUid) : null

        const hasFilterEditorData = (filterEditorData &&
            filterEditorData.activeFilters.length > 0 && filterEditorData.selectableValues.length > 0)

        for (let target of request.targets) {
            request.entityType = target?.selectType?.label || EntityTypes.Alarms
            // possibly should be an option in the panel editor
            request.enforceTimeRange = true

            const filter = buildQueryFilter(target?.filter || new API.Filter(), request, this.templateSrv)

            if (hasFilterEditorData) {
                mergeFilterPanelFilters(request.entityType, filter, filterEditorData)
            }

            try {
                const rowData = await queryEntity(request.entityType, filter, this.client)
                fullData.push(rowData)
            } catch (e) {
                console.error(e)
            }
        }

        return { data: fullData }
    }

    async metricFindQuery(query, options) {
        if (isLocationQuery(query)) {
          return metricFindLocations(this.simpleRequest)
        }

        let entityType = getEntityTypeFromFuncName(options.entityType) || getQueryEntityType(query) || ''

        // this may be an attribute, a mapped attribute, or just the original query
        let queryOrAttribute = getAttributeMapping(entityType, query)

        if (isMetricMetadataQuery(options.queryType)) {
          return this.handleMetricMetadataQuery(entityType, options.queryType, queryOrAttribute, options.strategy)
        }

        if (!queryOrAttribute) {
          console.warn('entity-ds: metricFindQuery: no attribute specified')
          return []
        }

        const info: OnmsEntityFunctionInfo = parseFunctionInfo(queryOrAttribute)
        entityType = info.entityType || entityType

        if (info.funcName === 'nodeFilter') {
          return this.metricFindNodeFilterQuery(entityType, info.attribute, info.labelFormat, info.valueFormat)
        }

        if (isSituationAttribute(info.attribute || queryOrAttribute)) {
            return [
                { id: 'false', label: 'false', text: 'false' },
                { id: 'true', label: 'true', text: 'true' }
            ]
        }

        const searchProperties: API.SearchProperty[] = await getSearchProperties(entityType, this.client)
        const searchProperty: API.SearchProperty = searchProperties.filter(p => p.id === info.attribute)?.at(0)

        if (!searchProperty) {
            return []
        }

        // Severity is handled separately as otherwise the severity ordinal vs the severity label would be
        // used, but that may not be ideal for the user
        if (searchProperty.id === 'severity') {
            const items =
                Object.entries(Model.Severities).map(([k, v]) => {
                    const severity = v as any as Model.OnmsSeverity
                    return {
                        id: severity.i,
                        label: capitalize(severity.l),
                        text: capitalize(severity.l),
                        value: severity.l
                    }
                })

            return items
        }

        const propertyValues = await searchProperty.findValues({ limit: 0 })

        return propertyValues.filter(value => value !== null)
            .map(value => {
                return { id: value, label: value, text: value ? String(value) : value, value: value }
            })
    }

    async testDatasource(): Promise<any> {
        return await this.client.testConnection()
    }

    async metricFindNodeFilterQuery(entityType: string, attribute: string, labelFormat = '', valueFormat = '') {
        const filterMap = getNodeFilterMap(attribute)
        let filter = new API.Filter()

        for (const pair of filterMap) {
            const propertyKey = getAttributeMapping(entityType, pair[0])
            const propertyValue = pair[1]

            if (isTemplateVariableCandidate(propertyValue)) {
                const templateVariable = getTemplateVariable(this.templateSrv, extractRawVariableName(propertyValue))

                if (templateVariable && templateVariable.current.value) {
                    filter.withAndRestriction(new API.Restriction(propertyKey, API.Comparators.EQ, templateVariable.current.value))
                }
            } else if (propertyKey && propertyValue) {
                filter.withAndRestriction(new API.Restriction(propertyKey, API.Comparators.EQ, propertyValue))
            }
        }

        filter.limit = 0
        const nodes = await this.client.getNodeByFilter(filter)

        return nodes.map(node => formatNodeToMetricFindValue(node, labelFormat, valueFormat))
    }

    async handleMetricMetadataQuery(entityType: string, queryType: string, attribute: string, strategy?: string) {
        // special case queries to fill in metadata
        if (queryType === 'attributes') {
            if (strategy && strategy === 'featured') {
                return getColumns(entityType).filter(col => col.featured).map(col => {
                    return { id: col.resource, value: col.text }
                })
            }
            // assume all
            return await getSearchProperties(entityType, this.client)
        } else if (queryType === 'comparators') {
            return await getPropertyComparators(entityType, attribute, this.client)
        } else if (queryType === 'operators') {
            return await this.client.findOperators()
        }

        return []
    }
}
