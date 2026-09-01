import { AnnotationTarget, defaultDashboard, defaultGridPos } from '@grafana/schema'
import alarmTablePluginJson from '../../panels/alarm-table/plugin.json'
import filterPanelPluginJson from '../../panels/filter-panel/plugin.json'
import performanceDsPluginJson from '../../datasources/perf-ds/plugin.json'
import { convertDashboardToV12 } from '../../lib/dashboard-convert/convert-v9-to-v12'
import { ConvertOptions, ConvertResponse } from '../../lib/dashboard-convert/types'

const defaultOptions: ConvertOptions = {
  incrementDashboardVersion: false,
  unhideAllQueries: false,
  convertGraphToTimeSeries: false
}

const convert = (dashboardV9: any, options: ConvertOptions = defaultOptions) => {
  const request: ConvertResponse = {
    dashboardV9,
    json: JSON.stringify(dashboardV9),
    isError: false,
    targetPluginVersion: 12
  }

  return convertDashboardToV12(request, '', options)
}

describe('convertToV12 :: __requires', () => {
  const openNmsRequires = [
    { type: 'datasource', id: 'opennms-performance-datasource', name: 'OpenNMS Performance', version: '1.0.0' }
  ]

  it('should set OpenNMS entries to the plugin version, as a semver string', () => {
    const result = convert({ __requires: [...openNmsRequires.map(r => ({ ...r }))] })

    // the entry names the nested datasource plugin, not the app, so its version is the one
    // Grafana will compare against at runtime
    expect(result.dashboardV12!['__requires'][0].version).toEqual(performanceDsPluginJson.info.version)
    expect(typeof result.dashboardV12!['__requires'][0].version).toEqual('string')
  })

  it('should set OpenNMS panel entries as well as datasource entries', () => {
    const source = {
      __requires: [
        { type: 'panel', id: 'opennms-alarm-table-panel', name: 'Alarm Table', version: '' }
      ]
    }

    expect(convert(source).dashboardV12!['__requires'][0].version).toEqual(alarmTablePluginJson.info.version)
  })

  it('should resolve a legacy Helm panel id to its current equivalent version', () => {
    const source = {
      __requires: [
        { type: 'panel', id: 'opennms-helm-alarm-table-panel', name: 'Alarm Table', version: '' }
      ]
    }

    expect(convert(source).dashboardV12!['__requires'][0].version).toEqual(alarmTablePluginJson.info.version)
  })

  it('should not invent a version for an unrecognised opennms entry', () => {
    const source = {
      __requires: [{ type: 'panel', id: 'opennms-not-a-real-panel', name: 'Nope', version: '3.1.4' }]
    }

    expect(convert(source).dashboardV12!['__requires'][0].version).toEqual('3.1.4')
  })

  it('should not mutate the source dashboard', () => {
    const source = { __requires: [...openNmsRequires.map(r => ({ ...r }))] }

    convert(source)

    expect(source.__requires[0].version).toEqual('1.0.0')
  })

  it('should leave non-OpenNMS entries alone', () => {
    const source = {
      __requires: [
        { type: 'grafana', id: 'grafana', name: 'Grafana', version: '8.0.0' },
        { type: 'panel', id: 'graph', name: 'Graph', version: '' }
      ]
    }

    const requires = convert(source).dashboardV12!['__requires']

    expect(requires[0].version).toEqual('8.0.0')
    expect(requires[1].version).toEqual('')
  })
})

describe('convertToV12 :: annotations', () => {
  it('should read the annotation target limit from target.limit', () => {
    const source = {
      annotations: {
        list: [
          {
            builtIn: 1,
            enable: true,
            iconColor: 'rgba(0, 211, 255, 1)',
            name: 'Annotations & Alerts',
            target: { limit: 100, matchAny: false, tags: [], type: 'dashboard' },
            type: 'dashboard'
          }
        ]
      }
    }

    const annotation = convert(source).dashboardV12!.annotations!.list![0]

    expect((annotation.target as unknown as AnnotationTarget).limit).toEqual(100)
  })

  it('should keep annotation panel filter ids as numbers', () => {
    const source = {
      annotations: {
        list: [
          {
            enable: true,
            iconColor: 'red',
            name: 'Filtered',
            filter: { exclude: false, ids: [3, 7] }
          }
        ]
      }
    }

    const annotation = convert(source).dashboardV12!.annotations!.list![0]

    expect(annotation.filter!.ids).toEqual([3, 7])
  })
})

describe('convertToV12 :: editable', () => {
  it('should preserve a non-editable dashboard', () => {
    expect(convert({ editable: false }).dashboardV12!.editable).toEqual(false)
  })

  it('should preserve an editable dashboard', () => {
    expect(convert({ editable: true }).dashboardV12!.editable).toEqual(true)
  })
})

describe('convertToV12 :: annotation target defaults', () => {
  it('should default the annotation target limit to 100 when absent', () => {
    const source = {
      annotations: {
        list: [
          {
            builtIn: 1,
            enable: true,
            iconColor: 'rgba(0, 211, 255, 1)',
            name: 'Annotations & Alerts',
            target: { matchAny: false, tags: [], type: 'dashboard' },
            type: 'dashboard'
          }
        ]
      }
    }

    const annotation = convert(source).dashboardV12!.annotations!.list![0]

    expect((annotation.target as unknown as AnnotationTarget).limit).toEqual(100)
  })
})

describe('convertToV12 :: unhideAllQueries option', () => {
  const dashboardWithHiddenQueries = {
    panels: [
      {
        type: 'timeseries',
        title: 'Top level',
        targets: [{ refId: 'A', hide: true }, { refId: 'B' }]
      },
      {
        type: 'row',
        title: 'A row',
        collapsed: true,
        panels: [
          { type: 'timeseries', title: 'Nested', targets: [{ refId: 'A', hide: true }] }
        ]
      }
    ]
  }

  it('should unhide all panel targets when the option is set', () => {
    const options = { ...defaultOptions, unhideAllQueries: true }
    const panels = convert(dashboardWithHiddenQueries, options).dashboardV12!.panels as any[]

    expect(panels[0].targets[0].hide).toEqual(false)
    expect(panels[0].targets[1].hide).toEqual(false)
  })

  it('should unhide targets of panels nested inside a collapsed row', () => {
    const options = { ...defaultOptions, unhideAllQueries: true }
    const panels = convert(dashboardWithHiddenQueries, options).dashboardV12!.panels as any[]

    expect(panels[1].panels[0].targets[0].hide).toEqual(false)
  })

  it('should leave the hide flag alone when the option is not set', () => {
    const panels = convert(dashboardWithHiddenQueries, defaultOptions).dashboardV12!.panels as any[]

    expect(panels[0].targets[0].hide).toEqual(true)
    expect(panels[0].targets[1].hide).toBeUndefined()
  })
})

describe('convertToV12 :: convertGraphToTimeSeries option', () => {
  const dashboardWithGraphPanels = {
    panels: [
      {
        type: 'graph',
        title: 'A graph',
        gridPos: { h: 8, w: 12, x: 0, y: 0 },
        legend: { show: true, avg: true },
        yaxes: [{ format: 'Bps', label: 'bits/sec' }],
        targets: [{ refId: 'A' }]
      },
      {
        type: 'row',
        title: 'A row',
        collapsed: true,
        panels: [{ type: 'graph', title: 'Nested graph', targets: [{ refId: 'A' }] }]
      }
    ]
  }

  it('should convert graph panels to timeseries when the option is set', () => {
    const options = { ...defaultOptions, convertGraphToTimeSeries: true }
    const panels = convert(dashboardWithGraphPanels, options).dashboardV12!.panels as any[]

    expect(panels[0].type).toEqual('timeseries')
    expect(panels[0].fieldConfig.defaults.unit).toEqual('Bps')
    expect(panels[0].yaxes).toBeUndefined()
  })

  it('should convert graph panels nested inside a collapsed row', () => {
    const options = { ...defaultOptions, convertGraphToTimeSeries: true }
    const panels = convert(dashboardWithGraphPanels, options).dashboardV12!.panels as any[]

    expect(panels[1].panels[0].type).toEqual('timeseries')
  })

  it('should leave graph panels alone when the option is not set', () => {
    const panels = convert(dashboardWithGraphPanels, defaultOptions).dashboardV12!.panels as any[]

    expect(panels[0].type).toEqual('graph')
  })
})

describe('convertToV12 :: malformed json', () => {
  const badRequest: ConvertResponse = {
    json: '{ not json',
    isError: false,
    targetPluginVersion: 12
  }

  it('should return an error response rather than throwing', () => {
    expect(() => convertDashboardToV12(badRequest, '', defaultOptions)).not.toThrow()
  })

  it('should describe the parse failure', () => {
    const result = convertDashboardToV12(badRequest, '', defaultOptions)

    expect(result.isError).toEqual(true)
    expect(result.errorMessage).toContain('Error parsing source Json')
  })
})

describe('convertToV12 :: variable fields outside the base schema', () => {
  it('should preserve the filters of an adhoc variable', () => {
    const source = {
      templating: {
        list: [
          {
            name: 'Filters',
            type: 'adhoc',
            datasource: { type: 'opennms-entity-datasource', uid: 'abc' },
            filters: [{ key: 'node.label', operator: '=', value: 'srv01' }],
            baseFilters: [{ key: 'severity', operator: '=', value: 'MAJOR' }],
            defaultKeys: [{ text: 'node.label', value: 'node.label' }]
          }
        ]
      }
    }

    const variable = convert(source).dashboardV12!.templating!.list![0] as any

    expect(variable.filters).toEqual([{ key: 'node.label', operator: '=', value: 'srv01' }])
    expect(variable.baseFilters).toEqual([{ key: 'severity', operator: '=', value: 'MAJOR' }])
    expect(variable.defaultKeys).toEqual([{ text: 'node.label', value: 'node.label' }])
  })

  it('should preserve the defaultValue of a groupby variable', () => {
    const source = {
      templating: {
        list: [
          { name: 'Group', type: 'groupby', multi: true, defaultValue: { selected: true, text: 'node', value: 'node' } }
        ]
      }
    }

    const variable = convert(source).dashboardV12!.templating!.list![0] as any

    expect(variable.defaultValue).toEqual({ selected: true, text: 'node', value: 'node' })
  })

  it('should preserve the v12 regexApplyTo and valuesFormat fields', () => {
    const source = {
      templating: {
        list: [{ name: 'Nodes', type: 'query', regexApplyTo: 'text', valuesFormat: 'json' }]
      }
    }

    const variable = convert(source).dashboardV12!.templating!.list![0] as any

    expect(variable.regexApplyTo).toEqual('text')
    expect(variable.valuesFormat).toEqual('json')
  })

  it('should preserve the properties of a multi-prop variable option', () => {
    const source = {
      templating: {
        list: [
          {
            name: 'Nodes',
            type: 'query',
            current: { selected: true, text: 'srv01', value: '1', properties: { foreignId: 'srv01' } }
          }
        ]
      }
    }

    const variable = convert(source).dashboardV12!.templating!.list![0] as any

    expect(variable.current.properties).toEqual({ foreignId: 'srv01' })
  })

  it('should recognise the switch variable type', () => {
    const source = { templating: { list: [{ name: 'Toggle', type: 'switch' }] } }

    const variable = convert(source).dashboardV12!.templating!.list![0]

    expect(variable.type).toEqual('switch')
  })
})

describe('convertToV12 :: annotation and link fields outside the base schema', () => {
  it('should preserve datasource specific annotation query fields', () => {
    const source = {
      annotations: {
        list: [
          {
            enable: true,
            iconColor: 'red',
            name: 'OpenNMS Alarms',
            datasource: { type: 'opennms-entity-datasource', uid: 'abc' },
            expr: 'severity >= MAJOR',
            titleFormat: '{{label}}'
          }
        ]
      }
    }

    const annotation = convert(source).dashboardV12!.annotations!.list![0] as any

    expect(annotation.expr).toEqual('severity >= MAJOR')
    expect(annotation.titleFormat).toEqual('{{label}}')
  })

  it('should preserve the v12 annotation placement field', () => {
    const source = {
      annotations: {
        list: [{ enable: true, iconColor: 'red', name: 'A', placement: 'inControlsMenu' }]
      }
    }

    const annotation = convert(source).dashboardV12!.annotations!.list![0] as any

    expect(annotation.placement).toEqual('inControlsMenu')
  })

  it('should preserve the v12 dashboard link placement field', () => {
    const source = {
      links: [{ type: 'link', title: 'Docs', url: 'https://example.com', placement: 'inControlsMenu' }]
    }

    const link = convert(source).dashboardV12!.links![0] as any

    expect(link.placement).toEqual('inControlsMenu')
  })
})

describe('convertToV12 :: annotation target query fields', () => {
  it('should preserve datasource specific fields inside the annotation target', () => {
    const source = {
      annotations: {
        list: [
          {
            enable: true,
            iconColor: 'red',
            name: 'OpenNMS Alarms',
            datasource: { type: 'opennms-entity-datasource', uid: 'abc' },
            target: { refId: 'A', entityType: 'alarm', filter: { clauses: [] } }
          }
        ]
      }
    }

    const target = convert(source).dashboardV12!.annotations!.list![0].target as any

    expect(target.entityType).toEqual('alarm')
    expect(target.filter).toEqual({ clauses: [] })
    expect(target.refId).toEqual('A')
  })
})

describe('convertToV12 :: datasource references', () => {
  const panelWithDatasource = (datasource: any) => ({
    panels: [{ type: 'timeseries', title: 'P', datasource, targets: [{ refId: 'A' }] }]
  })

  const panelDatasource = (datasource: any) =>
    (convert(panelWithDatasource(datasource)).dashboardV12!.panels as any[])[0].datasource

  it('should map a plain datasource name to the uid', () => {
    expect(panelDatasource('OpenNMS Performance')).toEqual({ uid: 'OpenNMS Performance' })
  })

  it('should map a $var template variable to the uid, not the type', () => {
    expect(panelDatasource('$datasource')).toEqual({ uid: '$datasource' })
  })

  it('should map a ${var} template variable to the uid', () => {
    expect(panelDatasource('${datasource}')).toEqual({ uid: '${datasource}' })
  })

  it('should map a legacy [[var]] template variable to the uid', () => {
    expect(panelDatasource('[[datasource]]')).toEqual({ uid: '[[datasource]]' })
  })

  it('should treat an empty datasource name as no datasource', () => {
    expect(panelDatasource('')).toBeNull()
  })

  it('should preserve an explicit null datasource', () => {
    expect(panelDatasource(null)).toBeNull()
  })

  it('should preserve a full DataSourceRef object', () => {
    const ref = { type: 'opennms-performance-datasource', uid: 'xT5Xzsq7z' }

    expect(panelDatasource(ref)).toEqual(ref)
  })

  it('should not emit empty apiVersion or uid placeholders', () => {
    const json = JSON.parse(convert(panelWithDatasource('$datasource')).json)

    expect(json.panels[0].datasource.apiVersion).toBeUndefined()
    expect(json.panels[0].datasource.type).toBeUndefined()
  })

  it('should map annotation datasource names the same way', () => {
    const source = {
      annotations: { list: [{ enable: true, iconColor: 'red', name: 'A', datasource: '$datasource' }] }
    }

    expect(convert(source).dashboardV12!.annotations!.list![0].datasource).toEqual({ uid: '$datasource' })
  })

  it('should map variable datasource names the same way', () => {
    const source = {
      templating: { list: [{ name: 'Nodes', type: 'query', datasource: 'OpenNMS Entities' }] }
    }

    expect(convert(source).dashboardV12!.templating!.list![0].datasource).toEqual({ uid: 'OpenNMS Entities' })
  })
})

describe('convertToV12 :: target level datasource references', () => {
  const targetDatasource = (datasource: any) => {
    const source = {
      panels: [{ type: 'timeseries', title: 'P', targets: [{ refId: 'A', datasource }] }]
    }

    return (convert(source).dashboardV12!.panels as any[])[0].targets[0].datasource
  }

  it('should normalize a plain datasource name on a target', () => {
    expect(targetDatasource('OpenNMS Performance')).toEqual({ uid: 'OpenNMS Performance' })
  })

  it('should normalize a template variable on a target', () => {
    expect(targetDatasource('$datasource')).toEqual({ uid: '$datasource' })
  })

  it('should preserve a full DataSourceRef object on a target', () => {
    const ref = { type: 'opennms-performance-datasource', uid: 'xT5Xzsq7z' }

    expect(targetDatasource(ref)).toEqual(ref)
  })

  it('should leave a target without a datasource alone', () => {
    expect(targetDatasource(undefined)).toBeUndefined()
  })
})

describe('convertToV12 :: graph to timeseries panel time overrides', () => {
  it('should preserve timeFrom and timeShift when converting a graph panel', () => {
    const source = {
      panels: [{
        type: 'graph',
        title: 'A graph',
        timeFrom: 'now-2d',
        timeShift: '1d',
        yaxes: [{ format: 'Bps', label: '' }],
        targets: [{ refId: 'A' }]
      }]
    }
    const options = { ...defaultOptions, convertGraphToTimeSeries: true }

    const panel = (convert(source, options).dashboardV12!.panels as any[])[0]

    expect(panel.type).toEqual('timeseries')
    expect(panel.timeFrom).toEqual('now-2d')
    expect(panel.timeShift).toEqual('1d')
  })
})

describe('convertToV12 :: dashboard defaults for fields the source omits', () => {
  const convertJson = (source: any) => JSON.parse(convert(source).json)

  it('should default schemaVersion to the version @grafana/schema provides, not 0', () => {
    expect(convertJson({}).schemaVersion).toEqual(defaultDashboard.schemaVersion)
    expect(convertJson({}).schemaVersion).toBeGreaterThan(0)
  })

  it('should preserve the source schemaVersion so Grafana runs only the migrations it needs', () => {
    expect(convertJson({ schemaVersion: 36 }).schemaVersion).toEqual(36)
  })

  it('should not invent a refresh interval', () => {
    expect(convertJson({})).not.toHaveProperty('refresh')
  })

  it('should not turn on liveNow or preload', () => {
    expect(convertJson({})).not.toHaveProperty('liveNow')
    expect(convertJson({})).not.toHaveProperty('preload')
  })

  it('should default the timezone to browser rather than utc', () => {
    expect(convertJson({}).timezone).toEqual('browser')
  })

  it('should not invent a weekStart', () => {
    expect(convertJson({})).not.toHaveProperty('weekStart')
  })

  it('should not emit empty description, gnetId or revision placeholders', () => {
    const json = convertJson({})

    expect(json).not.toHaveProperty('description')
    expect(json).not.toHaveProperty('gnetId')
    expect(json).not.toHaveProperty('revision')
  })

  it('should null the id and drop the uid so the importing Grafana assigns its own', () => {
    const json = convertJson({ id: 47, uid: 'abc12345' })

    expect(json.id).toBeNull()
    expect(json).not.toHaveProperty('uid')
  })

  it('should still honour the values the source does set', () => {
    const json = convertJson({
      refresh: '30s',
      liveNow: true,
      preload: true,
      timezone: 'utc',
      weekStart: 'sunday',
      description: 'A dashboard',
      revision: 3
    })

    expect(json.refresh).toEqual('30s')
    expect(json.liveNow).toEqual(true)
    expect(json.preload).toEqual(true)
    expect(json.timezone).toEqual('utc')
    expect(json.weekStart).toEqual('sunday')
    expect(json.description).toEqual('A dashboard')
    expect(json.revision).toEqual(3)
  })

  it('should honour liveNow false rather than replacing it with the default', () => {
    expect(convertJson({ liveNow: false }).liveNow).toEqual(false)
  })
})

describe('convertToV12 :: sub-object defaults', () => {
  const convertJson = (source: any) => JSON.parse(convert(source).json)

  it('should default an annotation to enabled, as Grafana does', () => {
    const source = { annotations: { list: [{ iconColor: 'red', name: 'A' }] } }

    expect(convertJson(source).annotations.list[0].enable).toEqual(true)
  })

  it('should keep an explicitly disabled annotation disabled', () => {
    const source = { annotations: { list: [{ enable: false, iconColor: 'red', name: 'A' }] } }

    expect(convertJson(source).annotations.list[0].enable).toEqual(false)
  })

  it('should default a missing gridPos to the Grafana default size, not zero', () => {
    const source = { panels: [{ type: 'timeseries', title: 'P', gridPos: {} }] }

    const gridPos = convertJson(source).panels[0].gridPos

    expect(gridPos.h).toEqual(defaultGridPos.h)
    expect(gridPos.w).toEqual(defaultGridPos.w)
  })

  it('should not emit a static flag on a gridPos that has none', () => {
    const source = { panels: [{ type: 'timeseries', title: 'P', gridPos: { h: 8, w: 12, x: 0, y: 0 } }] }

    expect(convertJson(source).panels[0].gridPos).not.toHaveProperty('static')
  })

  it('should not emit empty refresh_intervals, which would blank the refresh picker', () => {
    const source = { timepicker: { hidden: false } }

    expect(convertJson(source).timepicker).not.toHaveProperty('refresh_intervals')
  })

  it('should not emit empty quick_ranges', () => {
    const source = { timepicker: { hidden: false } }

    expect(convertJson(source).timepicker).not.toHaveProperty('quick_ranges')
  })

  it('should still map refresh_intervals and quick_ranges the source does have', () => {
    const source = { timepicker: { refresh_intervals: ['10s', '1m'], time_options: ['5m', '1h'] } }

    const timepicker = convertJson(source).timepicker

    expect(timepicker.refresh_intervals).toEqual(['10s', '1m'])
    expect(timepicker.quick_ranges).toEqual([
      { display: '5m', from: 'now-5m', to: 'now' },
      { display: '1h', from: 'now-1h', to: 'now' }
    ])
  })

  it('should not emit empty staticOptions on a variable that has none', () => {
    const source = { templating: { list: [{ name: 'Env', type: 'constant', query: 'prod' }] } }

    expect(convertJson(source).templating.list[0]).not.toHaveProperty('staticOptions')
  })

  it('should not emit a selected flag on a variable option that has none', () => {
    const source = {
      templating: { list: [{ name: 'Nodes', type: 'query', current: { text: 'srv01', value: '1' } }] }
    }

    expect(convertJson(source).templating.list[0].current).not.toHaveProperty('selected')
  })

  it('should keep an empty multi-value selection as an array rather than an empty string', () => {
    const source = {
      templating: { list: [{ name: 'Nodes', type: 'query', multi: true, current: { text: [], value: [] } }] }
    }

    const current = convertJson(source).templating.list[0].current

    expect(current.text).toEqual([])
    expect(current.value).toEqual([])
  })
})

describe('convertToV12 :: panel pluginVersion', () => {
  const convertPanels = (panels: any[]) =>
    JSON.parse(convert({ panels }).json).panels

  it('should stamp the real plugin version on an OpenNMS panel', () => {
    const panels = convertPanels([{ type: 'opennms-alarm-table-panel', title: 'Alarms' }])

    expect(panels[0].pluginVersion).toEqual(alarmTablePluginJson.info.version)
  })

  it('should leave a core panel pluginVersion alone', () => {
    const panels = convertPanels([{ type: 'timeseries', title: 'P', pluginVersion: '12.0.1' }])

    expect(panels[0].pluginVersion).toEqual('12.0.1')
  })

  it('should not invent a pluginVersion for a core panel that has none', () => {
    const panels = convertPanels([{ type: 'timeseries', title: 'P' }])

    expect(panels[0]).not.toHaveProperty('pluginVersion')
  })

  it('should leave a third party panel pluginVersion alone', () => {
    const panels = convertPanels([{ type: 'grafana-worldmap-panel', title: 'Map', pluginVersion: '0.3.2' }])

    expect(panels[0].pluginVersion).toEqual('0.3.2')
  })

  it('should stamp OpenNMS panels nested inside a collapsed row', () => {
    const panels = convertPanels([
      {
        type: 'row',
        title: 'R',
        collapsed: true,
        panels: [{ type: 'opennms-filter-panel', title: 'Filter' }]
      }
    ])

    expect(panels[0].panels[0].pluginVersion).toEqual(filterPanelPluginJson.info.version)
  })
})

describe('convertToV12 :: string array mapping', () => {
  const convertJson = (source: any) => JSON.parse(convert(source).json)

  it('should not leak the array index into a refresh interval that is not a string', () => {
    const source = { timepicker: { refresh_intervals: ['5s', null, '1m'] } }

    expect(convertJson(source).timepicker.refresh_intervals).toEqual(['5s', '', '1m'])
  })

  it('should not leak the array index into a dashboard link tag that is not a string', () => {
    const source = { links: [{ type: 'dashboards', title: 'T', tags: ['prod', null, 'db'] }] }

    expect(convertJson(source).links[0].tags).toEqual(['prod', '', 'db'])
  })

  it('should not leak the array index into an annotation target tag that is not a string', () => {
    const source = {
      annotations: {
        list: [{ enable: true, iconColor: 'red', name: 'A', target: { tags: ['x', null, 'y'] } }]
      }
    }

    expect(convertJson(source).annotations.list[0].target.tags).toEqual(['x', '', 'y'])
  })
})

describe('convertToV12 :: graph panel legacy field removal', () => {
  const graphPanelWithOverrides = {
    panels: [{
      type: 'graph',
      title: 'A graph',
      seriesOverrides: [{ alias: '/In/', stack: 'A', transform: 'negative-Y' }],
      yaxes: [{ format: 'Bps', label: '' }],
      targets: [{ refId: 'A' }]
    }]
  }

  const convertGraph = () => {
    const options = { ...defaultOptions, convertGraphToTimeSeries: true }

    return JSON.parse(convert(graphPanelWithOverrides, options).json).panels[0]
  }

  it('should read seriesOverrides into the fieldConfig overrides', () => {
    expect(convertGraph().fieldConfig.overrides).toHaveLength(1)
  })

  it('should remove the legacy seriesOverrides array from the converted panel', () => {
    expect(convertGraph()).not.toHaveProperty('seriesOverrides')
  })
})
