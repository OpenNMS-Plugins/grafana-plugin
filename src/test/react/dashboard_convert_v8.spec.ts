import { fakeDataSourceSrv } from './support/datasourceSrvFakes'

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getDataSourceSrv: () => fakeDataSourceSrv
}))

import { dashboardConvert } from '../../lib/dashboard-convert'
import { addVariationsToMap } from '../../lib/dashboard-convert/convert-from-v8/utils'
import { ConvertOptions, DsType } from '../../lib/dashboard-convert/types'

const defaultOptions: ConvertOptions = {
  incrementDashboardVersion: false,
  unhideAllQueries: false,
  convertGraphToTimeSeries: false
}

describe('convertFromV8 :: addVariationsToMap', () => {
  it('should register the bare, $ and ${} forms of a variable name', () => {
    const map = new Map<string, DsType>()

    addVariationsToMap('datasource', 'performance', map)

    expect(map.get('datasource')).toEqual('performance')
    expect(map.get('$datasource')).toEqual('performance')
    expect(map.get('${datasource}')).toEqual('performance')
  })

  it('should strip every $ { } from a name that is already decorated', () => {
    const map = new Map<string, DsType>()

    addVariationsToMap('${datasource}', 'entity', map)

    expect(map.get('datasource')).toEqual('entity')
    expect(map.get('$datasource')).toEqual('entity')
    expect(map.get('${datasource}')).toEqual('entity')
  })
})

describe('convertFromV8 :: datasource template variable', () => {
  const helmDashboardWithDatasourceVariable = {
    templating: {
      list: [
        {
          current: { selected: true, text: 'OpenNMS Performance', value: 'OpenNMS Performance' },
          name: 'datasource',
          query: 'opennms-helm-performance-datasource',
          refresh: 1,
          type: 'datasource'
        }
      ]
    },
    panels: [
      {
        datasource: '$datasource',
        type: 'graph',
        title: 'Load',
        targets: [{ refId: 'A', type: 'attribute', nodeId: '1', attribute: 'loadavg1' }]
      }
    ]
  }

  it('should convert a dashboard whose panels point at a datasource variable', () => {
    const result = dashboardConvert(
      JSON.stringify(helmDashboardWithDatasourceVariable), 8, 9, '', defaultOptions)

    expect(result.isError).toEqual(false)
    expect(result.dashboardV9.templating.list[0].query).toEqual('opennms-performance-datasource')
  })

  it('should retain the variable when the datasource is the bare string form', () => {
    const result = dashboardConvert(
      JSON.stringify(helmDashboardWithDatasourceVariable), 8, 9, '', defaultOptions)

    expect(result.dashboardV9.panels[0].datasource).toEqual({
      type: 'opennms-performance-datasource',
      uid: '$datasource'
    })
  })

  it('should retain the ${} form of the variable', () => {
    const source = {
      ...helmDashboardWithDatasourceVariable,
      panels: [{ ...helmDashboardWithDatasourceVariable.panels[0], datasource: '${datasource}' }]
    }

    const result = dashboardConvert(JSON.stringify(source), 8, 9, '', defaultOptions)

    expect(result.dashboardV9.panels[0].datasource.uid).toEqual('${datasource}')
  })

  it('should retain the variable on a target as well as on the panel', () => {
    const source = {
      ...helmDashboardWithDatasourceVariable,
      panels: [
        {
          ...helmDashboardWithDatasourceVariable.panels[0],
          datasource: undefined,
          targets: [{ refId: 'A', datasource: '$datasource', type: 'attribute', nodeId: '1' }]
        }
      ]
    }

    const result = dashboardConvert(JSON.stringify(source), 8, 9, '', defaultOptions)

    expect(result.dashboardV9.panels[0].targets[0].datasource).toEqual({
      type: 'opennms-performance-datasource',
      uid: '$datasource'
    })
  })

  // A bare variable name with no $ is not a usable Grafana reference, so it is treated as a
  // datasource name and resolved to the concrete uid rather than retained.
  it('should resolve a name with no variable sigil to the concrete datasource uid', () => {
    const source = {
      ...helmDashboardWithDatasourceVariable,
      panels: [{ ...helmDashboardWithDatasourceVariable.panels[0], datasource: 'datasource' }]
    }

    const result = dashboardConvert(JSON.stringify(source), 8, 9, '', defaultOptions)

    expect(result.dashboardV9.panels[0].datasource.uid).toEqual('onms-perf')
  })

  it('should retain the variable when the datasource is the object form', () => {
    const source = {
      ...helmDashboardWithDatasourceVariable,
      panels: [
        {
          ...helmDashboardWithDatasourceVariable.panels[0],
          datasource: { type: 'opennms-helm-performance-datasource', uid: '$datasource' }
        }
      ]
    }

    const result = dashboardConvert(JSON.stringify(source), 8, 9, '', defaultOptions)

    expect(result.dashboardV9.panels[0].datasource).toEqual({
      type: 'opennms-performance-datasource',
      uid: '$datasource'
    })
  })
})

describe('convertFromV8 :: null entries', () => {
  const nullCases: Array<[string, any]> = [
    ['__requires', { __requires: [null] }],
    ['__inputs', { __inputs: [null] }],
    ['templating list', { templating: { list: [null] } }],
    ['panels', { panels: [null] }],
    ['panel targets', { panels: [{ type: 'graph', targets: [null] }] }]
  ]

  it.each(nullCases)('should convert a v8 dashboard with a null %s entry without throwing', (_name, source) => {
    expect(() => dashboardConvert(JSON.stringify(source), 8, 12, '', defaultOptions)).not.toThrow()
    expect(dashboardConvert(JSON.stringify(source), 8, 12, '', defaultOptions).isError).toEqual(false)
  })
})

/**
 * A v8 dashboard can name its datasource by plugin id rather than by variable, e.g.
 * "datasource": "opennms-helm-entity-datasource". That id does not exist in Grafana 12, so it
 * has to be rewritten to the installed v9+ datasource. convertFromV8 rewrote __inputs,
 * __requires, templating and panel/target refs held as objects, but not a bare plugin id
 * string, and annotations were passed through untouched by the spread.
 */
describe('convertFromV8 :: legacy plugin id datasource strings', () => {
  const dashboard = {
    annotations: {
      list: [{ name: 'Alarms', iconColor: 'red', enable: true, datasource: 'opennms-helm-entity-datasource' }]
    },
    panels: [
      { type: 'graph', title: 'Panel ref', datasource: 'opennms-helm-performance-datasource', targets: [{ refId: 'A' }] },
      { type: 'graph', title: 'Target ref', targets: [{ refId: 'A', datasource: 'opennms-helm-performance-datasource' }] }
    ]
  }

  const convertToV9 = () => dashboardConvert(JSON.stringify(dashboard), 8, 9, '', defaultOptions).dashboardV9

  it('should rewrite a legacy plugin id on a panel to the installed datasource', () => {
    expect(convertToV9().panels[0].datasource).toEqual({
      type: 'opennms-performance-datasource',
      uid: 'onms-perf'
    })
  })

  it('should rewrite a legacy plugin id on a target to the installed datasource', () => {
    expect(convertToV9().panels[1].targets[0].datasource).toEqual({
      type: 'opennms-performance-datasource',
      uid: 'onms-perf'
    })
  })

  it('should rewrite a legacy plugin id on an annotation to the installed datasource', () => {
    expect(convertToV9().annotations.list[0].datasource).toEqual({
      type: 'opennms-entity-datasource',
      uid: 'onms-entity'
    })
  })

  it('should carry the rewritten annotation datasource through to v12', () => {
    const result = dashboardConvert(JSON.stringify(dashboard), 8, 12, '', defaultOptions)

    expect(result.dashboardV12!.annotations!.list![0].datasource).toEqual({
      type: 'opennms-entity-datasource',
      uid: 'onms-entity'
    })
  })

  it('should leave a non-OpenNMS annotation datasource alone', () => {
    const source = {
      annotations: { list: [{ name: 'G', iconColor: 'red', enable: true, datasource: '-- Grafana --' }] }
    }

    const result = dashboardConvert(JSON.stringify(source), 8, 9, '', defaultOptions)

    expect(result.dashboardV9.annotations.list[0].datasource).toEqual('-- Grafana --')
  })
})
