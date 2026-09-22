import { fakeDataSourceSrv } from './support/datasourceSrvFakes'

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getDataSourceSrv: () => fakeDataSourceSrv
}))

import helmV8Dashboard from './support/fixtures/helm-v8-dashboard.json'
import opgV9Dashboard from './support/fixtures/opg-v9-dashboard.json'
import { dashboardConvert } from '../../lib/dashboard-convert'
import { ConvertOptions } from '../../lib/dashboard-convert/types'

const defaultOptions: ConvertOptions = {
  incrementDashboardVersion: false,
  unhideAllQueries: false,
  convertGraphToTimeSeries: false
}

const allOptions: ConvertOptions = {
  incrementDashboardVersion: true,
  unhideAllQueries: true,
  convertGraphToTimeSeries: true
}

const convert = (source: any, sourceVersion: number, targetVersion: number, options = defaultOptions) =>
  dashboardConvert(JSON.stringify(source), sourceVersion, targetVersion, '', options)

/**
 * Golden tests. These snapshot the whole converted dashboard, so any unintended change to the
 * output shows up as a diff rather than as a dashboard that misbehaves weeks later.
 * If a diff is intentional, read it carefully before running jest -u.
 */
describe('dashboardConvert :: golden output', () => {
  it('should convert an OPG v9 dashboard to v12', () => {
    const result = convert(opgV9Dashboard, 9, 12)

    expect(result.isError).toEqual(false)
    expect(result.dashboardV12).toMatchSnapshot()
  })

  it('should convert a Helm v8 dashboard to v12', () => {
    const result = convert(helmV8Dashboard, 8, 12)

    expect(result.isError).toEqual(false)
    expect(result.dashboardV12).toMatchSnapshot()
  })

  it('should convert a Helm v8 dashboard to v12 with every option enabled', () => {
    const result = convert(helmV8Dashboard, 8, 12, allOptions)

    expect(result.isError).toEqual(false)
    expect(result.dashboardV12).toMatchSnapshot()
  })

  it('should convert a Helm v8 dashboard to v9', () => {
    const result = convert(helmV8Dashboard, 8, 9)

    expect(result.isError).toEqual(false)
    expect(result.dashboardV9).toMatchSnapshot()
  })
})

/**
 * The converter is used repeatedly on the same Json while a user tweaks the options, and
 * Source 12 to Target 12 is an offered combination, so converting an already converted
 * dashboard must not keep changing it.
 */
describe('dashboardConvert :: idempotency', () => {
  const convertTwice = (source: any, sourceVersion: number) => {
    const once = convert(source, sourceVersion, 12)
    const twice = dashboardConvert(once.json, 12, 12, '', defaultOptions)

    return { once, twice }
  }

  it('should be a fixed point for a v9 source', () => {
    const { once, twice } = convertTwice(opgV9Dashboard, 9)

    expect(twice.isError).toEqual(false)
    expect(twice.dashboardV12).toEqual(once.dashboardV12)
  })

  it('should be a fixed point for a v8 source, once it has been converted', () => {
    const { once, twice } = convertTwice(helmV8Dashboard, 8)

    expect(twice.isError).toEqual(false)
    expect(twice.dashboardV12).toEqual(once.dashboardV12)
  })

  it('should be a fixed point for the v9 normalize path', () => {
    const once = convert(opgV9Dashboard, 9, 9)
    const twice = dashboardConvert(once.json, 9, 9, '', defaultOptions)

    expect(twice.dashboardV9).toEqual(once.dashboardV9)
  })

  it('should increment the version on each pass when asked to, by design', () => {
    const options = { ...defaultOptions, incrementDashboardVersion: true }
    const once = dashboardConvert(JSON.stringify(opgV9Dashboard), 9, 12, '', options)
    const twice = dashboardConvert(once.json, 12, 12, '', options)

    expect(once.dashboardV12!.version).toEqual(opgV9Dashboard.version + 1)
    expect(twice.dashboardV12!.version).toEqual(opgV9Dashboard.version + 2)
  })
})

/**
 * Invariants that hold for any input. These are the failure modes that are invisible in a
 * converted dashboard until something breaks: a numeric field serialized as null because a
 * parse fell through, or a whole section quietly dropped by a mapper that did not know about it.
 */
describe('dashboardConvert :: invariants', () => {
  // NaN is the tell that a number failed to parse and fell through a mapper. It only exists
  // before serialization: JSON.stringify writes it as null, where it is indistinguishable from
  // the nulls the schema legitimately allows (Threshold.value, a default datasource, the id).
  // So walk the object, not the Json.
  const collectNaNs = (node: any, path = '', found: string[] = []) => {
    if (typeof node === 'number') {
      if (Number.isNaN(node)) {
        found.push(path)
      }
    } else if (Array.isArray(node)) {
      node.forEach((item, i) => collectNaNs(item, `${path}[${i}]`, found))
    } else if (node !== null && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        collectNaNs(value, path ? `${path}.${key}` : key, found)
      }
    }

    return found
  }

  const cases: Array<[string, any, number]> = [
    ['v9', opgV9Dashboard, 9],
    ['v8', helmV8Dashboard, 8]
  ]

  it.each(cases)('should not drop any top level key of the %s source', (_name, source, sourceVersion) => {
    const out = JSON.parse(convert(source, sourceVersion, 12).json)

    // 'uid' is deliberately stripped so the importing Grafana assigns its own
    const expected = Object.keys(source).filter(k => k !== 'uid')

    expect(Object.keys(out)).toEqual(expect.arrayContaining(expected))
  })

  it.each(cases)('should not leave a NaN behind in the %s conversion', (_name, source, sourceVersion) => {
    const result = convert(source, sourceVersion, 12)

    expect(collectNaNs(result.dashboardV12)).toEqual([])
  })

  it('should catch a NaN if one is ever reintroduced', () => {
    // guards the invariant itself: the walk has to actually find one
    expect(collectNaNs({ panels: [{ gridPos: { h: Number.NaN } }] })).toEqual(['panels[0].gridPos.h'])
  })

  it.each(cases)('should keep every panel of the %s source, including nested ones', (_name, source, sourceVersion) => {
    const countPanels = (panels: any[]): number =>
      panels.reduce((total, p) => total + 1 + countPanels(p.panels ?? []), 0)

    const out = JSON.parse(convert(source, sourceVersion, 12).json)

    expect(countPanels(out.panels)).toEqual(countPanels(source.panels))
  })
})
