import { DataFrame, Field, FieldType, rangeUtil, SelectableValue } from '@grafana/data'
import { Model } from 'opennms'
import { ClientDelegate } from 'lib/client_delegate'
import { dscpLabel, dscpSelectOptions } from '../../lib/tos_helper'
import {
    getMultiValues,
    getNodeFilterMap,
    getNumberOrDefault,
    getNodeAsResourceQuery,
    isMultiValueString,
    isString,
    swapColumns,
    valueOrDefault
} from 'lib/utils'
import { SimpleOpenNMSRequest } from 'lib/simpleRequest'
import {
    defaultSegmentOptions,
    FlowFunctionNames,
    FlowFunctions,
    FlowFunctionStrings,
    FlowSegments,
    FlowSegmentStrings,
    segmentFunctionMapping,
    segmentMapping,
    FlowStrings,
    FlowTemplateVariableFunctionExpression,
    FlowTemplateVariablesStrings,
    ConversationParams,
    ApplicationsParams,
    HostsParams,
    ExporterNodesParams,
    InterfacesOnExporterNodeWithFlowsParams,
    DscpOnExporterNodeAndInterfaceParams
} from './constants'

import {
    FlowCommonParams,
    FlowFunctionOptions,
    FlowFunctionParams,
    FlowParsedQueryData,
    FlowParsedQueryRow,
    FlowQuery,
    FlowQueryData,
    FlowQueryRequest,
    FlowTimestampedData,
    FlowTemplateVariableClientService,
    FlowTemplateVariableQueryService,
    SegmentOption
} from './types'
import { OnmsMeasurementResource } from '../../lib/api_types'

/**
 * Pieces together UI data into data appropriate to query the BE with.
 * 
 * @param queryItems All of the queries
 * @returns An object with all the query values, in easy to parse formats for later steps in the process.
 */
export const buildFullQueryData = (queryItems: FlowQueryData[], templateSrv: any): FlowParsedQueryData => {
    // convert the template variables into their selected values for each query.
    // withDscp, withApplication, withConversation and withHost should allow an array of strings 
    // that are passed as parameter from template functions
    queryItems = queryItems.map(item => convertTemplateVariables(item, templateSrv))

    const fullData: FlowParsedQueryData = []
    for (let queryData of queryItems) {
        const data: FlowParsedQueryRow = { // Build default structure
            segment: {
                id: queryData.segment,
                label: ''
            },
            queryFunctions: [],
            refId: queryData.refId
        }

        if (typeof queryData.segment === 'number') { // Let's get our segment name
            data.segment.label = FlowSegments[queryData.segment]
        }

        fullData.push(buildActiveFunctionList(data, queryData))
    }
    return fullData;
}

/**
 * 
 * @param parsedData Data parsed by buildFullQueryData
 * @returns If all of our queries are in series, or in summary.
 */
export const checkForTableSummary = (parsedData: FlowParsedQueryData) => {
    const isTableSummarySet = collectInstancesOfFlowFunction(parsedData, FlowFunctionStrings.asTableSummary);
    const allAreSummaries = isTableSummarySet.every((d) => d)
    const allAreSeries = isTableSummarySet.every((d) => !d)
    if (!allAreSeries && !allAreSummaries) {
        throw new Error("The 'asTableSummary' transformation must be included in all queries of a panel or in none of them.");
    }
    return { allAreSeries, allAreSummaries };
}

/**
 * 
 * @param targets 
 * @returns Just the data from the query we need, instead of all the extra stuff.
 */
export const extractDataFromQuery = (targets: FlowQuery[]): FlowQueryData[] => {
    let data: FlowQueryData[] = []
    for (let target of targets) {
        try {
            data.push({
                segment: target.segment.value ?? FlowSegments.Applications,
                functionParameters: target.functionParameters,
                functions: target.functions,
                parameterOptions: target.parameterOptions,
                refId: target.refId
            })
        } catch (e) {
            console.error('error extracting data from query', e)
        }
    }
    return data;
}

/**
 * 
 * @param newOptions All of the currently enabled UI options for a single row
 * @param segmentValue The currently selected segment (conversations,appliances,hosts,dscps)
 * @returns Options that don't belong to the active segment
 */
export const filterOutItemsMissingActiveMetric = (newOptions: SegmentOption[], segmentValue: SelectableValue<number>) => {
    return newOptions.map((option) => {
        return {
            ...option, options: option.options.filter((suboption) => {
                const parents = FlowFunctions.get(suboption.label)

                let foundItems = parents?.parentSegments?.find((parent) => {
                    return parent === segmentValue.value
                })
                return parents?.parentSegments ? typeof foundItems === 'number' : true
            })
        }
    })
}

/**
 * Used to filter out items specified as non-compatible in our list of selected functions per query (constants.ts)
 * @param excludedFunctions The list of functions to exclude
 * @returns a list of functions that don't include the excluded functions.
 */
export const filterOutExcludedFunctions = (excludedFunctions: number[]) => {

    return defaultSegmentOptions.map((i) => {
        const options = i.options;
        return {
            ...i,
            options: options.filter((b) => {
                let excluded = excludedFunctions.find((exc) => {
                    return FlowFunctionNames[exc] === b.label
                })
                return typeof excluded !== 'number'
            })
        }
    })
}

/**
 * 
 * @param newOptions All of our available options
 * @param selectedOptions The options we've selected
 * @returns a list of available functions that doesn't include single-use functions already in use.
 */
export const filterOutExistingSingleUseFunctions = (newOptions: SegmentOption[], selectedOptions: Array<SelectableValue<string>>) => {

    return newOptions.map((option) => {
        return {
            ...option, options: option.options.filter((suboption) => {
                const flowFunction = FlowFunctions.get(suboption.label);
                let existingOption = selectedOptions?.find((f) => f.label === suboption.label)
                return existingOption ? flowFunction?.allowMultiple : true;
            })
        }
    })
}

/**
 * Determines which Segment we've selected (applications,conversations,hosts,dscps)
 * Determines if we're doing a regular, or topN query
 * Determins which OpenNMS Client Delegate Function to call
 * Builds the parameters to send to the OpenNMS Client Delegate Function
 * Processes the data returned by OpenNMS into a Grafana Ready object
 * 
 * @param fullQueryData All of the query data, parsed by our buildFullQueryData function
 * @param options The options as provided by Grafana in the query function
 * @param type Summary or Series?
 * @param client The OpenNMS Client delegate, initalized and ready to use.
 * @returns OpenNMS API data formatted as Grafana Data Frames.
 */
export const queryOpenNMS = async (fullQueryData: FlowParsedQueryData, options: FlowQueryRequest<FlowQuery>, type: string, service: FlowTemplateVariableClientService) => {
    let responseData: any = []
    const step = buildStepFromQuery(fullQueryData, options)

    for (let query of fullQueryData) {
        const segmentName = query.segment.label

        if (segmentName) {
            const functionName = getFunctionNameAssociatedToSegment(segmentName)
            const functionDefinition = getOpenNMSClientFunction(query, functionName, segmentName, type)
            const functionParameters: FlowFunctionParams = await getFunctionParameters(query, functionName, type, options, step, service)
            const dataFromOpenNMS: Model.OnmsFlowTable = await queryOpenNMSClientWithFlowFunctionParams(functionDefinition, functionParameters, service.client)
            const processedData = processDataBasedOnType(type, query, options, dataFromOpenNMS)

            for (let d of processedData) {
                responseData.push(d)
            }
        }
    }

    // possibly call toggleTableViewIfRelevant(type) here

    return { data: responseData }
}

/**
 * If we're trying to view a summary, and the Table View toggle is off, turn it on.
 * IF we're trying to view a series, and the Table View toggle is on, turn it off.
 * @param type Summary or Series
 */
export const toggleTableViewIfRelevant = (type: string) => {
    const tableViewCheckbox: HTMLInputElement | null = document.querySelector('#table-view')
    if (tableViewCheckbox) {
        if (tableViewCheckbox.checked ||
          (!tableViewCheckbox.checked && type === FlowStrings.summaries)) {
            tableViewCheckbox.click();
        }
    }
}

/**
 * 
 * @param oldData An invidual query row
 * @param queryData Our raw query data.
 * @returns An array of active functions, with their associated options/parameters if set.
 */
const buildActiveFunctionList = (oldData: FlowParsedQueryRow, queryData: FlowQueryData) => {
    let data: FlowParsedQueryRow = { ...oldData }
    let funcIndex = 0;
    if (queryData.functions) {
        try {
            for (let func of queryData.functions) {
                data = parseActiveFunctionsAndValues(func, queryData, data, funcIndex);
                funcIndex += 1;
            }
        } catch (e) {
            console.error('error building active function list', e)
        }
    }
    return data;
}

/**
 * 
 * @param type Series or Summary
 * @param query An individual query row from the full list of queries.
 * @param options The options a provided by Grafana
 * @returns The parameters for any default (non topN) function, a FlowSummaryParams object
 */
const buildDefaultParams = async (type: string, query: FlowParsedQueryRow, options: FlowQueryRequest<FlowQuery>, step: number, service: FlowTemplateVariableClientService) => {
    const { start, end } = getTimeRange(options);
    const linkedFunctionName = segmentMapping[query.segment.label || '']
    const functionValue = query.queryFunctions.find((d) => d[linkedFunctionName]) || ''
    const params: FlowCommonParams = await getCommonParams(query, service)

    const isDscp = query.segment.label === FlowSegmentStrings.Dscps

    // dscp queries do not have the initial functionValue parameter or includeOther
    const defaultSummaryParams = !isDscp ? {
        functionValue: [functionValue],
        topN: -1,
        start,
        end,
        step,
        includeOther: params.includeOther,
        withExporterNode: params.withExporterNode,
        withIfIndex: params.withIfIndex,
        withDscp: params.withDscp
    } as FlowFunctionParams : {
        topN: -1,
        start,
        end,
        step,
        includeOther: params.includeOther,
        withExporterNode: params.withExporterNode,
        withIfIndex: params.withIfIndex,
        withDscp: params.withDscp
    } as FlowFunctionParams

    return defaultSummaryParams
}

/**
 * This is more or less verbatim from the old angular version.
 * @returns The step value based on set parameters
 */
const buildStepFromQuery = (query: FlowParsedQueryData, options: FlowQueryRequest<FlowQuery>) => {
    const { start, end } = getTimeRange(options);
    try {
        const groupsByVals = getAllValuesByFunctionName(query, FlowFunctionStrings.withGroupByInterval);
        const setCheck = new Set(groupsByVals);
        if (setCheck.size > 1) {
            throw new Error('All queries must use the same withGroupByInterval')
        }
        let step;
        const maxDataPoints = options.maxDataPoints;
        if (setCheck.size === 1 && typeof setCheck.values().next().value !== 'undefined') {
            step = rangeUtil.intervalToMs(setCheck.values().next().value || '0')
        } else if (typeof maxDataPoints === 'number') {
            step = Math.floor((end - start) / maxDataPoints)
        }
        return step;
    } catch (e) {
        console.error('error building step from query', e);
    }
}

/**
 * 
 * @param type series or summary
 * @param query An invdividual query from the full list of queries.
 * @param options The options as provided by Grafana
 * @param step The step value calculated in buildStepFromQuery
 * @returns a FlowSummaryParams object
 */
const buildTopNParams = async (type: string, query: FlowParsedQueryRow, options: FlowQueryRequest<FlowQuery>, step: number, service: FlowTemplateVariableClientService) => {
    const { start, end } = getTimeRange(options);
    const params: FlowCommonParams = await getCommonParams(query, service)

    return {
        topN: params.topN,
        start,
        end,
        step,
        includeOther: params.includeOther,
        withExporterNode: params.withExporterNode,
        withIfIndex: params.withIfIndex,
        withDscp: params.withDscp
    } as FlowFunctionParams
}

/**
 * 
 * @param colIdx current column to evalueate
 * @param parsedData an object containing timestamps, columns and data
 * @param options a FlowFunctionOptions object with param function options to be used in the conversion (nanToZero, multiplier and sign)
 * @returns Datapoints ready for Grafana
 */
const convertTimeStampedDataToDataFrame = (colIdx: number, parsedData: FlowTimestampedData, options: FlowFunctionOptions) => {
    return parsedData.timestamps.map((timestamp, timestampIdx) => {
        const v = Number(parsedData.values[colIdx][timestampIdx])

        let value: number | null = null

        if (isNaN(v)) {
          if (options.nanToZero) {
            value = 0
          }
        } else {
          value = v * options.multiplier * options.sign
        }

        return [value, timestamp]
    })
}

/**
 * 
 * @param headers Headers from RawData returned from OpenNMS (rawData.headers)
 * @param query FlowParsedQueryRow used to identify additional conversions
 * @returns A data object ready to be used as column headers in a Grafana Table
 */
const convertDataHeaderstoTableColumns = (headers: string[], query: FlowParsedQueryRow) => {
    return headers ? headers.map((column) => {
        const toBits = isFunctionSet(query, FlowFunctionStrings.toBits)

        if (toBits) {
            if (column.includes('Bytes In')) {
                column = 'Bits In'
            } else if (column.includes('Bytes Out')) {
                column = 'Bits Out'
            }
        }
        return { "text": column }
    }) : []
}

/**
 * 
 * @param rows rows from RawData to convert
 * @param headers headers to from RawData to identify row-column position
 * @param query FlowParsedQueryRow used to identify additional conversions
 * @returns array of converted rows
 */
const convertDataRowsToTableRows = (rows: any[], headers: string[], query: FlowParsedQueryRow) => {
    const toBits = isFunctionSet(query, FlowFunctionStrings.toBits);
    const swapIngressEgress = isFunctionSet(query, FlowFunctionStrings.swapIngressEgress);
    const inIndex = headers.indexOf('Bytes In');
    const outIndex = headers.indexOf('Bytes Out');
    const ecnIndex = headers.lastIndexOf('ECN');

    rows.forEach((row) => {
        row[0] = convertLabel(row[0], null, query);

        if (ecnIndex > 0) {
            let label;
            switch (row[ecnIndex]) {
                // all flows used ecn capable transports / no congestions were reported
                case 0: label = 'ect / no ce'; break;
                // at least some flows used non-ecn-capable transports / no congestions were reported
                case 1: label = 'non-ect / no ce'; break;
                // all flows used ecn capable transports / congestions were reported
                case 2: label = 'ect / ce'; break;
                // at least some flows used non-ecn-capable transports / congestions were reported
                case 3: label = 'non-ect / ce'; break;
            }
            if (label) {
                row[ecnIndex] = label;
            }
        }

        if (toBits) {
            row[inIndex] *= 8;
            row[outIndex] *= 8;
        }
    })

    if (swapIngressEgress && Array.isArray(rows) && rows.length > 0) {
        rows = swapColumns(rows, inIndex, outIndex);
    }

    return rows;
}

/**
 * Creata a Grafana DataFrame for use with Summary data.
 */
const createSummaryDataFrame = (queryRow: FlowParsedQueryRow, rowLength: number): DataFrame => {
    const metric = queryRow.segment ? queryRow.segment.label : undefined
    const toBits = isFunctionSet(queryRow, FlowFunctionStrings.toBits)
    const fields: Field[] = []

    return {
        refId: queryRow.refId,
        name: queryRow.refId,
        fields: fields,
        length: rowLength,
        meta: toBits ? { custom: { metric, toBits: '' } } : { custom: { metric } }
    } as DataFrame
}

/**
 * @param parsedData All of the parsed data from buildFullQueryData
 * @param flowFunctionName the name of the function we want to count
 * @returns a boolean array, true means the function was found in a single query, false it was not.
 */
const collectInstancesOfFlowFunction = (parsedData: FlowParsedQueryData, flowFunctionName: string) => {
    const functionInstances: boolean[] = []

    for (let data of parsedData) {
        functionInstances.push(
            !!data.queryFunctions.find((queryFunction) =>
                typeof queryFunction[flowFunctionName] !== 'undefined')
        )
    }

    return functionInstances
}

/**
 * 
 * @param query The full query data from buildFullQueryData
 * @param functionName The name of the function we want data from
 * @returns An array with the values of the specified function for each query row.
 */
const getAllValuesByFunctionName = (query: FlowParsedQueryData, functionName: string) => {
    return query.map((e) => e?.queryFunctions?.filter((d) => {
        return !!d[functionName]
    }).map((e) => {
        return e?.[functionName]
    })?.[0])
}

/**
 * @param query An invidual parsed query row
 * @returns The common parameters used by both default and topN query types.
 */
const getCommonParams = async (query: FlowParsedQueryRow, service: FlowTemplateVariableClientService) => {
    const exporterNode = getFunctionValue(query, FlowFunctionStrings.withExporterNode)
    const ifIndex = await lookupIfIndex(getNodeAsResourceQuery(exporterNode), getFunctionValue(query, FlowFunctionStrings.withIfIndex), service.simpleRequest)
    const dscp = getFunctionValue(query, FlowFunctionStrings.withDscp)

    return {
        topN: getFunctionValue(query, FlowFunctionStrings.topN) || 10,
        includeOther: isFunctionSet(query, FlowFunctionStrings.includeOther) ? true : false,
        withExporterNode: exporterNode || undefined,
        withIfIndex: ifIndex || undefined,
        withDscp: dscp && dscp !== 'all' ? dscp : []
    } as FlowCommonParams
}

/**
 * @param segmentName the segmentname we're looking for.
 * @returns a mapped segment, if it exists.
 */
const getFunctionNameAssociatedToSegment = (segmentName: string) => {
    return segmentMapping[segmentName] || ''
}

/**
 * Depending on if the user has set the associated function with the segment type, either return the default or topN parameters.
 * @returns a FlowSummaryParams object for either default or topN
 */
const getFunctionParameters = async (query: FlowParsedQueryRow, functionName: string, type: string, options: FlowQueryRequest<FlowQuery>, step: number, service: FlowTemplateVariableClientService) => {
    return query.queryFunctions.find((d) => d[functionName]) || query.segment.label === FlowSegmentStrings.Dscps ?
        buildDefaultParams(type, query, options, step, service) :
        buildTopNParams(type, query, options, step, service);
}

/**
 * If the value converts to a number cleanly, it will be converted before 
 * @param query An invidual query row
 * @param name the name of the function we want the value for
 * @returns The value(s) for the specified row and function.
 */
export const getFunctionValue = (query: FlowParsedQueryRow, name: string): string | undefined => {
    return query.queryFunctions.find((d) => d[name])?.[name];
}

/**
 * 
 * @param timestamps An array of timestamps (epoch numbers)
 * @param start Our starting timestamp
 * @param end Our ending timestamp
 * @returns A list of timestamps between the provided range.
 */
const getInRangeTimestamps = (timestamps: number[], start: number, end: number) => {

    return timestamps.
        filter((timestamp) => timestamp >= start && timestamp <= end);
}

/**
 * 
 * @param queryData An individual query row
 * @param timestamps an array of timestamps (epoch numbers)
 * @returns Our data response multiplier if we want one set.
 */
const getMultiplier = (queryData: FlowParsedQueryRow, timestamps: number[]) => {
    const step = timestamps[1] - timestamps[0];
    let multiplier = 1;
    if (isFunctionSet(queryData, FlowFunctionStrings.perSecond)) {
        multiplier /= step / 1000;
    }
    if (isFunctionSet(queryData, FlowFunctionStrings.toBits)) {
        multiplier *= 8;
    }
    return multiplier;
}

/**
 * 
 * @param query An individual query row.
 * @param functionName The name of the associated function
 * @param segmentName The name of the active segment
 * @param type 'series' or 'summaries'
 * @returns a function name we can call on ClientDelegate to get some OpenNMS Data.
 *  These map to methods in opennms-js FlowDAO.
 */
const getOpenNMSClientFunction = (query: FlowParsedQueryRow, functionName: string, segmentName: string, type: string): string => {
    const clientFunction = !!query.queryFunctions.find((d) => d[functionName]) || segmentName === FlowSegmentStrings.Dscps ?
        segmentFunctionMapping[type][segmentName]?.default :
        segmentFunctionMapping[type][segmentName]?.topN

    return clientFunction || ''
}

/**
 * 
 * @param options All the options provided by Grafana
 * @returns The time range specified by the user as an object.
 */
const getTimeRange = (options: FlowQueryRequest<FlowQuery>) => {
    return {
        start: options.range.from.valueOf(),
        end: options.range.to.valueOf()
    }
}

/**
 * 
 * @param func An active, selected function
 * @param queryData Our raw Query data
 * @param oldData The existing parsed data row.
 * @param index Which query row are we on
 * @returns A list of UI set functions and their associated values
 */
const parseActiveFunctionsAndValues = (func: SelectableValue<string>, queryData: FlowQueryData, oldData: FlowParsedQueryRow, index: number) => {
    const data = { ...oldData }
    let inputParams: string | string[] | undefined = ''

    if (func.label) {
        const fullFunction = FlowFunctions.get(func.label)

        if ((fullFunction?.parameter || fullFunction?.parameter === '') && queryData.functionParameters) { // if there's a parameter, get it
            inputParams = queryData.functionParameters[index]
        } else if (fullFunction?.parameterOptions && queryData?.parameterOptions) { // if there's an option set, get it
            inputParams = queryData.parameterOptions?.[index]?.label
        }

        // Note, at this point, the parameter or option could be a multi-valued value like '{0.0.0.0,0.0.0.1}'
        // In some (all?) cases the parameter needs to be changed to a string[] before passing on to opennms-js dao

        data.queryFunctions.push({ [func.label]: inputParams })
    }

    return data
}

/**
 * 
 * @param type Series or Summary
 * @param query An invidual query row
 * @param options The full list of options, as provided by Grafana in the query method.
 * @param dataFromOpenNMS The data returned by OpenNMS by our query
 * @returns Based on the provided type (summary or series) transform the OpenNMS data into Grafana Data Frames
 */
export const processDataBasedOnType = (type: string, query: FlowParsedQueryRow, options: FlowQueryRequest<FlowQuery>, dataFromOpenNMS: Model.OnmsFlowTable) => {
    return type === 'series' ? processRawSeriesData(query, options, dataFromOpenNMS) : processRawSummaryData(query, options, dataFromOpenNMS)
}

/**
 * 
 * @param queryRow The row we're looking at
 * @param name The name of the function
 * @returns The function, If the provided function exists on the given row, otherwise undefined.
 */
const isFunctionSet = (queryRow: FlowParsedQueryRow, name: string) => {
    return !!queryRow.queryFunctions.find((d) => {
        return d[name] || d[name] === ''
    })
}

/**
 * 
 * @param label The label name we want to convert
 * @param column The column the label is associated to
 * @param queryRow The query row the column and label are associated too
 * @returns The converted label
 */
const convertLabel = (label: string, column: any, queryRow: FlowParsedQueryRow) => {
    let convertedLabel = label;
    if (queryRow.segment.label === FlowSegmentStrings.Dscps) {
        convertedLabel = dscpLabel(label);
    }

    const combineIngressEgress = isFunctionSet(queryRow, FlowFunctionStrings.combineIngressEgress);
    if (!combineIngressEgress) {
        if (column && column.ingress) {
            convertedLabel += ' (In)'
        } else if (column && !column.ingress) {
            convertedLabel += ' (Out)'
        }
    }
    const prefixValue = getFunctionValue(queryRow, FlowFunctionStrings.withPrefix);
    const suffixValue = getFunctionValue(queryRow, FlowFunctionStrings.withSuffix);

    if (prefixValue) {
        convertedLabel = prefixValue + convertedLabel;
    }
    if (suffixValue) {
        convertedLabel = convertedLabel + suffixValue;
    }

    return convertedLabel;
}

/**
 * 
 * @param queryData An individual query row
 * @param options The full list of options, as provided by Grafana to the main query function in the data source.
 * @param responseData The data directly from OpenNMS
 * @returns The OpenNMS data, in a Grafana ready package.
 */
const processRawSeriesData = (queryData: FlowParsedQueryRow, options: FlowQueryRequest<FlowQuery>, responseData: Model.OnmsFlowTable) => {
    let data = { ...responseData }
    const { start, end } = getTimeRange(options);

    if (!data.start || !data.end || !data.columns || !data.timestamps || !data.values) {
        throw new Error('series response did not contain all necessary information')
    }

    data = shouldWeSwapIngressAndEgress(data, queryData);

    const nanToZero = isFunctionSet(queryData, FlowFunctionStrings.nanToZero);
    const timestampsInRange = getInRangeTimestamps(data.timestamps, start, end);
    const columnsWithIndex: any[] = data.columns.map((column, colIdx) => { return { column, colIdx } });
    const parsedData: FlowTimestampedData = { timestamps: timestampsInRange, columns: columnsWithIndex, values: data.values };

    const multiplier = getMultiplier(queryData, data.timestamps)
    const combineIngressEgress = isFunctionSet(queryData, FlowFunctionStrings.combineIngressEgress);
    const onlyIngress = isFunctionSet(queryData, FlowFunctionStrings.onlyIngress);
    const onlyEgress = isFunctionSet(queryData, FlowFunctionStrings.onlyEgress);
    const negativeIngress = isFunctionSet(queryData, FlowFunctionStrings.negativeIngress);
    const negativeEgress = isFunctionSet(queryData, FlowFunctionStrings.negativeEgress);
    const functionsOptions = { nanToZero: nanToZero, multiplier: multiplier, sign: 1 };

    let processedData = columnsWithIndex
        .filter(({ column }) => !(onlyIngress && !column.ingress || onlyEgress && column.ingress))
        .map(({ column, colIdx }) => {
            const sign = negativeIngress && column.ingress || negativeEgress && !column.ingress ? -1 : 1;
            const datapoints = convertTimeStampedDataToDataFrame(colIdx, parsedData, { ...functionsOptions, sign: sign });
            return {
                target: convertLabel(column.label, column, queryData),
                datapoints
            }
        })

    if (combineIngressEgress) {
        const uniqueColumns = [...new Set(data.columns.map(col => col.label))]

        processedData = uniqueColumns
            .map((uniqueColumn) => {
                const datapoints = sumValuesGroupedByColumn(uniqueColumn, parsedData, functionsOptions)
                const columnIndexb = data.columns.findIndex((d) => d.label === uniqueColumn)

                return {
                    target: convertLabel(uniqueColumn as string, data.columns[columnIndexb], queryData),
                    datapoints
                }
            })
    }

    return processedData
}

/**
 * 
 * @param queryRow An individual query row
 * @param options the options as provided by Grafana to the query method in our data source.
 * @param rawData The data returned directly from OpenNMS.
 * @returns OpenNMS data in a table-ready format for Grafana.
 */
const processRawSummaryData = (queryRow: FlowParsedQueryRow, options: FlowQueryRequest<FlowQuery>, rawData: Model.OnmsFlowTable): DataFrame[] => {
    if (!rawData.headers || !rawData.rows) {
        throw new Error('table response did not contain all necessary information')
    }

    const columns = convertDataHeaderstoTableColumns(rawData.headers, queryRow);
    const rows = convertDataRowsToTableRows(rawData.rows, rawData.headers, queryRow);
    const dataFrame = createSummaryDataFrame(queryRow, rows.length)

    columns.forEach((col, idx) => {
        const values = rows.map((row) => { return row[idx] })

        const field = {
            name: col.text,
            type: FieldType.number, // will be a number, a string representing a number or else null
            config: {},
            values
        } as Field
        dataFrame.fields.push(field)
    })

    return [dataFrame]
}

const buildTopNFlowQueryParams = (functionName: string, functionParams: FlowFunctionParams, withDscp: string | string[]) => {
  const parameters: any[] = [
    functionParams.topN,
    functionParams.start,
    functionParams.end,
    functionParams.step,
    functionParams.includeOther,
    valueOrDefault(functionParams.withExporterNode, ''),
    valueOrDefault(functionParams.withIfIndex, ''),
    withDscp
  ]

  // series has 'step' but summaries does not
  if (!functionName.includes('Series')) {
    parameters.splice(3, 1)
  }

  return parameters
}

const buildSeriesFlowQueryParams = (functionName: string, functionParams: FlowFunctionParams, withDscp: string | string[]) => {
  const parameters: any[] = []

  const functionValues = functionParams.functionValue?.map(v =>  {
    if (isString(v)) {
      return v as string
    }

    // get 'withApplication', etc., these are keys of functionParams.functionValue
    const item = v as any
    const funcNames = Object.keys(FlowFunctionStrings).filter(k => k.startsWith('with'))

    for (let key of funcNames) {
      if (item[key]) {
        // opennms-js dao expects 'withHost' value to be a string[].
        // If the value was a multi-valued template variable like '{0.0.0.0,0.0.0.1}',
        // it needs to be turned into a string[].
        // Could be the case with others as well
        if (key === 'withHost') {
          if (isMultiValueString(item[key])) {
            return getMultiValues(item[key])
          }
        }

        return item[key]
      }
    }
  }) || []

  // parameters is something like this, but with some variations:
  // [
  //   functionValues,
  //   functionParams.start,
  //   functionParams.end,
  //   functionParams.step,
  //   functionParams.includeOther,
  //   valueOrDefault(functionParams.withExporterNode, ''),
  //   valueOrDefault(functionParams.withIfIndex, ''),
  //   withDscp
  // ]

  if (!functionName.includes('Dscp')) {
    parameters.push(functionValues)
  }

  parameters.push(functionParams.start)
  parameters.push(functionParams.end)

  // series has 'step' but summaries does not
  if (functionName.includes('Series')) {
    parameters.push(functionParams.step)
  }

  if (!functionName.includes('Dscp')) {
    parameters.push(functionParams.includeOther)
  }
  parameters.push(valueOrDefault(functionParams.withExporterNode, ''))
  parameters.push(valueOrDefault(functionParams.withIfIndex, ''))
  parameters.push(withDscp)

  return parameters
}

/**
 * 
 * @param functionName The function name we want to run
 * @param parameters FlowFunctionParams The parameters we want to pass our function
 * @param client The client that holds the function
 * @returns Data from OpenNMS (if all goes well)
 */
const queryOpenNMSClientWithFlowFunctionParams = async (functionName: string, functionParams: FlowFunctionParams, client: ClientDelegate): Model.OnmsFlowTable => {
  // Construct parameters array for ClientDelegate Flows functions
  // see ClientDelegate.getSeriesForTopNApplications, etc.
  let parameters: any[] = []

  // functionParams.withDscp can be string or string[]. ClientDelegate calls expect a string[]
  const withDscp = isString(functionParams.withDscp) ? [functionParams.withDscp as string] : functionParams.withDscp

  // all 'TopN' items have same pattern
  if (functionName.includes('TopN')) {
    parameters = buildTopNFlowQueryParams(functionName, functionParams, withDscp || [])
  } else {
    parameters = buildSeriesFlowQueryParams(functionName, functionParams, withDscp || [])
  }

  return client[functionName](...parameters)
}

/**
 * 
 * @param inData Our Raw Response Data from OpenNMS
 * @param queryData An individual query row
 * @returns The raw response with ingress columns swapped if enabled
 */
const shouldWeSwapIngressAndEgress = (inData: any, queryData: FlowParsedQueryRow) => {
    const outData = { ...inData };
    const swapIngressEgress = isFunctionSet(queryData, FlowFunctionStrings.swapIngressEgress);
    if (!!swapIngressEgress) {
        outData.columns = outData.columns.map((col) => {
            col.ingress = !col.ingress;
            return col;
        })
    }
    return outData;
}

/**
 * 
 * @param groupByColumn current column name
 * @param parsedData object with timestamps, columns and data values
 * @param options functions selected by the user if any (nanToZero, multiplier)
 * @returns 
 */
const sumValuesGroupedByColumn = (groupByColumn: any, parsedData: FlowTimestampedData, options: FlowFunctionOptions) => {
    return parsedData.timestamps
        .map((timestamp, tindex) => {
            const sum = parsedData.columns
                // determine the indexes of those columns that have the same label as the current column
                .filter(({ column }) => column.label === groupByColumn)
                // get the values of those columns ...
                .map(({ colIdx }) => {
                    const v = parsedData.values[colIdx][tindex]
                    return isNaN(Number(v)) && options.nanToZero ? 0 : v
                })
                // ... and sum them up
                .reduce((prv, cur) => prv + (cur ? cur : 0), 0)
            return [sum * options.multiplier, timestamp]
        })
}

export const queryTemplateVariable = async (query: string, templateSrv: any, client: ClientDelegate, simpleRequest: SimpleOpenNMSRequest) => {
    const clients: FlowTemplateVariableClientService = { client, simpleRequest };
    const templateVariableQuery: FlowTemplateVariableQueryService = getTemplateVariableQuery(query, templateSrv);

    if (!templateVariableQuery.function || !templateVariableQuery.function.name) {
        return Promise.resolve([]);
    }

    return await getTemplateVariableResultsFor(templateVariableQuery, clients);
}

const getTemplateVariableQuery = (query: string, templateSrv: any) => {
    return {
        function: getTemplateVariableFunction(templateSrv.replace(query)),
        start: templateSrv.timeRange.from.valueOf(),
        end: templateSrv.timeRange.to.valueOf()
    }
}

export const getTemplateVariableFunction = (query: string) => {
    return FlowTemplateVariableFunctionExpression
        .map(({ name, expression }) => ({ name: name, result: query.match(expression) }))
        .find(({ name, result }) => result) ?? {}
}

const getTemplateVariableResultsFor = async (templateQueryFunction: FlowTemplateVariableQueryService,
    clients: FlowTemplateVariableClientService) => {
    const queryName = templateQueryFunction.function.name ?? '';
    templateQueryFunction = retrieveParametersFor(templateQueryFunction);

    switch (queryName) {
        case FlowTemplateVariablesStrings.locations:
            return await metricFindLocations(clients);
        case FlowTemplateVariablesStrings.applications:
            return await metricFindApplications(clients, templateQueryFunction);
        case FlowTemplateVariablesStrings.conversations:
            return await metricFindConversations(clients, templateQueryFunction);
        case FlowTemplateVariablesStrings.hosts:
            return await metricFindHosts(clients, templateQueryFunction);
        case FlowTemplateVariablesStrings.exporterNodesWithFlows:
            return await metricFindExporterNodes(clients, templateQueryFunction);
        case FlowTemplateVariablesStrings.interfacesOnExporterNodeWithFlows:
            return await metricFindInterfacesOnExporterNode(clients, templateQueryFunction);
        case FlowTemplateVariablesStrings.dscpOnExporterNodeAndInterface:
            return await metricFindDscpOnExporterNodeAndInterface(clients, templateQueryFunction);
        default: return Promise.resolve([]);
    }
}

const retrieveParametersFor = (templateQueryFunction: FlowTemplateVariableQueryService) => {
    const queryResult = templateQueryFunction.function.result ?? ''
    const queryName = templateQueryFunction.function.name ?? ''

    let args = queryResult.length > 1 ? queryResult[1] : null
    // params need to be added in order
    let params: any[] = [templateQueryFunction.start, templateQueryFunction.end]

    switch (queryName) {
        case FlowTemplateVariablesStrings.applications:
            params.push(getNumberOrDefault(args, 0))
            params.forEach((p, idx) => templateQueryFunction[ApplicationsParams[idx].name] = p)
            break
        case FlowTemplateVariablesStrings.conversations:
            if (args) {
                const splitArgs: string[] = args.split(',').map(v => v.trim())

                if (splitArgs.length === 4 || splitArgs.every(s => isNaN(parseInt(s, 10)))) {
                    params.push(splitArgs)
                } else if (splitArgs.length === 1) {
                    params.push([null, null, null, getNumberOrDefault(splitArgs[0], 0)])
                } else if (splitArgs.length === 2) {
                    params.push([splitArgs[0], null, null, getNumberOrDefault(splitArgs[1], 0)])
                } else if (splitArgs.length === 3) {
                    params.push([splitArgs[0], splitArgs[1], null, getNumberOrDefault(splitArgs[2], 0)])
                }
            }
            params.forEach((p, idx) => templateQueryFunction[ConversationParams[idx].name] = p)
            break
        case FlowTemplateVariablesStrings.hosts:
            if (args) {
                const splitArgs: string[] = args.split(',').map(v => v.trim())
                if (splitArgs.length === 2 || splitArgs.every(s => isNaN(parseInt(s, 10)))) {
                    params.push(splitArgs)
                } else if (splitArgs.length === 1) {
                    params.push([null, ...splitArgs])
                }
            }
            params.forEach((p, idx) => templateQueryFunction[HostsParams[idx].name] = p)
            break
        case FlowTemplateVariablesStrings.exporterNodesWithFlows:
            params = [args]
            params.forEach((p, idx) => templateQueryFunction[ExporterNodesParams[idx].name] = p)
            break
        case FlowTemplateVariablesStrings.interfacesOnExporterNodeWithFlows:
            params = [args]
            params.forEach((p, idx) => templateQueryFunction[InterfacesOnExporterNodeWithFlowsParams[idx].name] = p)
            break
        case FlowTemplateVariablesStrings.dscpOnExporterNodeAndInterface:
            params = queryResult.slice(1, 4)
            params.forEach((p, idx) => templateQueryFunction[DscpOnExporterNodeAndInterfaceParams[idx].name] = p)
            break
    }

    return templateQueryFunction
}

const metricFindLocations = async ({ client, simpleRequest }) => {
    return await simpleRequest.getLocations();
}

const metricFindApplications = async ({ client, simpleRequest }, service: FlowTemplateVariableQueryService) => {
    return await simpleRequest.getApplications(service.start, service.end, getNumberOrDefault(service.limit, 0));
}

const metricFindHosts = async ({ client, simpleRequest }, service: FlowTemplateVariableQueryService) => {
    return await simpleRequest.getHosts(service.start, service.end, service.pattern, getNumberOrDefault(service.limit, 0));
}

const metricFindConversations = async ({ client, simpleRequest }, service: FlowTemplateVariableQueryService) => {
    return await simpleRequest.getConversations(service.start, service.end, service.application, service.location, service.protocol, service.limit);
}

const metricFindExporterNodes = async ({ client, simpleRequest }, service: FlowTemplateVariableQueryService) => {
    const exporters = await client.getExporters();
    let results = [] as any[];
    exporters.forEach((exporter) => {
        results.push({ text: exporter.label, value: exporter.id, expandable: true });
    });
    return await getFilteredNodes({ client, simpleRequest }, results, service.nodeFilter);
}

const metricFindInterfacesOnExporterNode = async ({ client, simpleRequest }, service: FlowTemplateVariableQueryService) => {
    let results = [] as any[]
    const nodeIds = isMultiValueString(service.nodeId) ? getMultiValues(service.nodeId) : [service.nodeId]

    for (let nodeId of nodeIds) {
      const node = await simpleRequest.getNodeByIdOrFsFsId(nodeId)
      const exporter = await client.getExporter(node.id)
      exporter.interfaces.forEach(iff => {
          results.push({ text: `${iff.name}(${iff.index})`, value: iff.index, expandable: true })
      })
    }

    return results
}

const metricFindDscpOnExporterNodeAndInterface = async ({ client, simpleRequest }, service: FlowTemplateVariableQueryService) => {
    let dscpValues = await client.getDscpValues(service.nodeCriteria, service.iface?.trim() || '', service.start, service.end);

    return dscpSelectOptions(dscpValues);
}

export const getFilteredNodes = async ({ client, simpleRequest }, exporterNodes?: any[], filterParam?: string): Promise<any> => {

    let results: any[] = [];
    const filtermap = getNodeFilterMap(filterParam);
    if (filtermap.size === 0) {
        return await Promise.resolve(exporterNodes);
    }
    if (exporterNodes) {
        for (const exportedNode of exporterNodes) {
            let matchAll = true;
            for (const pair of filtermap) {
                const node = await client.getNode(exportedNode.value);
                let nodePropertyValue = node[pair[0]];
                const regex = new RegExp(pair[1]);
                if (!regex.test(nodePropertyValue)) {
                    matchAll = false;
                    break;
                }
            }
            if (matchAll) {
                results.push(exportedNode);
            }
        }
        return results.filter(result => result);
    }
    else {
        return await Promise.resolve(exporterNodes);
    }
}

/**
 * Converts functionParameters and parameterOptions to template variables if they are present.
 * @param item a FlowQueryData instance
 * @param templateSrv grafana service to replace template variables
 * @returns FlowQueryData
 */
export const convertTemplateVariables = (item: FlowQueryData, templateSrv) => {
    item.functions?.forEach((f, idx) => {
        if (item.functionParameters[idx]) {
            item.functionParameters[idx] = templateSrv.replace(item.functionParameters[idx])
        }

        if (item.parameterOptions[idx] && item.parameterOptions[idx].value) {
            item.parameterOptions[idx].value = templateSrv.replace(item.parameterOptions[idx].value)
            item.parameterOptions[idx].label = templateSrv.replace(item.parameterOptions[idx].label)
        }
    })

    return item
}

/**
 * Search for an IfIndex (number) when using template variables from different datasources 
 * that provides resource name or label instead 
 * @param nodeQuery node
 * @param iface interface name or label
 * @param simpleRequest rest service
 * @returns ifIndex if any or iface param if not match is found.
 */
export const lookupIfIndex = async (nodeQuery: string | undefined, iface: string | number | null | undefined, simpleRequest: SimpleOpenNMSRequest) => {
    if (!nodeQuery || !iface || !Number.isNaN(Number(iface))) {
      return iface;
    }

    const resources = await simpleRequest.getResourcesForNode(nodeQuery);

    if (resources) {
        for (const resource of resources) {
            let result = findResourceIfIndex(resource, iface)
            if (result) {
                iface = result
                break
            }
        }
    }
    return iface
}

/**
 * Search for IfIndex in resource from measurement rest end point 
 * @param resource 
 * @returns ifIndex if exists or null
 */
const findResourceIfIndex = (resource: OnmsMeasurementResource, iface?: string | number | null | undefined): string | null | undefined => {
    const regexSnmpIfaceId = /interfaceSnmp\[(.*)\]/;
    const regexSnmpIface = /element\/snmpinterface\.jsp\?node=.*&ifindex=(\d+)/;
    const idMatch = resource.id.match(regexSnmpIfaceId);

    if (idMatch && (idMatch[0] === iface || (idMatch[1] && idMatch[1] === iface)) && resource.link) {
        const ifIndexMatch = resource.link.match(regexSnmpIface);
        if (ifIndexMatch && ifIndexMatch[1]) {
            return ifIndexMatch[1];
        }
    }
    return null

}

