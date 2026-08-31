import { AnnotationTarget } from '@grafana/schema'
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

  it('should bump the version of OpenNMS entries in the converted output', () => {
    const result = convert({ __requires: [...openNmsRequires.map(r => ({ ...r }))] })

    expect(result.dashboardV12!['__requires'][0].version).toEqual(12)
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
