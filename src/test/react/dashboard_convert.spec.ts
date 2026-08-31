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
