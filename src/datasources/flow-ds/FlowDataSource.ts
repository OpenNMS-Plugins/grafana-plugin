import { DataQueryResponse, DataSourceApi, DataSourceInstanceSettings } from '@grafana/data'
import { TemplateSrv, getTemplateSrv, getBackendSrv } from '@grafana/runtime'
import { ClientDelegate } from 'lib/client_delegate'
import { SimpleOpenNMSRequest } from 'lib/simpleRequest'
import { FlowStrings } from './constants'

import {
    buildFullQueryData,
    checkForTableSummary,
    extractDataFromQuery,
    queryOpenNMS,
    queryTemplateVariable
} from './helpers'
import {
    FlowDataSourceOptions,
    FlowQuery,
    FlowQueryRequest
} from './types'

export class FlowDataSource extends DataSourceApi<FlowQuery> {
    type: string;
    url?: string;
    name: string;
    client: ClientDelegate;
    simpleRequest: SimpleOpenNMSRequest;
    templateSrv: TemplateSrv

    constructor(instanceSettings: DataSourceInstanceSettings<FlowDataSourceOptions>) {
        super(instanceSettings);
        this.type = instanceSettings.type;
        this.url = instanceSettings.url;
        this.name = instanceSettings.name;
        this.client = new ClientDelegate(instanceSettings, getBackendSrv());
        this.simpleRequest = new SimpleOpenNMSRequest(getBackendSrv(), this.url);
        this.templateSrv = getTemplateSrv();
    }

    async query(options: FlowQueryRequest<FlowQuery>): Promise<DataQueryResponse> {
        const partialQueryData = extractDataFromQuery(options.targets);
        const fullQueryData = buildFullQueryData(partialQueryData, this.templateSrv, options.scopedVars);
        const { allAreSummaries } = checkForTableSummary(fullQueryData)
        const type = allAreSummaries ? FlowStrings.summaries : FlowStrings.series;
        return await queryOpenNMS(fullQueryData, options, type, { client: this.client, simpleRequest: this.simpleRequest });
    }

    async testDatasource(): Promise<any> {
        return await this.client.testConnection()
    }

    async metricFindQuery(query) {
        if (query === null || query === undefined || query === "") {
            return Promise.resolve([])
        }

        return await queryTemplateVariable(query, this.templateSrv, this.client, this.simpleRequest)
    }
}
