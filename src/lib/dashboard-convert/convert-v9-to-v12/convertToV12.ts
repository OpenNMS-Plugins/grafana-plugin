import { DashboardCursorSync } from '@grafana/data'
import {
  AnnotationPanelFilter,
  AnnotationQuery,
  AnnotationTarget,
  Dashboard,
  DashboardLink,
  DashboardLinkType,
  DataQuery,
  DataSourceRef,
  defaultAnnotationQuery,
  defaultDashboard,
  defaultGridPos,
  FieldConfigSource,
  GridPos,
  Panel,
  RowPanel,
  TimeOption,
  TimePickerConfig,
  VariableHide,
  VariableModel,
  VariableOption,
  VariableRefresh,
  VariableSort,
  VariableType
} from '@grafana/schema'
import { ConvertOptions, ConvertResponse } from '../types'
import {
  convertToBoolean,
  convertToInt,
  convertToString,
  isDefined,
  isDefinedObject,
  isEnumValueOfType,
  isNonEmptyArray
} from '../../parseUtils'
import { convertLegacyGraphToTimeSeriesPanel, isLegacyGraphPanel } from '../convert-from-v8/graphToTimeSeriesPanel'
import { getOpenNmsPluginVersion } from '../pluginVersions'

/**
 * Parse a request into a ConvertResponse containing a Grafana v12 compatible Dashboard.
 * The request can contain either an object that was already parsed into a Grafana v9 Dashboard-compatible object,
 * (i.e. it is an 'any' object that has all the required fields of v9 Dashboard object),
 * or is a Json string that can be parsed into a Grafana v9-v12 Dashboard-compatible object.
 * This function ensures that the resulting 'dashboardV12' field is a typed Grafana v12 Dashboard object.
 * 
 * The 'convert-from-v8' functionality should be used before calling this to convert Helm/OPG v8 into v9.
 */
export const convertDashboardToV12 = (request: ConvertResponse, dashboardTitle: string, options: ConvertOptions): ConvertResponse => {
  // Assume this is either an object parsed by convertFromV8, or else Grafana V9-V12 dashboard json string.
  // It should be an object that is at least Grafana V9 Dashboard compatible.
  let source: any

  if (isDefined(request.dashboardV9)) {
    source = request.dashboardV9
  } else {
    try {
      source = JSON.parse(request.json)
    } catch (e: any) {
      return {
        dashboardV9: request.dashboardV9,
        json: request.json,
        isError: true,
        errorMessage: `Error parsing source Json: ${e.message || '(unknown)'}`,
        targetPluginVersion: 12
      }
    }
  }

  // Make an empty Grafana V12 Dashboard object
  // Then we map everything from 'source' into it
  // See @grafana/schema, dashboard_types.gen.d.ts, interface Dashboard
  const dashboard: Dashboard = mapV9toV12(source, dashboardTitle, options)

  const json = JSON.stringify(dashboard, null, 2)

  const response: ConvertResponse = {
    dashboardV9: request.dashboardV9,
    dashboardV12: dashboard,
    json: json,
    isError: false,
    targetPluginVersion: 12
  }

  return response
}

const mapRequires = (sourceRequires: any[]) => {
  let targetRequires: any[] = []

  for (const r of sourceRequires) {
    let obj = { ...r }

    if (isDefinedObject(r) && (r.type === 'datasource' || r.type === 'panel')) {
      // '__requires[].version' is the minimum version of the plugin named by 'id', which is one
      // of our datasource or panel plugins rather than the app, and Grafana reads it as a semver
      // string. An id we do not recognise is left alone rather than given a version we would be
      // guessing at.
      // Set it on the copy; mutating 'r' would corrupt the caller's source dashboard.
      const version = getOpenNmsPluginVersion(r.id)

      if (version) {
        obj['version'] = version
      }
    }

    targetRequires.push(obj)
  }

  return targetRequires
}

// Map an array out of the untyped source Json, giving the result a real element type so the
// compiler can check it against the schema (a '.map' on an 'any' yields another 'any').
// Note the callback takes only the item: passing a two-argument function such as
// convertToString straight to Array.map would feed it the index as its second argument.
const mapArray = <T>(obj: any, mapItem: (item: any) => T): T[] => {
  // a null entry is mapped as an empty object: the item mappers read properties off it, and a
  // Json array can legitimately contain nulls
  return isNonEmptyArray(obj) ? (obj as any[]).map(item => mapItem(item ?? {})) : []
}

// source is a Grafana V9 dashboard compatible object.
// We then map it into a Grafana 12 Dashboard typed object
// See @grafana/schema, dashboard_types.gen.d.ts, interface Dashboard
const mapV9toV12 = (source: any, dashboardTitle: string, options: ConvertOptions) => {
  const dashboard: Dashboard = createEmptyV12Dashboard()

  // leaving __inputs as-is, they should either be ok or else were already converted from OPG v8 to v9
  if (isNonEmptyArray(source['__inputs'])) {
    dashboard['__inputs'] = source['__inputs']
  }

  // leave __requires as-is, except that an opennms entry gets the current plugin version
  if (isNonEmptyArray(source['__requires'])) {
    dashboard['__requires'] = mapRequires(source['__requires'])
  }

  if (isDefinedObject(source.annotations) && isNonEmptyArray(source.annotations.list)) {
    dashboard.annotations = {
      list: mapArray(source.annotations.list, mapAnnotationQuery)
    }
  }

  if (isDefined(source.description)) {
    dashboard.description = convertToString(source.description)
  }

  if (isDefined(source.editable)) {
    dashboard.editable = convertToBoolean(source.editable, dashboard.editable)
  }

  if (isDefined(source.fiscalYearStartMonth)) {
    dashboard.fiscalYearStartMonth = convertToInt(source.fiscalYearStartMonth)
  }

  if (isDefined(source.gnetId)) {
    dashboard.gnetId = convertToString(source.gnetId)
  }

  if (isDefined(source.graphTooltip)) {
    const graphTooltip = convertToInt(source.graphTooltip)

    if (isEnumValueOfType(DashboardCursorSync, graphTooltip)) {
      dashboard.graphTooltip = graphTooltip
    }
  }

  if (isNonEmptyArray(source.links)) {
    dashboard.links = mapArray(source.links, mapDashboardLink)
  }

  if (isDefined(source.liveNow)) {
    dashboard.liveNow = convertToBoolean(source.liveNow, dashboard.liveNow)
  }
  
  if (isNonEmptyArray(source.panels)) {
    dashboard.panels = mapArray(source.panels, p => mapPanelOrRowPanel(p, options))
  }

  if (isDefined(source.preload)) {
    dashboard.preload = convertToBoolean(source.preload)
  }

  if (isDefined(source.refresh)) {
    dashboard.refresh = convertToString(source.refresh)
  }

  if (isDefined(source.revision)) {
    dashboard.revision = convertToInt(source.revision)
  }

  if (isDefined(source.schemaVersion)) {
    dashboard.schemaVersion = convertToInt(source.schemaVersion)
  }

  if (isDefinedObject(source.snapshot)) {
    dashboard.snapshot = mapDashboardSnapshot(source.snapshot)
  }

  if (isNonEmptyArray(source.tags)) {
    dashboard.tags = mapArray(source.tags, t => convertToString(t))
  }  

  if (isDefinedObject(source.templating) && isNonEmptyArray(source.templating.list)) {
    dashboard.templating = {
      list: mapArray(source.templating.list, mapVariableModel)
    }
  }

  if (isDefinedObject(source.time) && isDefined(source.time.from) && isDefined(source.time.to)) {
    dashboard.time = {
      from: convertToString(source.time.from),
      to: convertToString(source.time.to)
    }
  }

  if (isDefinedObject(source.timepicker)) {
    dashboard.timepicker = mapTimePickerConfig(source.timepicker)
  }

  if (isDefined(source.timezone)) {
    // not doing validation that this is a valid IANA TZDB zone ID or 'browser' or 'utc'
    dashboard.timezone = convertToString(source.timezone)
  }

  if (dashboardTitle.length > 0) {
    dashboard.title = dashboardTitle
  } else if (isDefined(source.title)) {
    dashboard.title = convertToString(source.title)
  }

  if (isDefined(source.version)) {
    dashboard.version = convertToInt(source.version, 1)
  } else {
    dashboard.version = 1
  }

  if (options.incrementDashboardVersion) {
    dashboard.version++
  }

  if (isDefined(source.weekStart)) {
    dashboard.weekStart = convertToString(source.weekStart)
  }

  return dashboard
}

const mapDataSourceRef = (obj: any): DataSourceRef | null => {
  if (obj === null) {
    return null
  }
  
  // In older dashboards the 'datasource' of a panel, target, annotation or variable could be
  // a plain string: either a template variable ('$datasource', '${datasource}', '[[datasource]]')
  // or the name of a datasource ('OpenNMS Performance').
  // Both become the 'uid', which is how Grafana resolves a DataSourceRef; this mirrors
  // Grafana's own schema migration (migrateDatasourceNameToRef). Putting either of them in
  // 'type' instead would leave the panel unable to find its datasource.
  if (typeof obj === 'string') {
    const nameOrVariable = obj.trim()

    // nothing to reference, so fall back to the default datasource
    if (!nameOrVariable) {
      return null
    }

    return { uid: nameOrVariable }
  }

  // full DataSourceRef object
  if (isDefined(obj.type) || isDefined(obj.uid) || isDefined(obj.apiVersion)) {
    const datasource: DataSourceRef = {
      apiVersion: isDefined(obj.apiVersion) ? convertToString(obj?.apiVersion) : undefined,
      type: isDefined(obj.type) ? convertToString(obj?.type) : undefined,
      uid: isDefined(obj.uid) ? convertToString(obj?.uid) : undefined
    }

    return datasource
  }

  return null
}

type OpgAnnotationQuery = AnnotationQuery<AnnotationTarget & DataQuery>

const mapAnnotationQuery = (obj: any): OpgAnnotationQuery => {
  // Build the fields we normalize as a typed object so the compiler checks them against
  // the schema, then merge it over the source so that datasource-specific query fields,
  // and any fields added to the schema after this was written, are preserved.
  const annotation: OpgAnnotationQuery = {
    // an annotation with no explicit 'enable' is on in Grafana, so do not switch it off here
    enable: defaultAnnotationQuery.enable ?? true,
    iconColor: '',
    name: ''
  }

  if (isDefined(obj.builtIn)) {
    annotation.builtIn = convertToInt(obj.builtIn)
  }

  if (isDefined(obj.datasource)) {
    annotation.datasource = mapDataSourceRef(obj.datasource)
  }

  if (isDefined(obj.enable)) {
    annotation.enable = convertToBoolean(obj.enable)
  }

  if (isDefinedObject(obj.filter)) {
    const filter: AnnotationPanelFilter = {
      exclude: convertToBoolean(obj.filter.exclude),
      // AnnotationPanelFilter.ids is a list of numeric panel ids
      ids: mapArray(obj.filter.ids, id => convertToInt(id))
    }

    annotation.filter = filter
  }

  if (isDefined(obj.hide)) {
    annotation.hide = convertToBoolean(obj.hide)
  }

  if (isDefined(obj.iconColor)) {
    annotation.iconColor = convertToString(obj.iconColor)
  }

  if (isDefined(obj.name)) {
    annotation.name = convertToString(obj.name)
  }

  if (isDefinedObject(obj.target)) {
    const target: AnnotationTarget & DataQuery = {
      limit: convertToInt(obj.target.limit, 100),  // 100 is the Grafana default annotation limit
      matchAny: convertToBoolean(obj.target.matchAny),
      refId: convertToString(obj.target.refId, 'A'),
      tags: mapArray(obj.target.tags, tag => convertToString(tag)),
      type: convertToString(obj.target.type)
    }

    // for a non-Grafana datasource the target is the actual annotation query,
    // so keep the datasource-specific fields alongside the ones we normalize
    annotation.target = { ...obj.target, ...target }
  }

  // note that 'type' is kind of deprecated
  if (isDefined(obj.type)) {
    annotation.type = convertToString(obj.type)
  }

  return { ...obj, ...annotation }
}

// convert to a DashboardLinkType which is 'link' or 'dashboards'
const dashboardLinkTypes: DashboardLinkType[] = ['link', 'dashboards']

const mapDashboardLinkType = (obj?: any): DashboardLinkType => {
  if (isDefined(obj)) {
    const s = convertToString(obj)

    const match = dashboardLinkTypes.find(t => t === s)

    if (match) {
      return match
    }
  }

  return 'link'
}

const mapDashboardLink = (obj: any): DashboardLink => {
  const link: DashboardLink = {
    asDropdown: convertToBoolean(obj.asDropdown),
    icon: convertToString(obj.icon),
    includeVars: convertToBoolean(obj.includeVars),
    keepTime: convertToBoolean(obj.keepTime),
    tags: mapArray(obj.tags, tag => convertToString(tag)),
    targetBlank: convertToBoolean(obj.targetBlank),
    title: convertToString(obj.title),
    tooltip: convertToString(obj.tooltip),
    type: mapDashboardLinkType(obj.type),
    url: convertToString(obj.url)
  }

  // preserve fields we do not normalize, e.g. the v12 'placement'
  return { ...obj, ...link }
}

// These are complex fields with lots of optional properties, we will assume they are correct
// rather than have a ton of mapping code here
const mapFieldConfigSource = (obj: any): FieldConfigSource => {
  const config = {
    defaults: isDefined(obj.defaults) ? obj.defaults : {},
    overrides: isNonEmptyArray(obj.overrides) ? obj.overrides : []
  }

  return config
}

const mapGridPos = (obj: any): GridPos => {
  // fall back to Grafana's default panel size rather than a zero-sized panel
  const pos: GridPos = {
    h: convertToInt(obj.h, defaultGridPos.h),
    w: convertToInt(obj.w, defaultGridPos.w),
    x: convertToInt(obj.x, defaultGridPos.x),
    y: convertToInt(obj.y, defaultGridPos.y)
  }

  // 'static' is optional; only pin the panel if the source actually said so
  if (isDefined(obj.static)) {
    pos.static = convertToBoolean(obj.static)
  }

  return pos
}

const mapPanelOrRowPanel = (obj: any, options: ConvertOptions): Panel | RowPanel => {
  // RowPanel should have 'type' of 'row'
  // Should also have 'collapsed' and 'panels', but we will key off of the 'type' field
  const isRowPanel = isDefined(obj.type) && obj.type === 'row'

  if (isRowPanel) {
    return mapRowPanel(obj, options)
  }

  return mapPanel(obj, options)
}

// The 'targets' are OPG (or other datasource) queries which we do not parse further here.
// We do normalize the target's own 'datasource', the same way we do the panel's, since a
// target can carry a legacy name or template variable string too.
// If the user asked to unhide all queries, clear the 'hide' flag on each of them.
const mapTargets = (obj: any, options: ConvertOptions) => {
  if (!isNonEmptyArray(obj.targets)) {
    return []
  }

  return mapArray(obj.targets, (t: any) => {
    const target = { ...t }

    if (isDefined(t.datasource)) {
      target.datasource = mapDataSourceRef(t.datasource)
    }

    if (options.unhideAllQueries) {
      target.hide = false
    }

    return target
  })
}

// 'pluginVersion' is the version of the panel plugin, which Grafana uses to decide which of
// that plugin's migrations to run. It is only ours to set on our own panels; stamping it onto
// a core or third party panel would misrepresent which migrations have been applied, so those
// keep whatever the source had.
const mapPluginVersion = (obj: any) => {
  // the version of the panel plugin named by 'type', which is one of ours or nobody's
  const version = getOpenNmsPluginVersion(obj.type)

  if (version) {
    return version
  }

  return isDefined(obj.pluginVersion) ? convertToString(obj.pluginVersion) : undefined
}

// Two places where a real dashboard is legitimately wider than the generated schema:
// - 'datasource' is typed DataSourceRef, but null is valid and means "the default datasource"
// - RowPanel.id is required, yet a row that has never been saved by Grafana has none, and
//   RowPanel.panels is typed Panel[], while a (malformed but real) dashboard can nest a row
type OpgPanel = Omit<Panel, 'datasource'> & { datasource?: DataSourceRef | null }

type OpgRowPanel = Omit<RowPanel, 'datasource' | 'id' | 'panels'> & {
  datasource?: DataSourceRef | null
  id?: number
  panels: Array<Panel | RowPanel>
}

const mapPanel = (source: any, options: ConvertOptions): Panel => {
  // The Angular 'graph' panel was removed in Grafana 11, so it cannot render under v12.
  // If the user asked for it, convert it to a 'timeseries' panel first, then map that.
  const obj = options.convertGraphToTimeSeries && isLegacyGraphPanel(source)
    ? convertLegacyGraphToTimeSeriesPanel(source)
    : source

  // Build the fields we normalize as a typed object so the compiler checks them against the
  // schema, then merge it over the source, which carries the properties of specific panel
  // types that are not in the Panel base interface.
  const panel: OpgPanel = {
    cacheTimeout: isDefined(obj.cacheTimeout) ? convertToString(obj.cacheTimeout) : undefined,
    datasource: isDefined(obj.datasource) ? mapDataSourceRef(obj.datasource) : undefined,
    description: isDefined(obj.description) ? convertToString(obj.description) : undefined,
    fieldConfig: isDefinedObject(obj.fieldConfig) ? mapFieldConfigSource(obj.fieldConfig) : undefined,
    gridPos: isDefinedObject(obj.gridPos) ? mapGridPos(obj.gridPos) : undefined,
    hideTimeOverride: isDefined(obj.hideTimeOverride) ? convertToBoolean(obj.hideTimeOverride) : undefined,
    id: isDefined(obj.id) ? convertToInt(obj.id) : undefined,
    interval: isDefined(obj.interval) ? convertToString(obj.interval) : undefined,
    libraryPanel: obj.libraryPanel, // may be undefined. we are not bothering to parse further
    links: mapArray(obj.links, mapDashboardLink),
    maxDataPoints: isDefined(obj.maxDataPoints) ? convertToInt(obj.maxDataPoints) : undefined,
    maxPerRow: isDefined(obj.maxPerRow) ? convertToInt(obj.maxPerRow) : undefined,
    options: obj.options,  // may be undefined. most likely this is our OPG options, we won't parse further here
    pluginVersion: mapPluginVersion(obj),
    queryCachingTTL: isDefined(obj.queryCachingTTL) ? convertToInt(obj.queryCachingTTL) : undefined,
    repeat: isDefined(obj.repeat) ? convertToString(obj.repeat) : undefined,
    repeatDirection: isDefined(obj.repeatDirection) && (obj.repeatDirection === 'h' || obj.repeatDirection === 'v') ? obj.repeatDirection : undefined,
    targets: mapTargets(obj, options),  // these should be OPG targets
    timeFrom: isDefined(obj.timeFrom) ? convertToString(obj.timeFrom) : undefined,
    timeShift: isDefined(obj.timeShift) ? convertToString(obj.timeShift) : undefined,
    title: isDefined(obj.title) ? convertToString(obj.title) : undefined,
    transformations: isNonEmptyArray(obj.transformations) ? obj.transformations : [],  // not bothering to parse these further into DataTransformerConfig objects
    transparent: isDefined(obj.transparent) ? convertToBoolean(obj.transparent) : undefined,
    type: convertToString(obj.type) // panel plugin id
  }

  return { ...obj, ...panel }
}

const mapRowPanel = (obj: any, options: ConvertOptions): RowPanel => {
  const row: OpgRowPanel = {
    collapsed: convertToBoolean(obj.collapsed),
    datasource: isDefined(obj.datasource) ? mapDataSourceRef(obj.datasource) : undefined,
    gridPos: isDefinedObject(obj.gridPos) ? mapGridPos(obj.gridPos) : undefined,
    id: isDefined(obj.id) ? convertToInt(obj.id) : undefined,
    panels: mapArray(obj.panels, p => mapPanelOrRowPanel(p, options)),
    repeat: isDefined(obj.repeat) ? convertToString(obj.repeat) : undefined,
    title: isDefined(obj.title) ? convertToString(obj.title) : undefined,
    type: 'row'
  }

  // merge over the source, which carries any properties not in the RowPanel base interface
  return { ...obj, ...row }
}

const mapDashboardSnapshot = (obj: any) => {
  const snapshot = {
    created: convertToString(obj.created),
    expires: convertToString(obj.expires),
    external: convertToBoolean(obj.external),
    externalUrl: convertToString(obj.externalUrl),
    originalUrl: convertToString(obj.originalUrl),
    id: convertToInt(obj.id),
    key: convertToString(obj.key),
    name: convertToString(obj.name),
    orgId: convertToInt(obj.orgId),
    updated: convertToString(obj.updated),
    url: isDefined(obj.url) ? convertToString(obj.url) : undefined,
    userId: convertToInt(obj.userId)
  }

  return snapshot
}

// 'text' and 'value' are a string, or an array of strings for a multi-value variable.
// An empty array is a valid selection (a multi variable with nothing selected), so key off
// the type rather than off the array being non-empty.
const mapVariableOptionValue = (obj: any) => {
  return Array.isArray(obj) ? obj.map((v: any) => convertToString(v)) : convertToString(obj)
}

const mapVariableOption = (obj: any): VariableOption => {
  const option: VariableOption = {
    selected: isDefined(obj.selected) ? convertToBoolean(obj.selected) : undefined,
    text: mapVariableOptionValue(obj.text),
    value: mapVariableOptionValue(obj.value)
  }

  // preserve fields we do not normalize, e.g. 'properties' for multi-prop variables
  return { ...obj, ...option }
}

type StaticOptionsOrder = NonNullable<VariableModel['staticOptionsOrder']>

const staticOptionsOrders: StaticOptionsOrder[] = ['before', 'after', 'sorted']

const mapStaticOptionsOrder = (obj?: any): StaticOptionsOrder | undefined => {
  if (isDefined(obj)) {
    const s = convertToString(obj)

    return staticOptionsOrders.find(o => o === s)
  }

  return undefined
}

const variableTypes: VariableType[] = [
  'query', 'adhoc', 'groupby', 'constant', 'datasource', 'interval',
  'textbox', 'custom', 'system', 'snapshot', 'switch'
]

const mapVariableType = (obj: any): VariableType => {
  if (isDefined(obj)) {
    const s = convertToString(obj)

    return variableTypes.find(t => t === s) ?? 'query'
  }

  return 'query'
}

// A few properties our OPG variables carry are not part of the Grafana VariableModel
// interface. We still normalize them so they survive the conversion.
// It's possible in the future these will be removed if no longer needed.
interface OpgVariableModel extends VariableModel {
  definition?: string
  queryValue?: string
  tagsQuery?: string
  tagValuesQuery?: string
  useTags?: boolean
}

// We don't do a lot of extensive parsing here, just make sure it has the same shape as a VariableModel
const mapVariableModel = (obj: any): VariableModel => {
  const model: OpgVariableModel = {
    allValue: isDefined(obj.allValue) ? convertToString(obj.allValue) : undefined,
    allowCustomValue: isDefined(obj.allowCustomValue) ? convertToBoolean(obj.allowCustomValue) : undefined,
    current: isDefinedObject(obj.current) ? mapVariableOption(obj.current) : undefined,
    datasource: isDefined(obj.datasource) ? mapDataSourceRef(obj.datasource) : undefined,
    definition: isDefined(obj.definition) ? convertToString(obj.definition) : undefined,
    description: isDefined(obj.description) ? convertToString(obj.description) : undefined,
    hide: isDefined(obj.hide) && isEnumValueOfType(VariableHide, obj.hide) ? convertToInt(obj.hide) : undefined,
    includeAll: isDefined(obj.includeAll) ? convertToBoolean(obj.includeAll) : undefined,
    label: isDefined(obj.label) ? convertToString(obj.label) : undefined,
    multi: isDefined(obj.multi) ? convertToBoolean(obj.multi) : undefined,
    name: convertToString(obj.name),
    options: mapArray(obj.options, mapVariableOption),
    query: obj.query,  // not bothering to parse this further,
    queryValue: isDefined(obj.queryValue) ? convertToString(obj.queryValue) : undefined,
    refresh: isDefined(obj.refresh) && isEnumValueOfType(VariableRefresh, obj.refresh) ? convertToInt(obj.refresh) : undefined,
    regex: isDefined(obj.regex) ? convertToString(obj.regex) : undefined,
    skipUrlSync: isDefined(obj.skipUrlSync) ? convertToBoolean(obj.skipUrlSync) : undefined,
    sort: isDefined(obj.sort) && isEnumValueOfType(VariableSort, obj.sort) ? convertToInt(obj.sort) : undefined,
    staticOptions: isNonEmptyArray(obj.staticOptions) ? mapArray(obj.staticOptions, mapVariableOption) : undefined,
    staticOptionsOrder: mapStaticOptionsOrder(obj.staticOptionsOrder),
    tagsQuery: isDefined(obj.tagsQuery) ? convertToString(obj.tagsQuery) : undefined,
    tagValuesQuery: isDefined(obj.tagValuesQuery) ? convertToString(obj.tagValuesQuery) : undefined,
    type: isDefined(obj.type) ? mapVariableType(obj.type) : 'query',
    useTags: isDefined(obj.useTags) ? convertToBoolean(obj.useTags) : undefined
  }

  // merge over the source so that per-type fields which are not in the base VariableModel
  // interface are preserved: 'filters'/'baseFilters'/'defaultKeys' on adhoc variables,
  // 'defaultValue' on groupby variables, and newer fields such as 'regexApplyTo'
  // and 'valuesFormat'
  return { ...obj, ...model }
}

const mapTimeOption = (obj: any): TimeOption => {
  const option = {
    display: convertToString(obj.display),
    from: convertToString(obj.from),
    to: convertToString(obj.to),
  }

  return option
}

const mapTimeOptionsFromStrings = (options: string[]): TimeOption[] => {
  const timeOptions: TimeOption[] = []

  for (const s of options) {
    if (s) {
      const timeOption: TimeOption = {
        display: s,
        from: `now-${s}`,
        to: 'now'
      }

      timeOptions.push(timeOption)
    }
  }

  return timeOptions
}

const mapTimePickerConfig = (obj: any): TimePickerConfig => {
  // if obj has 'quick_ranges', use that and strongly type it
  // if obj has 'time_options', this is a list of strings of intervals like ['5m', '15m', '1hr', '30d'], try to parse to 'quick_ranges' TimeOption[]

  let quick_ranges = mapArray(obj.quick_ranges, mapTimeOption)

  if (!isDefined(obj.quick_ranges) && isNonEmptyArray(obj.time_options)) {
    quick_ranges = mapTimeOptionsFromStrings(obj.time_options)
  }

  // Leave 'quick_ranges' and 'refresh_intervals' out when the source has none: an empty
  // array is not "use the defaults", it means there are no options, which would blank the
  // refresh picker and the quick range list.
  const config: TimePickerConfig = {
    hidden: isDefined(obj.hidden) ? convertToBoolean(obj.hidden) : undefined,
    nowDelay: isDefined(obj.nowDelay) ? convertToString(obj.nowDelay) : undefined,
    quick_ranges: isNonEmptyArray(quick_ranges) ? quick_ranges : undefined,
    refresh_intervals: isNonEmptyArray(obj.refresh_intervals) ? mapArray(obj.refresh_intervals, i => convertToString(i)) : undefined,
  }

  return config
}

// Build the Dashboard we map the source onto.
// Only seed a field here when Grafana itself has a default for it, or when the Dashboard
// interface requires it. Anything else must stay absent unless the source supplies it:
// inventing a value (a refresh interval, a timezone, liveNow) silently changes how the
// converted dashboard behaves. See defaultDashboard in @grafana/schema.
const createEmptyV12Dashboard = () => {
  const dashboard: Dashboard = {
    /**
     * Contains the list of annotations that are associated with the dashboard.
     */
    annotations: {
      list: []
    },
    /**
     * Whether a dashboard is editable or not.
     */
    editable: true,
    /**
     * The month that the fiscal year starts on.  0 = January, 11 = December
     */
    fiscalYearStartMonth: 0,
    /**
     * Configuration of dashboard cursor sync behavior.
     * Accepted values are 0 (sync turned off), 1 (shared crosshair), 2 (shared crosshair and tooltip).
     */
    graphTooltip: DashboardCursorSync.Off,
    /**
     * 'id' and 'uid' identify the dashboard within the Grafana instance it came from, so
     * neither should be carried over. Grafana's own "export for sharing externally" nulls
     * the id and omits the uid, and the importing instance then assigns its own.
     */
    id: null,
    /**
     * Links with references to other dashboards or external websites.
     */
    links: [],
    /**
     * List of dashboard panels
     */
    panels: [],
    /**
     * Version of the JSON schema, incremented each time a Grafana update brings
     * changes to said schema.
     * This is the only required Dashboard field. When the source has one we keep it, so that
     * Grafana runs just the migrations it still needs; this fallback is for a source that has
     * none, where a 0 would make Grafana replay every migration from the beginning.
     */
    schemaVersion: defaultDashboard.schemaVersion,
    /**
     * Tags associated with dashboard.
     */
    tags: [],
    /**
     * Configured template variables
     */
    templating: {
        list: []
    },
    /**
     * Time range for dashboard.
     * Accepted values are relative time strings like {from: 'now-6h', to: 'now'} or absolute time strings like {from: '2020-07-10T08:00:00.000Z', to: '2020-07-10T14:00:00.000Z'}.
     */
    time: {
        from: 'now-6h',
        to: 'now'
    },
    /**
     * Configuration of the time picker shown at the top of a dashboard.
     */
    timepicker: {},
    /**
     * Timezone of dashboard. Accepted values are IANA TZDB zone ID or "browser" or "utc".
     */
    timezone: defaultDashboard.timezone,
    /**
     * Title of dashboard.
     */
    title: '',
    /**
     * Version of the dashboard, incremented each time the dashboard is updated.
     */
    version: 1
  }

  return dashboard
}
