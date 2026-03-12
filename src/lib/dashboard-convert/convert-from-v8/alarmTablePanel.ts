import { onmsColorArray } from '../../../components/OnmsColors'
import { getAlarmColumns } from '../../../datasources/entity-ds/queries'
import { AlarmTableAlarmDataState, AlarmTablePaginationState } from '../../../panels/alarm-table/AlarmTableTypes'
import { alarmSeverityThemeOptions, fontSizeOptions } from '../../../panels/alarm-table/constants'

// map to alarmSeverityThemeOptions
const legacyAlarmSeverityThemes = [
    { value: 0, legacyValue: 'default' },
    { value: 1, legacyValue: 'opennms' },
    { value: 2, legacyValue: 'omi' },
    { value: 3, legacyValue: 'nnmi' },
    { value: 4, legacyValue: 'netcool' },
    { value: 5, legacyValue: 'custom' }
]

export const isLegacyAlarmTablePanel = (panel: any) => {
  return panel?.type && panel.type === 'opennms-helm-alarm-table-panel'
}

const getSeverityThemeValue = (theme: string) => {
  return legacyAlarmSeverityThemes.find(x => x.legacyValue === (theme || 'default'))?.value || 0
}

const mapAlarmColumns = (source: any) => {
  const alarmColumns = getAlarmColumns()
  const columns: any[] = []

  source.columns?.forEach(col => {
    const index = alarmColumns.findIndex(c => c.text === col.text)

    if (index >= 0 && index < alarmColumns.length) {
      const column = alarmColumns[index]

      columns.push({
        label: column.text,
        value: index 
      })
    }
  })

  return columns
}

const createOptions = (source: any) => {
  const isStyleSeverityColumn = source.severity && source.severity === 'column'
  const severityThemeValue = getSeverityThemeValue(source.theme)

  const alarmTableAlarms: AlarmTableAlarmDataState = {
    severityTheme: alarmSeverityThemeOptions.find(x => x.value === severityThemeValue),
    styleWithSeverity: {
      label: isStyleSeverityColumn ? 'Column' : 'Off',
      value: isStyleSeverityColumn ? 1 : 2
    }
  }

  const fontSizeLabel = source.fontSize || '100%'
  const fontSizeValue = fontSizeOptions.find(x => x.label === fontSizeLabel)?.value || 2

  const alarmTablePaging: AlarmTablePaginationState = {
    rowsPerPage: source.pageSize || 10,
    pauseRefresh: source.pagingPausesRefresh || false,
    scroll: true, // source.scroll - force to true
    fontSize: {
      label: fontSizeLabel,
      value: fontSizeValue
    }
  }

  const options = {
    alarmTable: {
      alarmTableAlarms,
      alarmTableData: {
        columns: mapAlarmColumns(source)
      },
      alarmTablePaging
    }
  }

  return options
}

const createSeverityValueMapping = (source: any) => {
  // For now, we assume severity value color mappings are based on one of the
  // predefined themes. May need to update to handle custom themes
  const severityThemeValue = getSeverityThemeValue(source.theme)
  const colorArrayIndex = severityThemeValue >= 0 && severityThemeValue <= 4 ? severityThemeValue : 0
  const colorArray = onmsColorArray[colorArrayIndex]

  const mapping = {
    options: {
      INDETERMINATE: {
        color: colorArray[0],
        index: 0,
        text: 'Indeterminate'
      },
      CLEARED: {
        color: colorArray[1],
        index: 1,
        text: 'Cleared'
      },
      NORMAL: {
        color: colorArray[2],
        index: 2,
        text: 'Normal'
      },
      WARNING: {
        color: colorArray[3],
        index: 3,
        text: 'Warning'
      },
      MINOR: {
        color: colorArray[4],
        index: 4,
        text: 'Minor'
      },
      MAJOR: {
        color: colorArray[5],
        index: 5,
        text: 'Major'
      },
      CRITICAL: {
        color: colorArray[6],
        index: 6,
        text: 'Critical'
      }
    },
    type: 'value'
  }

  return mapping
}

const createValueMappings = (source: any) => {
  const mappings: any[] = []

  mappings.push(createSeverityValueMapping(source))

  return mappings
}

// Does the legacy column data represent an item to be matched by a regex?
// This is if a column pattern property exists with regex slashes, and
// the pattern is different than just the column name
// Otherwise assumed to be a byName match
const isRegexMatcherOverride = (column: any) => {
  const pattern: string = column?.style?.pattern || ''

  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    const innerPattern = pattern.slice(1, pattern.length - 1)

    return innerPattern !== column.text
  }

  return false
}

const createFieldOverrides = (source: any) => {
  const fieldOverrides: any[] = []

  source.columns?.forEach(col => {
    const isRegex = isRegexMatcherOverride(col)

    const item = {
      matcher: {
        id: isRegex ? 'byRegexp' : 'byName',
        options: isRegex ? col.style.pattern : col.text
      },
      properties: [] as any[]
    }

    // override column title
    if (col.text && col.title && (col.text !== col.title)) {
      item.properties.push({
        id: 'displayName',
        value: col.title
      })
    }

    // override data type: date
    // just forcing to dateTimeAsIso for now
    if (col.style.type === 'date') {
      item.properties.push({
        id: 'unit',
        value: 'dateTimeAsIso'
      })
    }

    if (col.style.type === 'number') {
      item.properties.push({
        id: 'unit',
        value: 'none'
        // Note, setting value to 'number' results in the text 'number' after the numeric data value
        // 'none' results in "Standard options > Unit > Number"
        //value: col.unit && col.unit === 'short' ? 'short' : 'number'
      })

      if (col.style.decimals && col.style.decimals > 0) {
        item.properties.push({
          id: 'decimals',
          value: Number(col.style.decimals)
        })
      }
    }

    if (item.properties.length > 0) {
      fieldOverrides.push(item)
    }
  })

  return fieldOverrides
}

const createFieldConfig = (source: any) => {
  const config = {
    defaults: {
      color: {
        mode: 'thresholds'
      },
      mappings: createValueMappings(source),
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
      }
    },
    overrides: createFieldOverrides(source)
  }

  return config
}

export const convertLegacyAlarmTablePanel = (source: any) => {
  const panel = {
    ...source,
    fieldConfig: createFieldConfig(source),
    type: 'opennms-alarm-table-panel',
    options: createOptions(source)
  }

  // remove legacy fields that are not in new data structure
  // targets should already have been converted
  delete panel.columns
  delete panel.fontSize
  delete panel.styles
  delete panel.pageSize
  delete panel.pagingPausesRefresh
  delete panel.scroll
  delete panel.severity
  delete panel.showHeader
  delete panel.theme
  delete panel.transform

  return panel
}
