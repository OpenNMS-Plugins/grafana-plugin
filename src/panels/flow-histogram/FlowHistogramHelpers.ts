import { CSSProperties } from 'react'
import { DataFrame, PanelData } from '@grafana/data'
import { FlowHistogramOptionsProps, FlowPanelDataProcessed, FlowPanelUnitInfo } from './FlowHistogramTypes'
import { DataPosition, FlowDataDirection, UnitInfo } from './FlowHistogramConstants'

type LabelFunction = (s: string, idx: number) => string

export const getFlowHistogramPlotData = (
  processedData: FlowPanelDataProcessed,
  options: { flowHistogramOptions: FlowHistogramOptionsProps }): jquery.flot.dataSeries[] => {

  const mode = options.flowHistogramOptions.mode.label

  if (mode === 'Separate') {
    return createSeparateFlotDataSeries(processedData, options.flowHistogramOptions.direction.label)
  } else if (mode === 'Stacked') {
    return processedData.stackedData?.metricsByLabel || []
  }

  return []
}

const createSeparateFlotDataSeries = (processedData: FlowPanelDataProcessed, direction?: string): jquery.flot.dataSeries[] => {
  const inSeriesData: jquery.flot.dataSeries = {
    label: 'In',
    bars: {
      show: true,
      barWidth: 0.2,
      align: direction === 'Horizontal' ? 'left' : 'right'
    },
    data: processedData.separateData?.inByLabel || []
  }

  const outSeriesData: jquery.flot.dataSeries = {
    label: 'Out',
    bars: {
      show: true,
      barWidth: 0.2,
      align: direction === 'Horizontal' ? 'right' : 'left'
    },
    data: processedData.separateData?.outByLabel || []
  }

  return [outSeriesData, inSeriesData]
}

export const getFlowHistogramPlotConfig = (
  processedData: FlowPanelDataProcessed,
  options: { flowHistogramOptions: FlowHistogramOptionsProps }): jquery.flot.plotOptions => {

    const stacked = options.flowHistogramOptions.mode.label === 'Stacked'
    const horizontal = options.flowHistogramOptions.direction.label === 'Horizontal'
    const container = null //options.flowHistogramOptions.position.label === 'Under Graph' ? $('.flow-histogram-legend-bottom') : $('.flow-histogram-legend-right') 
    const noColumns = options.flowHistogramOptions.position.label === 'Under Graph' ? 5 : 1
    const showLegend = options.flowHistogramOptions.showLegend
    const legendPosition = options.flowHistogramOptions.position.value

    const yaxis = {
        mode: 'categories',
        tickLength: 0,
        ticks: stacked ? processedData.stackedData?.ticks : processedData.separateData?.ticks,
        autoscaleMargin: 0.02,
    } as jquery.flot.axisOptions

    const configOptions = {
        legend: {
            show: showLegend,
            container: container || undefined,
            position: legendPosition,
            backgroundOpacity: 0,
            noColumns: noColumns,
            labelFormatter: (label, series) => { return '<a style="margin:3px" >' + label + '</a>'; }
        },
        series: {
            bars: {
                align: "center",
                barWidth: 0.6,
                fill: 0.8,
                horizontal: horizontal,
                lineWidth: 1,
                show: true,
            },
            stack: stacked,
        },
        grid: {
            borderWidth: 0,
        },
        xaxis: horizontal ? {} : yaxis,
        yaxis: horizontal ? yaxis : {}
    } as jquery.flot.plotOptions

    return configOptions
}

export const getLabeledValues = (data: PanelData, options: { flowHistogramOptions: FlowHistogramOptionsProps }): FlowPanelDataProcessed => {
  // There should be just one data series in this case, since this works together with the asTableSummary function
  if (data?.series?.length !== 1) {
    throw new Error('Only one query is permitted in this panel')
  }

  const sd: DataFrame = data.series[0]
  const metric = sd && sd.meta && sd.meta.custom ? sd.meta.custom['metric'] : undefined

  if (!metric) {
    return {} as FlowPanelDataProcessed
  }

  const stacked = options.flowHistogramOptions.mode.label === 'Stacked'
  const horizontal = options.flowHistogramOptions.direction.label === 'Horizontal'
  const rate = options.flowHistogramOptions.display.label === 'Rate'
  const toBits = sd.meta?.custom?.['toBits'] ? true : false
  const inLabel = toBits ? 'Bits In' : 'Bytes In'
  const outLabel = toBits ? 'Bits Out' : 'Bytes Out'
  const inByData: any[] = getSeriesMetricValues(sd.fields, inLabel)
  const outByData: any[] = getSeriesMetricValues(sd.fields, outLabel)

  let inResult: any[] = []  // [bytes, metric]
  let outResult: any[] = [] // [bytes, metric]
  let stackedResult: any[] = []

  const { metricLabels, labelFunction } = getMetricLabelsAndLabelFunction(metric, sd)
  const indexedMetricLabels = getIndexedMetricLabels(metricLabels, labelFunction, stacked)
  const timeRangeInSeconds = data.timeRange.to.diff(data.timeRange.from, 'seconds')
  const unitInfo: FlowPanelUnitInfo = UnitInfo(options, data?.series)

  // reformat the data based on whether the plot is in Separated or Stacked mode, and
  // whether the histogram bar orientation is vertical or horizontal
  if (!stacked) {
    inResult = getSeparatedResultData(inByData, indexedMetricLabels, horizontal, unitInfo, rate, timeRangeInSeconds)
    outResult = getSeparatedResultData(outByData, indexedMetricLabels, horizontal, unitInfo, rate, timeRangeInSeconds)
  } else {
    stackedResult = getStackedResultData(indexedMetricLabels, inByData, outByData, horizontal, unitInfo, rate, timeRangeInSeconds)
  }

  const labeledValues = {
    separateData: {
      inByLabel: inResult,
      outByLabel: outResult,
      ticks: indexedMetricLabels
    },
    stackedData: {
      metricsByLabel: stackedResult,
      ticks: [[FlowDataDirection.dataIn.value, FlowDataDirection.dataIn.label], [FlowDataDirection.dataOut.value, FlowDataDirection.dataOut.label]]
    }
  }

  return labeledValues
}

const getMetricLabelsAndLabelFunction = (metric: string, frame: DataFrame) => {
  let metricLabels: any[] = []
  let labelFunction: LabelFunction = name => name

  switch (metric) {
    case 'Applications':
      metricLabels = getSeriesMetricValues(frame.fields, 'Application')
      break
    case 'Hosts':
      metricLabels = getSeriesMetricValues(frame.fields, 'Host')
      break
    case 'Conversations':
      metricLabels = getSeriesMetricValues(frame.fields, 'Application')
      const sourceLabels = getSeriesMetricValues(frame.fields, 'Source')
      const destLabels = getSeriesMetricValues(frame.fields, 'Dest.')

      labelFunction = (name: string, idx: number) => {
        return sourceLabels[idx] + ' <-> ' + destLabels[idx] + ' [' + (name ? name : 'Unknown') + ']'
      }
      break
  }

  return {
    metricLabels,
    labelFunction
  }
}

/**
 * Returns and array of [index, label] 
 * where index is the record position in the original data and the label to be displayed in the graph
 */
export const getIndexedMetricLabels = (metricLabels: any[], labelFunction: LabelFunction, stacked: boolean) => {
    return metricLabels.map((label, idx) => [idx, labelFunction(label, idx)])
}

/**
 * Gets the final data formatted (in 'Separated' mode) to be passed into the plot function
 * based on graph direction (vertical, horizontal)
 */
export const getSeparatedResultData = (data: any[], indexedLabels: any[], horizontal: boolean, unitInfo: FlowPanelUnitInfo, rate: boolean, timeRangeInSeconds: number) => {
    const divisor = rate ? unitInfo.divisor * timeRangeInSeconds : unitInfo.divisor

    return indexedLabels.map((il) => {
        const index = il[DataPosition.indexLabel.index]
        const value = data[index] / divisor
        return horizontal ? [value, index] : [index, value]
    })
}

/**
 * Gets the final data formatted (in 'Stacked' mode) to be passed into the plot function
 * based on graph direction (vertical, horizontal)
 */
export const getStackedResultData = (indexedMetricLabels: any[], inByData: any[], outByData: any[], horizontal: boolean, unitInfo: FlowPanelUnitInfo, rate: boolean, timeRangeInSeconds: number): any[] => {
    const divisor = rate ? unitInfo.divisor * timeRangeInSeconds : unitInfo.divisor

    return indexedMetricLabels.map((imLabel) => {
        const index = imLabel[DataPosition.indexLabel.index]
        const label = imLabel[DataPosition.indexLabel.label]
        const inData = inByData[index] / divisor
        const outData = outByData[index] / divisor

        return horizontal ?
            { label: label, data: [[inData, FlowDataDirection.dataIn.value], [outData, FlowDataDirection.dataOut.value]] } :
            { label: label, data: [[FlowDataDirection.dataIn.value, inData], [FlowDataDirection.dataOut.value, outData]] }
    })
}

export const getSeriesMetricValues = (fields: any[], name: string) => {
    const match = fields.find(f => f.name === name)

    return match?.values?.toArray() || []
}

export const setLegend = (options: { flowHistogramOptions: FlowHistogramOptionsProps }) => {
    if (options.flowHistogramOptions.showLegend) {
        const className = options.flowHistogramOptions.position.label === 'Under Graph' ? '.flow-histogram-legend-bottom' : '.flow-histogram-legend-right'
        const legend = $('.legend')

        if (legend && legend.html()) {
            $(className).html('')
            $(className).append(legend.html())
            legend.remove()
        }
    }
}

export const validateFlowHistogramPanelData = (dataSeries: DataFrame[]) => {
    if (!dataSeries || dataSeries.length < 1) {
        // uncomment to debug locally. do not include console statements in the final code
        // console.log('No data, check the datasource is flow-datasource and function asSummaryTable are selected')
        return false
    }

    const series = dataSeries[0]

    if (!series.meta || !series.meta?.custom) {
        // uncomment to debug locally. do not include console statements in the final code
        // console.log('Incorrect or incomplete data, check the datasource is flow-datasource and function asSummaryTable are selected')
        return false
    }

    return true
}

export const getStyleFor = (element: FlowHistogramElement, height: number, width: number, options: { flowHistogramOptions: FlowHistogramOptionsProps }): CSSProperties => {
    const isUnderGraph = options.flowHistogramOptions.position.label === 'Under Graph'
    const showLegend = options.flowHistogramOptions.showLegend

    switch (element) {
        case FlowHistogramElement.Container:
            return {
                display: showLegend && isUnderGraph ? 'block' : 'inline-block',
                float: showLegend && isUnderGraph ? 'none' : 'left'
            }
        case FlowHistogramElement.Legend:
            const widthOffset = options.flowHistogramOptions.direction.label === 'Horizontal' ? 0 : 25
            const blockValue = isUnderGraph ? 'block' : 'inline-block'
            return {
                display: showLegend ? blockValue : 'none',
                width: isUnderGraph ? width : (width * 0.2) - widthOffset,
                height: isUnderGraph ? options.flowHistogramOptions.height : height,
                float: isUnderGraph ? 'none' : 'left'
            }
        case FlowHistogramElement.ContainerGraph:
            const heightOffset = (showLegend && isUnderGraph) ? options.flowHistogramOptions.height : 0

            return {
                width: !showLegend || isUnderGraph ? width : width * 0.8,
                height: height - 25 - heightOffset
            }
        case FlowHistogramElement.GraphAxisLabel:
            return {
                height: 25,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            }
        case FlowHistogramElement.GraphAxisLabelUnit:
            return {
                marginTop: 24 
            }
    }
}

export enum FlowHistogramElement {
    Container,
    ContainerGraph,
    GraphAxisLabel,
    GraphAxisLabelUnit,
    Legend
}
