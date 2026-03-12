import React, { useEffect, useRef } from 'react'
import { PanelProps } from '@grafana/data'
import { UnitInfo } from './FlowHistogramConstants'
import {
    FlowHistogramElement,
    getFlowHistogramPlotConfig,
    getFlowHistogramPlotData,
    getLabeledValues,
    getStyleFor,
    setLegend,
    validateFlowHistogramPanelData
} from './FlowHistogramHelpers'
import { FlowHistogramOptionsProps } from './FlowHistogramTypes'

interface FlowHistogramControlOptions { flowHistogramOptions: FlowHistogramOptionsProps }
interface Props extends PanelProps<FlowHistogramControlOptions> { }

export const FlowHistogramControl: React.FC<Props> = ({ data, height, width, options }) => {
    const ref: any = useRef(undefined)

    useEffect(() => {
        if (validateFlowHistogramPanelData(data?.series)) {
          const processedData = getLabeledValues(data, options)
          const plotData = getFlowHistogramPlotData(processedData, options)
          const plotConfig = getFlowHistogramPlotConfig(processedData, options)

          $.plot(ref.current, plotData, plotConfig)

          // TODO: remove this fix once flot library is updated in grafana. Use container option in plotConfig instead
          setLegend(options)
        }
    }, [data, width, height, ref, options])

    return (
        <>
            <style>
                {
                    `
                   .side-spot {
                        margin-left: 25px;
                        position: relative;
                    }                                     
                    .side-spot .side-spot-label {
                        transform: rotate(-90deg) translateY(-50%);
                        transform-origin: center;
                        top: 42%;
                        position: absolute;
                        width: 0;
                    }
                    .legendColorBox {
                        padding-right: 3px;
                    }
                    .legendLabel {
                        color: rgb(204, 204, 220);
                    }
                    .side-spot table {
                        height: ${options.flowHistogramOptions.height}px;
                    }
                    .flow-histogram-legend-right table {
                        margin: 0 auto;
                    }
                `
                }
            </style>
            <div>
                <div className={options.flowHistogramOptions.direction.label === 'Horizontal' ? '' : 'side-spot'}
                    style={getStyleFor(FlowHistogramElement.Container, height, width, options)}>
                    <div ref={ref} style={getStyleFor(FlowHistogramElement.ContainerGraph, height, width, options)} />
                    <div className='side-spot-label' style={getStyleFor(FlowHistogramElement.GraphAxisLabel, height, width, options)}>
                        <p style={getStyleFor(FlowHistogramElement.GraphAxisLabelUnit, height, width, options)}>{UnitInfo(options, data?.series).units}</p>
                    </div>
                </div>
                <div className={(options.flowHistogramOptions.position.label === 'Under Graph' ? 'flow-histogram-legend-bottom' : 'flow-histogram-legend-right')}
                    style={getStyleFor(FlowHistogramElement.Legend, height, width, options)} />
            </div>
        </>
    )
}
