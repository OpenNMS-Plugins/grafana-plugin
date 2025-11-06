
import { DataQuery, DataQueryRequest, DataSourceJsonData, QueryEditorProps, QueryResultMeta, SelectableValue } from '@grafana/data'
import { PerformanceDataSource } from './PerformanceDataSource'

/**
 * These are options configured for each DataSource instance
 */
export interface PerformanceDataSourceOptions extends DataSourceJsonData {
  path?: string
  enableInputValueOverrideComponents?: boolean
  // overrideAttributeQueryNodeLimit?: number
  attributeQueryNodeLimit?: {
    unlimited: boolean
    limit: number
  }
}

// TODO: check which of these are required
export interface PerformanceQueryFilterParameter {
  default: any | null; // probably a string | null
  description?: string;
  displayName?: string;
  key?: string;
  required?: boolean;
  type?: string;
}

// TODO: check which of these are required
export interface PerformanceQueryFilter {
  backend?: string;
  canonicalName?: string;
  description?: string;
  label?: string;
  name: string;
  parameter?: PerformanceQueryFilterParameter[];
}

export interface PerformanceQueryFilterStateItem {
  filter: PerformanceQueryFilterParameter;
  // TODO: confirm what is valid here
  value: string | number | { value: string | number };
}

export interface PerformanceAttributeItemState {
  id: string;
  label?: string;
}

export interface PerformanceAttributeState {
  // this may be an OnmsNode object, or else just an id and/or label
  node: PerformanceAttributeItemState;
  resource: PerformanceAttributeItemState;
  attribute: { name: string, label?: string };
  subAttribute?: string | number;
  fallbackAttribute?: { name: string };
  aggregation: { label?: string };
  label: string;
}

export interface PerformanceQuery extends DataQuery {
  queryText?: string;
  constant?: number;
  expression?: string;
  label?: string;
  performanceType: QuickSelect;
  attribute: PerformanceAttributeState;
  filter: PerformanceQueryFilter;
  filterState: { [key: string]: PerformanceQueryFilterStateItem };
  stringPropertyState: PerformanceStringPropertyState;
}

export interface PerformanceQueryRequest<T extends DataQuery> extends DataQueryRequest<T> {
  queryText: string;
}

export interface StringPropertyQuery extends DataQuery {
  type?: string;
  nodeId?: string;
  resourceId?: string;
  stringProperty?: string;
}

export type DefinedStringPropertyQuery = Required<StringPropertyQuery>

export interface OnmsMeasurementsQuerySource {
  // label both for display and for use by subsequent Expression or Filter queries
  // if empty, the 'attribute' will be used
  label: string;
  resourceId: string;
  attribute: string;
  datasource?: string;   // mapped from subAttribute
  ['fallback-attribute']?: string;
  aggregation?: string;  // should be 'AVERAGE', 'MIN', 'MAX' or 'LAST'
  transient: boolean;
  nodeId?: string; // this may be added or removed dynamically
}

export interface OnmsMeasurementsQueryExpression {
  // label both for display and for use by subsequent Expression or Filter queries
  label: string;
  // this is the jexl or similar expression. It can reference result of a former Attribute query
  // by referencing the Attribute query's 'label' property
  value: string;
  transient: boolean;
}

export interface OnmsMeasurementsQueryFilterParam {
  key: string;
  value: string | { value: string }
}

export interface OnmsMeasurementsQueryFilter {
  name: string;
  parameter: OnmsMeasurementsQueryFilterParam[]
}

// See features/measurements/api, package org.opennms.netmgt.measurements.model.QueryRequest
export interface OnmsMeasurementsQueryRequest {
  start: number;
  end: number;
  step: number;
  relaxed: boolean; // enable relaxed mode, which allows for missing attributes
  maxrows: number;
  source: OnmsMeasurementsQuerySource[];  // for Attribute queries
  expression: OnmsMeasurementsQueryExpression[];
  filter: OnmsMeasurementsQueryFilter[];
}

export interface OnmsMeasurementsQueryNode {
  id: number;
  ["foreign-source"]: string;
  ["foreign-id"]: string;
  label: string;
}

export interface OnmsMeasurementsQueryResource {
  id: string;
  ["parent-id"]: string;
  label: string;
  name: string;
  ["node-id"]: number;
  node: OnmsMeasurementsQueryNode;
}

export interface OnmsMeasurementsQueryMetadata {
  resources: Array<{ resource: OnmsMeasurementsQueryResource }>;
  nodes: Array<{ node: OnmsMeasurementsQueryNode }>;
}

export interface OnmsMeasurementsQueryResponseColumnItem {
  values: Array<string | number | null> // number, string representing a number, 'NaN' or null
}

// See features/measurements/api, package org.opennms.netmgt.measurements.model.QueryResponse
export interface OnmsMeasurementsQueryResponse {
  step: number
  start: number
  end: number
  timestamps: number[]
  labels: string[]
  columns: OnmsMeasurementsQueryResponseColumnItem[]
  constants: Array<{ key: string, value: string }>
  metadata: OnmsMeasurementsQueryMetadata
}

export interface QuickSelect {
  label?: string,
  value?: number
}

export type PerformanceQueryEditorProps = QueryEditorProps<PerformanceDataSource, PerformanceQuery, PerformanceDataSourceOptions>;

export interface OnmsQueryResultMeta extends QueryResultMeta {
  entity_metadata: any[];
}



export interface PerformanceStringPropertyProps {
  query: PerformanceQuery;
  updateQuery: Function;
  loadNodes: (query?: string | undefined) => Promise<Array<SelectableValue<{ id: string }>>>;
  loadResourcesByNode: Function
  loadStringPropertiesForState: Function
  loadResourcesForStringPropertyState: Function
}

export interface PerformanceStringPropertyState {
  node: { id?: string, label?: string };
  resource: { id?: string, label?: string, stringPropertyAttributes?: Record<string, string> };
  stringProperty: { label: string, value: string };
}
