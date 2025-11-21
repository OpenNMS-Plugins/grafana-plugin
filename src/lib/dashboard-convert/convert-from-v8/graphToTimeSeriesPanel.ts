export const isLegacyGraphPanel = (panel: any) => {
  return panel?.type === 'graph'
}

export const convertLegacyGraphToTimeSeriesPanel = (source: any) => {
  const panel = {
    ...source,
    gridPos: source.gridPos,
    id: source.id,
    links: source.links,
    fieldConfig: convertFieldConfig(source),
    options: convertOptions(source),
    pluginVersion: '9.4.7',
    type: 'timeseries'
  }

  // remove legacy fields that are not in new data structure
  // targets should already have been converted
  delete panel.bars
  delete panel.dashLength
  delete panel.dashes
  delete panel.fill
  delete panel.fillGradient
  delete panel.hiddenSeries
  delete panel.legend
  delete panel.lines
  delete panel.linewidth
  delete panel.nullPointMode
  delete panel.percentage
  delete panel.pointradius
  delete panel.points
  delete panel.renderer
  delete panel.seriesOverride
  delete panel.spaceLength
  delete panel.stack
  delete panel.steppedLine
  delete panel.thresholds
  delete panel.timeFrom
  delete panel.timeRegions
  delete panel.timeShift
  delete panel.tooltip
  delete panel.xaxis
  delete panel.yaxes
  delete panel.yaxis

  return panel
}

const convertOptions = (source: any) => {
  const legend = source.legend || {}
  const calcs: string[] = []

  const calcItems = [
    { f: l => l.avg === true, calc: 'mean' },
    { f: l => l.current === true, calc: 'current' },
    { f: l => l.max === true, calc: 'max' },
    { f: l => l.min === true, calc: 'min' },
    { f: l => l.total === true, calc: 'total' }
  ]

  for (const item of calcItems) {
    if (item.f(legend)) {
      calcs.push(item.calc)
    }
  }

  const options = {
    legend: {
      calcs,
      displayMode: 'table', // legend.alignAsTable === true
      placement: 'bottom',
      showLegend: legend.show === true
    },
    tooltip: {
      mode: 'multi',
      sort: 'none'
    }
  }

  return options
}

const convertFieldConfig = (source: any) => {
  // Things not (yet) mapped:
  // options.alertThreshold
  // aliasColors

  const fieldConfig = {
    defaults: {
      color: {
        mode: 'palette-classic'
      },
      custom: {
        axisCenteredZero: false,
        axisColorMode: 'text',
        axisLabel: source.yaxes?.[0].label || '', // e.g. 'bytes/sec'
        axisPlacement: 'auto',
        barAlignment: 0,
        drawStyle: 'line',  // lines === true ?
        fillOpacity: 10,
        gradientMode: 'none',  // possibly fillGradient
        hideFrom: {
          legend: false,
          tooltip: false,
          viz: false
        },
        lineInterpolation: 'linear',
        lineWidth: source.linewidth || 1,
        pointSize: source.pointradius || 5,
        scaleDistribution: {
          type: 'linear'
        },
        showPoints: source.points === false ? 'never' : '',  // not sure if true
        spanNulls: false,
        stacking: {
          group: 'A',
          mode: 'normal'
        },
        thresholdsStyle: {
          mode: 'off'
        }
      },
      mappings: [],
      thresholds: {
        mode: 'absolute',
        steps: [
          {
            color: 'green',
            value: null
          },
          {
            color: 'red',
            value: 80
          }
        ]
      },
      unit: source.yaxes?.[0]?.format || '' // e.g. 'Bps'
    },
    overrides: convertFieldConfigOverrides(source)
  }

  return fieldConfig
}

const convertFieldConfigOverrides = (source: any) => {
  const overrides: any[] = []

  if (source.seriesOverrides) {
    for (const o of source.seriesOverrides) {
      if (o.alias && o.stack) {
        const item = {
          matcher: {
            id: 'byRegexp',
            options: o.alias // e.g. '/In/'
          },
          properties: [
            {
              id: 'custom.stacking',
              value: {
                group: o.stack,  // e.g. 'A' or 'B'
                mode: 'normal'
              }
            }
          ]
        }

        // e.g. 'negative-Y'
        if (o.transform) {
          item.properties.push({
            id: 'custom.transform',
            value: o.transform
          })
        }

        overrides.push(item)
      }
    }
  }

  return overrides
}
