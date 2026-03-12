import { useRef } from 'react'
import { colors } from '@grafana/ui'
import { AcknowledgedAlarms, AlarmDirections, AlarmGroups, AlarmSeverity } from './constants'

export const useAlarmHooks = () => {
    const ref: any = useRef(undefined)

    const getPlotDataPoint = (direction, data, index) => {
        return direction === AlarmDirections.Horizontal.value ? [data, index] : [index, data]
    }

    const getAcknowledgedData = (direction, data) => {
        const seriesKey = 'Acked By'
        const seriesData = [
            getSeriesValueCount(seriesKey, AcknowledgedAlarms.Outstanding.value, data),
            getSeriesValueCount(seriesKey, AcknowledgedAlarms.Acknowledged.value, data, true)
        ]
        return [
            { data: [getPlotDataPoint(direction, seriesData[0], AcknowledgedAlarms.Outstanding.index)], color: colors[0] },
            { data: [getPlotDataPoint(direction, seriesData[1], AcknowledgedAlarms.Acknowledged.index)], color: colors[4] },
        ];
    }

    const getSeriesValues = (fieldKey: string, data) => {
        return data.series.map((serie) => {
            return serie.fields.find((field) => field.name === fieldKey)?.values.toArray()
        })
    }

    const getSeriesValueCount = (fieldKey, resultKey, data, countPositive = false) => {
        const seriesValues: any = getSeriesValues(fieldKey, data);
        let count = 0;
        for (let entries of seriesValues) {
            if (entries) {

                for (let entry of entries) {
                    if (entry === resultKey || (countPositive && entry)) {
                        count += 1;
                    }
                }
            }
        }
        return count;
    }

    const getSeverityData = (direction, data) => {
        const seriesKey = 'Severity'

        const seriesData = [
            getSeriesValueCount(seriesKey, AlarmSeverity.CLEARED.value, data),
            getSeriesValueCount(seriesKey, AlarmSeverity.NORMAL.value, data),
            getSeriesValueCount(seriesKey, AlarmSeverity.INDETERMINATE.value, data),
            getSeriesValueCount(seriesKey, AlarmSeverity.WARNING.value, data),
            getSeriesValueCount(seriesKey, AlarmSeverity.MINOR.value, data),
            getSeriesValueCount(seriesKey, AlarmSeverity.MAJOR.value, data),
            getSeriesValueCount(seriesKey, AlarmSeverity.CRITICAL.value, data),
        ]
        return [
            { data: [getPlotDataPoint(direction, seriesData[0], AlarmSeverity.CLEARED.index)], color: "#EEE000" },
            { data: [getPlotDataPoint(direction, seriesData[1], AlarmSeverity.NORMAL.index)], color: '#86B15B' },
            { data: [getPlotDataPoint(direction, seriesData[2], AlarmSeverity.INDETERMINATE.index)], color: '#990000' },
            { data: [getPlotDataPoint(direction, seriesData[3], AlarmSeverity.WARNING.index)], color: '#FCCC3B' },
            { data: [getPlotDataPoint(direction, seriesData[4], AlarmSeverity.MINOR.index)], color: '#EE901C' },
            { data: [getPlotDataPoint(direction, seriesData[5], AlarmSeverity.MAJOR.index)], color: '#E3692F' },
            { data: [getPlotDataPoint(direction, seriesData[6], AlarmSeverity.CRITICAL.index)], color: '#DB4345' },
        ];
    }

    const getSeverityTicks = () => {
        return [
            [AlarmSeverity.CLEARED.index, AlarmSeverity.CLEARED.label],
            [AlarmSeverity.NORMAL.index, AlarmSeverity.NORMAL.label],
            [AlarmSeverity.INDETERMINATE.index, AlarmSeverity.INDETERMINATE.label],
            [AlarmSeverity.WARNING.index, AlarmSeverity.WARNING.label],
            [AlarmSeverity.MINOR.index, AlarmSeverity.MINOR.label],
            [AlarmSeverity.MAJOR.index, AlarmSeverity.MAJOR.label],
            [AlarmSeverity.CRITICAL.index, AlarmSeverity.CRITICAL.label],
        ]
    }

    const getAcknowledgedTicks = () => {
        return [
            [AcknowledgedAlarms.Acknowledged.index, AcknowledgedAlarms.Acknowledged.label],
            [AcknowledgedAlarms.Outstanding.index, AcknowledgedAlarms.Outstanding.label],
        ]
    }

    const getTicks = (group) => {
        return group === AlarmGroups.Acknowledged.value ? getAcknowledgedTicks() : getSeverityTicks();
    }

    const getPlotData = (group, direction, data) => {
        return group === AlarmGroups.Acknowledged.value ? getAcknowledgedData(direction, data) : getSeverityData(direction, data);
    }

    const getPlotConfig = (group, direction) => {
        const axis = AlarmDirections.Horizontal.value === direction ? 'yaxis' : 'xaxis';
        return {
            series: {
                bars: {
                    show: true,
                    barWidth: direction === AlarmDirections.Horizontal.value ? 0.5 : 0.6,
                    align: 'center',
                    fill: 0.8,
                    lineWidth: 1.0,
                    horizontal: direction === AlarmDirections.Horizontal.value,
                }
            },
            [axis]: {
                mode: 'categories',
                tickLength: 0,
                autoscaleMargin: 0.02,
                ticks: getTicks(group)
            },
            grid: {
                borderWidth: 0,
            },
        }
    }

    return { getPlotData, getPlotConfig, ref }
}
