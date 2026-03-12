import { DataFrame, Field, FieldType } from '@grafana/data'
import { formatFunctions } from 'lib/function_formatter'
import { OnmsMeasurementsQueryMetadata, OnmsMeasurementsQueryResponse, OnmsMeasurementsQueryResponseColumnItem } from './types'

/**
 * Get 'windowed' timestamps that are between start/end range.
 * @param timestamps an array of timestamp values
 * @param start a starting timestamp for the window, or 0 to start at the beginning
 * @param end an ending timestamp for the window, or 0 to not limit the end of the window range
 */
const getWindowedTimestamps = (timestamps: number[], start: number, end: number) => {
    if (start === 0 && end === 0) {
        return {
            windowedTimestamps: [...timestamps],
            startIndex: 0,
            endIndex: timestamps.length - 1
        }
    }

    const windowedTimestamps = [] as number[]
    let startIndex = -1
    let endIndex = timestamps.length - 1

    for (let i = 0; i < timestamps.length; i++) {
        const tsVal = timestamps[i]

        if (end > 0 && tsVal > end) {
            endIndex = i - 1
            break
        }

        if (start === 0 || tsVal >= start) {
            if (startIndex < 0) {
                startIndex = i
            }
            windowedTimestamps.push(tsVal)
        }
    }

    return {
        windowedTimestamps,
        startIndex,
        endIndex
    }
}

/**
 * Convert QueryResponse data returned by OpenNMS Measurements Rest API to Grafana DataFrame format.
 */
export const measurementResponseToDataFrame = (measurementData: OnmsMeasurementsQueryResponse): DataFrame[] => {
  const { start, end, labels, columns, timestamps, metadata } = measurementData
  const dataFrames: DataFrame[] = []
  let dataFrame: DataFrame = getEmptyDataFrame()

  if (!timestamps || !timestamps.length) {
    dataFrames.push(dataFrame)
  } else {
    const { windowedTimestamps, startIndex, endIndex } = getWindowedTimestamps(timestamps, start, end)

    // no data or no data within the start/end timespan, return an empty DataFrame
    if (windowedTimestamps.length === 0) {
      dataFrames.push(dataFrame)
    } else {
      for (let i = 0; i < labels?.length; i++) {
        const column = columns?.length ? columns[i] : null

        dataFrame = measurementColumnToDataFrame (windowedTimestamps, startIndex, endIndex, metadata, labels[i], column)
        dataFrames.push(dataFrame)
      }
    }
  }

  return dataFrames
}

/**
 * Convert QueryResponse data for one column returned by OpenNMS Measurements Rest API to Grafana DataFrame format.
 */
const measurementColumnToDataFrame = (
    windowedTimestamps: number[],
    startIndex: number,
    endIndex: number,
    metadata: OnmsMeasurementsQueryMetadata,
    label: string,
    column: OnmsMeasurementsQueryResponseColumnItem | null
  ): DataFrame => {
  const dataFrame = getEmptyDataFrame()

  dataFrame.length = windowedTimestamps.length

  dataFrame.fields.push({
    name: 'Time',
    type: FieldType.time,
    config: {},
    values: windowedTimestamps
  } as Field)

  const formattedLabel = metadata?.resources ? formatFunctions(label, metadata) : label

  if (column) {
    // Only use values within the timestamp window
    // Replace any literal 'NaN' values with null
    const windowedValues = column.values.slice(startIndex, endIndex + 1).map(v => v === 'NaN' ? null : v)

    const field = {
      name: formattedLabel || 'Value',
      type: FieldType.number, // will be a number, a string representing a number or else null
      config: {},
      values: windowedValues
    } as Field

    dataFrame.fields.push(field)
  }

  return dataFrame
}

const getEmptyDataFrame = (): DataFrame => {
    return {
        name: '',
        length: 0,
        fields: [] as Field[]
    }
}

export const getStringProperties = (resource: { id?: string, label?: string, stringPropertyAttributes?: Record<string, string> }) => {
    let stringProperties: Array<{ label: string, value: string }> = []
    if (resource?.stringPropertyAttributes) {
        stringProperties = Object.entries(resource?.stringPropertyAttributes).map(([key, item]) => {
            return { label: key, value: key }
        })
    }
    return stringProperties
}
