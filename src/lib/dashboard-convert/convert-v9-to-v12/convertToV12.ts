import { DashboardCursorSync } from '@grafana/data'
import {
  AnnotationPanelFilter,
  AnnotationQuery,
  AnnotationTarget,
  Dashboard,
  DashboardLink,
  DataQuery,
  DataSourceRef,
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
  isEnumValueOfType,
  isNonEmptyArray
} from '../../parseUtils'
import { isTemplateVariableCandidate } from 'lib/utils'

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
  const source = request.dashboardV9 ?? JSON.parse(request.json)

  // Make an empty Grafana V12 Dashboard object
  // Then we map everything from 'source' into it
  // See @grafana/schema, dashboard_types.gen.d.ts, interface Dashboard
  const dashboard: Dashboard = mapV9toV12(source, dashboardTitle, options)

  const json = JSON.stringify(dashboard, null, 2)

  return {
    dashboardV9: request.dashboardV9,
    dashboardV12: dashboard,
    json: json,
    isError: false,
    targetPluginVersion: 12
  } as ConvertResponse
}

const mapRequires = (sourceRequires: any[]) => {
  let targetRequires: any[] = []

  for (const r of sourceRequires) {
    let obj = { ...r }

    if (isDefined(r.type) &&
      (r.type === 'datasource' || r.type === 'panel') &&
      isDefined(r.id) &&
      typeof r.id === 'string' &&
      String(r.id).startsWith('opennms-')) {
      r['version'] = 12
    }

    targetRequires.push(obj)
  }

  return targetRequires
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

  // leave __requires as-is, except if it refers to an opennms datasource, set the 'version' to 12
  if (isNonEmptyArray(source['__requires'])) {
    dashboard['__requires'] = mapRequires(source['__requires'])
  }

  if (isDefined(source.annotations) && isDefined(source.annotations.list) && isNonEmptyArray(source.annotations.list)) {
    dashboard.annotations = {
      list: source.annotations.list.map(mapAnnotationQuery)
    }
  }

  if (isDefined(source.description)) {
    dashboard.description = convertToString(source.description)
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

  if (isDefined(source.id)) {
    dashboard.id = source.id === null ? null : convertToInt(source.id)
  }

  if (isNonEmptyArray(source.links)) {
    dashboard.links = source.links.map(mapDashboardLink)
  }

  if (isDefined(source.liveNow)) {
    dashboard.liveNow = convertToBoolean(source.liveNow, dashboard.liveNow)
  }
  
  if (isNonEmptyArray(source.panels)) {
    dashboard.panels = source.panels.map(mapPanelOrRowPanel)
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

  if (isDefined(source.snapshot)) {
    dashboard.snapshot = mapDashboardSnapshot(source.snapshot)
  }

  if (isNonEmptyArray(source.tags)) {
    dashboard.tags = (source.tags as string[])?.map(s => convertToString(s)) ?? []
  }  

  if (isDefined(source.templating) && isNonEmptyArray(source.templating.list)) {
    dashboard.templating = {
      list: source.templating.list.map(mapVariableModel)
    }
  }

  if (isDefined(source.time) && isDefined(source.time.from) && isDefined(source.time.to)) {
    dashboard.time = {
      from: convertToString(source.time.from),
      to: convertToString(source.time.to)
    }
  }

  if (isDefined(source.timepicker)) {
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

  // remove uid, Grafana will create a new unique one when user imports the Dashboard json
  delete dashboard.uid

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
  
  // template variable reference
  // Not sure this parsing is accurate, the 'datasource' property of annotations,
  // panels, etc. used to be able to contain a string which was a template variable
  // but now only seems to support DataSourceRef.
  // For now, going to put the template variable in the datasource.type field,
  // but we may need to fix this
  if (typeof obj === 'string' && isTemplateVariableCandidate(String(obj))) {
    const datasource = {
      apiVersion: '',
      type: String(obj),
      uid: ''
    } as DataSourceRef

    return datasource
  }

  // full DataSourceRef object
  if (isDefined(obj.type) || isDefined(obj.uid) || isDefined(obj.apiVersion)) {
    const datasource = {
      apiVersion: isDefined(obj.apiVersion) ? convertToString(obj?.apiVersion) : undefined,
      type: isDefined(obj.type) ? convertToString(obj?.type) : undefined,
      uid: isDefined(obj.uid) ? convertToString(obj?.uid) : undefined
    } as DataSourceRef

    return datasource
  }

  return null
}

const mapAnnotationQuery = (obj: any) => {
  let annotation = {
    enable: false,
    iconColor: '',
    name: ''
  } as AnnotationQuery<AnnotationTarget & DataQuery>

  if (isDefined(obj.builtIn)) {
    annotation.builtIn = convertToInt(obj.builtIn)
  }

  if (isDefined(obj.datasource)) {
    annotation.datasource = mapDataSourceRef(obj.datasource)
  }

  if (isDefined(obj.enable)) {
    annotation.enable = convertToBoolean(obj.enable)
  }

  if (isDefined(obj.filter)) {
    annotation.filter = {
      exclude: convertToBoolean(obj.filter.exclude),
      ids: isNonEmptyArray(obj.filter.ids) ? obj.filter.ids.map(convertToString) : []
    } as AnnotationPanelFilter
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

  if (isDefined(obj.target)) {
    annotation.target = {
      limit: convertToInt(obj.target.number),
      matchAny: convertToBoolean(obj.target.matchAny),
      refId: convertToString(obj.target.refId, 'A'),
      tags: isNonEmptyArray(obj.target.tags) ? obj.target.tags.map(convertToString) : [],
      type: convertToString(obj.target.type),
    } as AnnotationTarget & DataQuery
  }

  // note that 'type' is kind of deprecated
  if (isDefined(obj.type)) {
    annotation.type = obj.type
  }

  return annotation
}

// convert to a DashboardLinkType which is 'link' or 'dashboards'
const mapDashboardLinkType = (obj?: any) => {
  if (isDefined(obj)) {
    const s = convertToString(obj)

    if (['link', 'dashboards'].includes(s)) {
      return s
    }
  }

  return 'link'
}

const mapDashboardLink = (obj: any) => {
  const link = {
    asDropdown: convertToBoolean(obj.asDropdown),
    icon: convertToString(obj.icon),
    includeVars: convertToBoolean(obj.includeVars),
    keepTime: convertToBoolean(obj.keepTime),
    tags: isNonEmptyArray(obj.tags) ? obj.tags.map(convertToString) : [],
    targetBlank: convertToBoolean(obj.targetBlank),
    title: convertToString(obj.title),
    tooltip: convertToString(obj.tooltip),
    type: mapDashboardLinkType(obj.type),
    url: convertToString(obj.url)
  } as DashboardLink

  return link
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
  const pos = {
    h: convertToInt(obj.h),
    static: convertToBoolean(obj.static),
    w: convertToInt(obj.w),
    x: convertToInt(obj.x),
    y: convertToInt(obj.y)
  } as GridPos

  return pos
}

const mapPanelOrRowPanel = (obj: any): Panel | RowPanel => {
  // RowPanel should have 'type' of 'row'
  // Should also have 'collapsed' and 'panels', but we will key off of the 'type' field
  const isRowPanel = isDefined(obj.type) && obj.type === 'row'

  if (isRowPanel) {
    return mapRowPanel(obj)
  }

  return mapPanel(obj)
}

const mapPanel = (obj: any): Panel => {
  const panel = {
    ...obj, // this will capture properties of specific panels, not contains in Panel base interface
    cacheTimeout: isDefined(obj.cacheTimeout) ? convertToString(obj.cacheTimeout) : undefined,
    datasource: isDefined(obj.datasource) ? mapDataSourceRef(obj.datasource) : undefined,
    description: isDefined(obj.description) ? convertToString(obj.description) : undefined,
    fieldConfig: isDefined(obj.fieldConfig) ? mapFieldConfigSource(obj.fieldConfig) : undefined,
    gridPos: isDefined(obj.gridPos) ? mapGridPos(obj.gridPos) : undefined,
    hideTimeOverride: isDefined(obj.hideTimeOverride) ? convertToBoolean(obj.hideTimeOverride) : undefined,
    id: isDefined(obj.id) ? convertToInt(obj.id) : undefined,
    interval: isDefined(obj.interval) ? convertToString(obj.interval) : undefined,
    libraryPanel: obj.libraryPanel, // may be undefined. we are not bothering to parse further
    links: isNonEmptyArray(obj.links) ? obj.links.map(mapDashboardLink) : [],
    maxDataPoints: isDefined(obj.maxDataPoints) ? convertToInt(obj.maxDataPoints) : undefined,
    maxPerRow: isDefined(obj.maxPerRow) ? convertToInt(obj.maxPerRow) : undefined,
    options: obj.options,  // may be undefined. most likely this is our OPG options, we won't parse further here
    pluginVersion: '12',  // hard-coding to version 12
    queryCachingTTL: isDefined(obj.queryCachingTTL) ? convertToInt(obj.queryCachingTTL) : undefined,
    repeat: isDefined(obj.repeat) ? convertToString(obj.repeat) : undefined,
    repeatDirection: isDefined(obj.repeatDirection) && (obj.repeatDirection === 'h' || obj.repeatDirection === 'v') ? obj.repeatDirection : undefined,
    targets: isNonEmptyArray(obj.targets) ? obj.targets : [],  // these should be OPG targets
    timeFrom: isDefined(obj.timeFrom) ? convertToString(obj.timeFrom) : undefined,
    timeShift: isDefined(obj.timeShift) ? convertToString(obj.timeShift) : undefined,
    title: isDefined(obj.title) ? convertToString(obj.title) : undefined,
    transformations: isNonEmptyArray(obj.transformations) ? obj.transformations : [],  // not bothering to parse these further into DataTransformerConfig objects
    transparent: isDefined(obj.transparent) ? convertToBoolean(obj.transparent) : undefined,
    type: convertToString(obj.type) // panel plugin in
  } as Panel

  return panel
}

const mapRowPanel = (obj: any): RowPanel => {
  const row = {
    ...obj, // this will capture properties of specific panels, not contains in RowPanel base interface
    collapsed: convertToBoolean(obj.collapsed),
    datasource: isDefined(obj.datasource) ? mapDataSourceRef(obj.datasource) : undefined,
    gridPos: isDefined(obj.gridPos) ? mapGridPos(obj.gridPos) : undefined,
    id: isDefined(obj.id) ? convertToInt(obj.id) : undefined,
    panels: isNonEmptyArray(obj.panels) ? obj.panels.map(mapPanelOrRowPanel) : [],
    repeat: isDefined(obj.repeat) ? convertToString(obj.repeat) : undefined,
    title: isDefined(obj.title) ? convertToString(obj.title) : undefined,
    type: 'row'
  } as RowPanel

  return row
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

const mapVariableOption = (obj: any): VariableOption => {
  const option = {
    selected: convertToBoolean(obj.selected),
    text: isNonEmptyArray(obj.text) ? obj.text : convertToString(obj.text),
    value: isNonEmptyArray(obj.value) ? obj.value : convertToString(obj.value)
  } as VariableOption

  return option
}

const mapStaticOptionsOrder = (obj?: any) => {
  if (isDefined(obj)) {
    const s = convertToString(obj)

    if (['before', 'after', 'sorted'].includes(s)) {
      return s
    }
  }

  return undefined
}

const mapVariableType = (obj: any): VariableType => {
  if (isDefined(obj)) {
    const values = ['query', 'adhoc', 'groupby', 'constant', 'datasource', 'interval', 'textbox', 'custom', 'system', 'snapshot']
    
    const s = convertToString(obj)
    if (values.includes(s)) {
      return s as VariableType ?? 'query'
    }
  }

  return 'query'
}

// We don't do a lot of extensive parsing here, just make sure it has the same shape as a VariableModel
// We do include some properties like definition, tagsQuery, tagValuesQuery which are not required but are used by our OPG variables,
// so that they will be preserved in the conversion
// It's possible in the future these will be removed if no longer needed.
const mapVariableModel = (obj: any): VariableModel => {
  const model = {
    allValue: isDefined(obj.allValue) ? convertToString(obj.allValue) : undefined,
    allowCustomValue: isDefined(obj.allowCustomValue) ? convertToBoolean(obj.allowCustomValue) : undefined,
    current: isDefined(obj.current) ? mapVariableOption(obj.current) : undefined,
    datasource: isDefined(obj.datasource) ? mapDataSourceRef(obj.datasource) : undefined,
    definition: isDefined(obj.definition) ? convertToString(obj.definition) : undefined,
    description: isDefined(obj.description) ? convertToString(obj.description) : undefined,
    hide: isDefined(obj.hide) && isEnumValueOfType(VariableHide, obj.hide) ? convertToInt(obj.hide) : undefined,
    includeAll: isDefined(obj.includeAll) ? convertToBoolean(obj.includeAll) : undefined,
    label: isDefined(obj.label) ? convertToString(obj.label) : undefined,
    multi: isDefined(obj.multi) ? convertToBoolean(obj.multi) : undefined,
    name: convertToString(obj.name),
    options: isNonEmptyArray(obj.options) ? obj.options.map(mapVariableOption) : [],
    query: obj.query,  // not bothering to parse this further,
    queryValue: isDefined(obj.queryValue) ? convertToString(obj.queryValue) : undefined,
    refresh: isDefined(obj.refresh) && isEnumValueOfType(VariableRefresh, obj.refresh) ? convertToInt(obj.refresh) : undefined,
    regex: isDefined(obj.regex) ? convertToString(obj.regex) : undefined,
    skipUrlSync: isDefined(obj.skipUrlSync) ? convertToBoolean(obj.skipUrlSync) : undefined,
    sort: isDefined(obj.sort) && isEnumValueOfType(VariableSort, obj.sort) ? convertToInt(obj.sort) : undefined,
    staticOptions: isNonEmptyArray(obj.staticOptions) ? obj.staticOptions.map(mapVariableOption) : [],
    staticOptionsOrder: mapStaticOptionsOrder(obj.staticOptionsOrder),
    tagsQuery: isDefined(obj.tagsQuery) ? convertToString(obj.tagsQuery) : undefined,
    tagValuesQuery: isDefined(obj.tagValuesQuery) ? convertToString(obj.tagValuesQuery) : undefined,
    type: isDefined(obj.type) ? mapVariableType(obj.type) : 'query',
    useTags: isDefined(obj.useTags) ? convertToBoolean(obj.useTags) : undefined
  } as VariableModel

  return model
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
      const timeOption = {
        display: s,
        from: `now-${s}`,
        to: 'now'
      } as TimeOption

      timeOptions.push(timeOption)
    }
  }

  return timeOptions
}

const mapTimePickerConfig = (obj: any): TimePickerConfig => {
  // if obj has 'quick_ranges', use that and strongly type it
  // if obj has 'time_options', this is a list of strings of intervals like ['5m', '15m', '1hr', '30d'], try to parse to 'quick_ranges' TimeOption[]

  let quick_ranges = isNonEmptyArray(obj.quick_ranges) ? obj.quick_ranges.map(mapTimeOption) : []

  if (!isDefined(obj.quick_ranges) && isNonEmptyArray(obj.time_options)) {
    quick_ranges = mapTimeOptionsFromStrings(obj.time_options)
  }

  const config = {
    hidden: isDefined(obj.hidden) ? convertToBoolean(obj.hidden) : undefined,
    nowDelay: isDefined(obj.nowDelay) ? convertToString(obj.nowDelay) : undefined,
    quick_ranges,
    refresh_intervals: isNonEmptyArray(obj.refresh_intervals) ? obj.refresh_intervals.map(convertToString) : [],
  } as TimePickerConfig

  return config
}

const createEmptyV12Dashboard = () => {
  const dashboard: Dashboard = {
    /**
     * Contains the list of annotations that are associated with the dashboard.
     * Annotations are used to overlay event markers and overlay event tags on graphs.
     * Grafana comes with a native annotation store and the ability to add annotation events directly from the graph panel or via the HTTP API.
     * See https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/annotate-visualizations/
     */
    // annotations?: AnnotationContainer;
    annotations: {
      list: []
    },
    /**
     * Description of dashboard.
     */
    description: '',
    /**
     * Whether a dashboard is editable or not.
     */
    editable: true,
    /**
     * The month that the fiscal year starts on.  0 = January, 11 = December
     */
    fiscalYearStartMonth: 0,
    /**
     * ID of a dashboard imported from the https://grafana.com/grafana/dashboards/ portal
     */
    gnetId: '',
    /**
     * Configuration of dashboard cursor sync behavior.
     * Accepted values are 0 (sync turned off), 1 (shared crosshair), 2 (shared crosshair and tooltip).
     */
    graphTooltip: DashboardCursorSync.Off,
    /**
     * Unique numeric identifier for the dashboard.
     * `id` is internal to a specific Grafana instance. `uid` should be used to identify a dashboard across Grafana instances.
     */
    id: 0,
    /**
     * Links with references to other dashboards or external websites.
     */
    links: [],
    /**
     * When set to true, the dashboard will redraw panels at an interval matching the pixel width.
     * This will keep data "moving left" regardless of the query refresh rate. This setting helps
     * avoid dashboards presenting stale live data
     */
    liveNow: true,
    /**
     * List of dashboard panels
     */
    panels: [],
    /**
     * When set to true, the dashboard will load all panels in the dashboard when it's loaded.
     */
    preload: true,
    /**
     * Refresh rate of dashboard. Represented via interval string, e.g. "5s", "1m", "1h", "1d".
     */
    refresh: '1m',
    /**
     * This property should only be used in dashboards defined by plugins.  It is a quick check
     * to see if the version has changed since the last time.
     */
    revision: 0,
    /**
     * Version of the JSON schema, incremented each time a Grafana update brings
     * changes to said schema.
     */
    schemaVersion: 0,
    /**
     * Snapshot options. They are present only if the dashboard is a snapshot.
     */
    // snapshot?: { }
    /**
     * Tags associated with dashboard.
     */
    tags: [],
    /**
     * Configured template variables
     */
    templating: {
        /**
         * List of configured template variables with their saved values along with some other metadata
         */
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
     * a TimePickerConfig
     */
    timepicker: {},
    /**
     * Timezone of dashboard. Accepted values are IANA TZDB zone ID or "browser" or "utc".
     */
    timezone: 'utc',
    /**
     * Title of dashboard.
     */
    title: '',
    /**
     * Unique dashboard identifier that can be generated by anyone. string (8-40)
     */
    uid: '',
    /**
     * Version of the dashboard, incremented each time the dashboard is updated.
     */
    version: 0,
    /**
     * Day when the week starts. Expressed by the name of the day in lowercase, e.g. "monday".
     */
    weekStart: 'monday'
  }

  return dashboard
}
