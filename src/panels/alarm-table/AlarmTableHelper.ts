import { DataFrame, Field } from '@grafana/data' 
import { AlarmTableColumnSizeItem, AlarmTableOptionsState } from './AlarmTableTypes'
import cloneDeep from 'lodash/cloneDeep'

/**
 * Find the current 0-based column index of the Alarm ID field.
 * This should be the frame after column including/exclusion and column sorting have been applied. 
 */
export const getAlarmIdColumnIndex = (frame: DataFrame) => {
  return frame.fields.findIndex(f => f.name === 'ID')
}

// given an array of row elements (divs in the Alarm Table), return the alarmIds 
// associated with the rows, in row order
// rows can be generated via something like: table.current?.querySelectorAll('.table-body div[role="row"]')
export const getAlarmIdsForRows = (rows: Element[], frame: DataFrame) => {
    return rows.map(row => getAlarmIdFromRow(row, frame))
}

/**
 * Get the Alarm ID from the table cell HTMLElement.
 */
export const getAlarmIdFromRow = (row: Element, frame: DataFrame) => {
  const columnIndex = getAlarmIdColumnIndex(frame)

  if (row && columnIndex >= 0) {
    const dataIndexCell = row?.children?.[columnIndex] || null
    const text = dataIndexCell?.textContent

    // Number('') and Number(null) are both 0, which is an integer, so a blank
    // cell would otherwise read as the invalid alarm id 0. Alarm ids start at 1.
    const alarmId = Number(text)
    return Number.isInteger(alarmId) && alarmId > 0 ? alarmId : -1
  }

  return -1
}

/**
 * Get the Alarm ID from the table cell Element.
 */
export const getAlarmIdFromCell = (cell: Element, frame: DataFrame) => {
  const row = cell.closest('[role="row"]')

  return row ? getAlarmIdFromRow(row, frame) : -1
}

// create map of column names to override width, if the Alarm Table Column Sizes option is enabled
const createColumnSizeMap = (alarmTable: AlarmTableOptionsState): Map<string, number> => {
    const columnSizeMap = new Map<string,number>()

    if (alarmTable.alarmTableColumnSizes?.active) {
        (alarmTable.alarmTableColumnSizes?.columnSizes as AlarmTableColumnSizeItem[])?.forEach(col => {
            columnSizeMap.set(col.fieldName, col.width)
        })
    }

    return columnSizeMap
}

const isAlarmDataFrame = (frame: DataFrame) => {
    const hasEntityMetadata = !!(frame.meta && (frame.meta as any).entity_metadata)
    return frame && hasEntityMetadata && frame.name && frame.name === 'alarms'
}

const addSeverityBackgroundColor = (frame: DataFrame) => {
    frame.fields.forEach((field) => {
        if (field.name === 'Severity') {
            field.config.custom = Object.assign(field.config.custom || {}, { displayMode: 'color-background' })
        }
    })
}

// Filter our columns according to our configured approved fields.
// Also, ensure that the 'ID' column is always included, as this is necessary for our action menu functionality.
const getConfiguredFields = (fields: Field[], alarmTable: AlarmTableOptionsState) => {
    return fields.filter((fil) => {
        let shouldIncludeThisField = true

        if (alarmTable?.alarmTableData) {
            shouldIncludeThisField = fil.name === 'ID' || !!alarmTable?.alarmTableData.columns?.find((col) => col.label === fil.name)
        }

        return shouldIncludeThisField
    })
}

// Sort our columns based on the user provided order
const getSortedColumns = (fields: Field[], alarmTable: AlarmTableOptionsState) => {
    return fields.sort((f1, f2) => {
        const colIndex1 = alarmTable?.alarmTableData?.columns?.findIndex((col) => col.label === f1.name)
        const colIndex2 = alarmTable?.alarmTableData?.columns?.findIndex((col) => col.label === f2.name)
        return colIndex1 - colIndex2
    })
}

const addCustomFieldData = (fields: Field[], columnSizeMap: Map<string, number>) => {
    fields.forEach((field) => {
        if (columnSizeMap.has(field.name)) {
            field.config.custom = Object.assign(field.config.custom || {}, { width: columnSizeMap.get(field.name) })
        }
    })
}

export const getFilteredProps = (frame: DataFrame, alarmTable: AlarmTableOptionsState, page: number) => {

  if (!isAlarmDataFrame(frame)) {
      return { filteredProps: frame, totalRows: 0, totalPages: 0 }
  }

  const filteredProps = cloneDeep(frame)
  const totalRows = filteredProps.fields[0].values.length
  const rowsPerPage = Number(alarmTable.alarmTablePaging?.rowsPerPage || 10)

  // map of column names to override width, if activa
  const columnSizeMap = createColumnSizeMap(alarmTable)

  // Allow background color for severity column.
  if (alarmTable?.alarmTableAlarms?.styleWithSeverity?.value === 1) {
      addSeverityBackgroundColor(filteredProps)
  } 

  // Filter our columns according to our configured approved fields.
  filteredProps.fields = getConfiguredFields(filteredProps.fields, alarmTable)

  // Make any custom column width overrides. Underlying 'react-table' will use this custom column width
  if (columnSizeMap.size) {
      addCustomFieldData(filteredProps.fields, columnSizeMap)
  }

  // Sort our columns based on the user provided order
  filteredProps.fields = getSortedColumns(filteredProps.fields, alarmTable)
  
  // start/end index of row data to display
  const start = (page - 1) * rowsPerPage
  const end = start + rowsPerPage

  // set which rows of the data we display, based on pagination
  if (rowsPerPage > 0 && totalRows > rowsPerPage) {
      // field.values is an array of rows of data to display for the given field (column)
      filteredProps.fields = filteredProps.fields.map((field: Field) => {
          const values = field.values
          const sliced = values.length > start ? values.slice(start, end) : []
          field.values = sliced

          return field
      })

      filteredProps.length = filteredProps.fields[0]?.values.length || 0
  } else {
      filteredProps.length = totalRows
  }

  return { filteredProps, totalRows, totalPages: Math.ceil(totalRows / rowsPerPage) }
}
