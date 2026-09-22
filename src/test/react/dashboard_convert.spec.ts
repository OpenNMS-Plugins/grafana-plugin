import { dashboardConvert } from '../../lib/dashboard-convert'
import { ConvertOptions } from '../../lib/dashboard-convert/types'

const defaultOptions: ConvertOptions = {
  incrementDashboardVersion: false,
  unhideAllQueries: false,
  convertGraphToTimeSeries: false
}

const v9Dashboard = {
  uid: 'abc12345',
  title: 'Original Title',
  version: 4,
  schemaVersion: 39,
  panels: [{ type: 'timeseries', title: 'A panel', gridPos: { h: 8, w: 12, x: 0, y: 0 } }]
}

describe('dashboardConvert :: source 9 to target 9', () => {
  it('should convert without an error', () => {
    const result = dashboardConvert(JSON.stringify(v9Dashboard), 9, 9, '', defaultOptions)

    expect(result.isError).toEqual(false)
    expect(result.targetPluginVersion).toEqual(9)
  })

  it('should strip the uid so Grafana assigns a new one on import', () => {
    const result = dashboardConvert(JSON.stringify(v9Dashboard), 9, 9, '', defaultOptions)

    expect(result.dashboardV9.uid).toBeUndefined()
    expect(JSON.parse(result.json).uid).toBeUndefined()
  })

  it('should apply the supplied dashboard title', () => {
    const result = dashboardConvert(JSON.stringify(v9Dashboard), 9, 9, 'New Title', defaultOptions)

    expect(result.dashboardV9.title).toEqual('New Title')
  })

  it('should keep the original title when no title is supplied', () => {
    const result = dashboardConvert(JSON.stringify(v9Dashboard), 9, 9, '', defaultOptions)

    expect(result.dashboardV9.title).toEqual('Original Title')
  })

  it('should increment the version when requested', () => {
    const options = { ...defaultOptions, incrementDashboardVersion: true }
    const result = dashboardConvert(JSON.stringify(v9Dashboard), 9, 9, '', options)

    expect(result.dashboardV9.version).toEqual(5)
  })

  it('should preserve the rest of the dashboard', () => {
    const result = dashboardConvert(JSON.stringify(v9Dashboard), 9, 9, '', defaultOptions)

    expect(result.dashboardV9.schemaVersion).toEqual(39)
    expect(result.dashboardV9.panels).toHaveLength(1)
    expect(result.dashboardV9.panels[0].title).toEqual('A panel')
  })

  it('should report an error for malformed json', () => {
    const result = dashboardConvert('{ not json', 9, 9, '', defaultOptions)

    expect(result.isError).toEqual(true)
    expect(result.errorMessage).toContain('Error parsing source Json')
  })
})

describe('dashboardConvert :: unsupported downgrades', () => {
  it('should report an error when asked to downgrade v12 to v9', () => {
    const result = dashboardConvert(JSON.stringify(v9Dashboard), 12, 9, '', defaultOptions)

    expect(result.isError).toEqual(true)
  })
})

describe('dashboardConvert :: source 9 to target 12', () => {
  it('should report an error for malformed json rather than throwing', () => {
    let result: any

    expect(() => {
      result = dashboardConvert('{ not json', 9, 12, '', defaultOptions)
    }).not.toThrow()

    expect(result.isError).toEqual(true)
    expect(result.errorMessage).toContain('Error parsing source Json')
  })
})

/**
 * DashboardConvertPanelControl renders "Unhide all queries" and "Convert Graph to Timeseries
 * Panels" regardless of the chosen target version, so the v9 normalize path has to honour them
 * too. Otherwise Source 9 / Target 9 with both switches on silently does neither.
 */
describe('dashboardConvert :: source 9 to target 9 options', () => {
  const dashboard = {
    title: 'Options',
    panels: [
      {
        type: 'graph',
        title: 'A graph',
        yaxes: [{ format: 'Bps', label: '' }],
        targets: [{ refId: 'A', hide: true }, { refId: 'B' }]
      },
      {
        type: 'row',
        collapsed: true,
        title: 'R',
        panels: [{ type: 'graph', title: 'Nested', targets: [{ refId: 'A', hide: true }] }]
      }
    ]
  }

  const convertWith = (options: Partial<ConvertOptions>) =>
    dashboardConvert(JSON.stringify(dashboard), 9, 9, '', { ...defaultOptions, ...options }).dashboardV9

  it('should unhide all queries when asked', () => {
    const panels = convertWith({ unhideAllQueries: true }).panels

    expect(panels[0].targets[0].hide).toEqual(false)
    expect(panels[0].targets[1].hide).toEqual(false)
  })

  it('should unhide queries nested inside a collapsed row', () => {
    const panels = convertWith({ unhideAllQueries: true }).panels

    expect(panels[1].panels[0].targets[0].hide).toEqual(false)
  })

  it('should convert graph panels to timeseries when asked', () => {
    const panels = convertWith({ convertGraphToTimeSeries: true }).panels

    expect(panels[0].type).toEqual('timeseries')
    expect(panels[0].fieldConfig.defaults.unit).toEqual('Bps')
  })

  it('should convert graph panels nested inside a collapsed row', () => {
    const panels = convertWith({ convertGraphToTimeSeries: true }).panels

    expect(panels[1].panels[0].type).toEqual('timeseries')
  })

  it('should leave both alone when neither option is set', () => {
    const panels = convertWith({}).panels

    expect(panels[0].type).toEqual('graph')
    expect(panels[0].targets[0].hide).toEqual(true)
  })
})

describe('dashboardConvert :: dashboard id across paths', () => {
  const withId = { title: 'T', id: 47, uid: 'abc12345', panels: [] }

  it.each([[9, 9], [9, 12]] as Array<[number, number]>)(
    'should null the id and drop the uid converting %i to %i', (sourceVersion, targetVersion) => {
      const result = dashboardConvert(JSON.stringify(withId), sourceVersion, targetVersion, '', defaultOptions)
      const json = JSON.parse(result.json)

      expect(json.id).toBeNull()
      expect(json).not.toHaveProperty('uid')
    })
})
