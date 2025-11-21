import { PerformanceTypeOptions } from '../../../datasources/perf-ds/constants'
import { PerformanceQuery, PerformanceQueryFilterParameter } from '../../../datasources/perf-ds/types'

export const updatePerformanceQuery = (source: any) => {
  // Note, target.datasource will be set in caller

  if (source.type) {
    if (source.type === 'attribute') {
      return convertAttributeQuery(source)
    } else if (source.type === 'expression') {
      return convertExpressionQuery(source)
    } else if (source.type === 'filter') {
      return convertFilterQuery(source)
    } else if (source.type === 'stringProperty') {
      return convertStringPropertyQuery(source)
    }
  }

  // should not get here
  return source
}

// Convert old-style Attribute Query to new PerformanceQuery with PerformanceAttributeState
// Old:
// {
//   "aggregation": "AVERAGE",
//   "attribute": "loadavg5",
//   "hide": true,
//   "label": "label",
//   "nodeId": "$node",
//   "refId": "A",
//   "resourceId": "nodeSnmp[]",
//   "type": "attribute"
// }
const convertAttributeQuery = (source: any): PerformanceQuery | any => {
  // may need to handle where source.datasource is { type, uid }, not a template variable
  const query = {
    datasource: source.datasource,
    hide: source.hide || false,
    key: source.key || '',
    label: source.label || '',
    queryType: source.queryType || '',
    refId: source.refId || '',
    performanceType: PerformanceTypeOptions.Attribute,
    // PerformanceAttributeState
    attribute: {
      label: source.label || '',
      node: {
        id: source.nodeId,
        label: source.nodeId
      },
      resource: {
        id: source.resourceId,
        label: source.resourceId
      },
      attribute: {
        name: source.attribute || '',
        label: source.attribute || ''
      },
      subAttribute: source.subattribute || undefined,
      fallbackAttribute: {},
      aggregation: {
        label: source.aggregation || ''
      }
    },
    filter: {},
    filterState: {},
    performanceState: {},
    format: source.format || undefined,
    rawSql: source.rawSql || undefined
  }

  const fallbackAttr = source.fallbackAttribute || source['fallback-attribute']

  if (fallbackAttr) {
    query.attribute.fallbackAttribute = {
      name: fallbackAttr,
      label: fallbackAttr
    }
  }

  // May need to figure out "new" representation of these "time_series" attribute queries with "rawSql"
  // {
  //   ...
  //   "format": "time_series",
  //   "hide": true,
  //   "nodeId": "$node",
  //   "rawSql": "SELECT\n  $__time(time_column),\n  value1\nFROM\n  metric_table\nWHERE\n  $__timeFilter(time_column)\n",
  // }

  return query
}

// Convert old-style Expression Query to new PerformanceQuery with expression
// Old:
// {
//   "attribute": "loadavg5Pct",
//   "expression": "loadavg5 / 100",
//   "label": "Load (Avg)",
//   "refId": "B",
//   "type": "expression"
// }
const convertExpressionQuery = (source: any): PerformanceQuery | any => {
  const query = {
    datasource: source.datasource,
    hide: source.hide || false,
    key: source.key || '',
    label: source.label || '',
    queryType: source.queryType || '',
    refId: source.refId || '',
    performanceType: PerformanceTypeOptions.Expression,
    expression: source.expression || '',
    attribute: {},
    filter: {},
    filterState: {},
    performanceState: {}
  }

  if (source.attribute) {
    query.attribute = {
      attribute: {
        name: source.attribute
      }
    }
  }

  return query
}

// Convert old-style Filter Query to new PerformanceQuery format
// Old:
// {
//   "filter": {
//     "backend": "R",
//     "canonicalName": "org.opennms.netmgt.measurements.filters.impl.TrendLine",
//     "description": "Fits a trend line or polynomial to a given column.",
//     "name": "Trend",
//     "parameter": [
//       {
//         "default": null,
//         "description": "Input column.",
//         "displayName": "Input",
//         "key": "inputColumn",
//         "required": true,
//         "type": "string"
//       },
//       ...
//       {
//         "default": "1",
//         "description": "Polynomial order of the trend line/curve. Set this to 1 for a line.",
//         "displayName": "Order",
//         "key": "polynomialOrder",
//         "required": false,
//         "type": "int"
//       }
//     ]
//   },
//   "filterParameters": {
//     "inputColumn": "dskUsed",
//     "outputColumn": "dskTrend",
//     "secondsAhead": "57600"
//   },
//   "refId": "C",
//   "type": "filter"
// }
const convertFilterQuery = (source: any): PerformanceQuery | any => {
  if (source.filter) {
    const query = {
      datasource: source.datasource,
      hide: source.hide || false,
      key: source.key || '',
      label: source.label || '',
      queryType: source.queryType || '',
      refId: source.refId || '',
      performanceType: PerformanceTypeOptions.Filter,
      expression: '',
      attribute: {},
      performanceState: {},
      filter: {
        backend: source.filter.backend,
        canonicalName: source.filter.canonicalName,
        description: source.filter.description,
        label: source.filter.label || source.filter.name,
        name: source.filter.name,
        parameter: []
      },
      filterState: {}
    }

    query.filter.parameter = source.filter.parameter.map(p => {
      return {
        default: p.default ?? null,
        description: p.description,
        displayName: p.displayName,
        key: p.key,
        required: p.required || true,
        type: p.type
      } as PerformanceQueryFilterParameter
    })

    query.filterState = convertFilterState(source)

    return query
  }

  // was not a filter query, return original
  return source
}

const convertFilterState = (source: any) => {
  const filterState = {}

  Object.keys(source.filterParameters).forEach(key => {
    const sourceItem = source.filter?.parameter?.find(f => f.key === key)
    const description = sourceItem?.description || ''
    const displayName = sourceItem?.displayName || ''
    const required = sourceItem?.required || true
    const itemType = sourceItem?.type || 'string'

    const item =
      {
        filter: {
          description,
          displayName,
          key,
          required,
          type: itemType
        },
        value: source.filterParameters[key]
      }

      filterState[key] = item
  })

  return filterState
}

// Legacy string property:
// {
//   nodeId: 'selfmonitor:1',
//   refId: 'A',
//   resourceId: 'rpcMetrics[Loc0.SNMP]',
//   stringProperty: 'domain',
//   type: 'stringProperty'
// }
//
// New:
// {
//   node: {
//
//   },
//   resource: {
//     id: 'node[selfmonitor:1].rpcMetrics[Loc0.SNMP]',
//     label: 'Loc0.SNMP',
//     name: 'Loc0.SNMP',
//     parentId: 'node[selfmonitor:1]'
//   }
// }
const convertStringPropertyQuery = (source: any) => {
  const legacyNodeId: string = source.nodeId || ''

  // this needs some work, may need to do an API call to get
  // node id and label from legacyNodeId value
  // as it may be in FS:FID or node id or hostname form
  // however, at least the values will show up in the query editor and user could change them
  const nodeState = {
    id: legacyNodeId,
    label: legacyNodeId
  }

  const legacyResourceId: string = source.resourceId || ''

  // 'label' and 'name' will be filled in at runtime
  const resourceState = {
    id: `node[${legacyNodeId}].${legacyResourceId}`,
    label: legacyResourceId,
    parentId: `node[${legacyNodeId}]`
  }

  const stringProperty = source.stringProperty || ''

  const stringPropertyState = {
    node: nodeState,
    resource: resourceState,
    stringProperty: {
      label: stringProperty,
      value: stringProperty
    }
  }

  const query = {
    datasource: source.datasource,
    hide: source.hide || false,
    key: source.key || '',
    label: source.label || '',
    queryType: source.queryType || '',
    refId: source.refId || '',
    performanceType: PerformanceTypeOptions.StringProperty,
    expression: {},
    attribute: {},
    filter: {},
    filterState: {},
    performanceState: {},
    stringPropertyState
  }

  return query
}
