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

  // NOTE: this pins current behaviour, which does not match updateTargetDatasource's stated
  // intent of "retain the original uid if it's a template variable". That check reads
  // source.datasource.uid, which is undefined when the datasource is the bare string
  // '$datasource' rather than { uid: '$datasource' }, so the variable is resolved away to a
  // concrete uid from the converting machine. See the object form below, which does retain it.
  it('should resolve a bare string datasource variable to the v9 datasource uid', () => {
    const result = dashboardConvert(
      JSON.stringify(helmDashboardWithDatasourceVariable), 8, 9, '', defaultOptions)

    expect(result.dashboardV9.panels[0].datasource).toEqual({
      type: 'opennms-performance-datasource',
      uid: 'onms-perf'
    })
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
