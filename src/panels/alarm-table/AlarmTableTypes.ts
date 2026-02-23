import { ComboboxOption } from '@grafana/ui';
import { SelectableValue } from '@grafana/data'

export interface AlarmTableControlState {
  indexes: boolean[]
  lastClicked: number
}

export interface AlarmTableAdditionalState {
  displayActionNotice: boolean
  useGrafanaUser: boolean
}

export interface AlarmTableAlarmDataState {
  styleWithSeverity?: ComboboxOption<string | number>
  severityTheme?: ComboboxOption<string | number>
}

export interface AlarmTableDataState {
  transformType?: SelectableValue<string | number>
  columns: Array<SelectableValue<string | number>>
}

export interface AlarmTablePaginationState {
  rowsPerPage?: number
  pauseRefresh: boolean
  scroll: boolean
  fontSize?: ComboboxOption<string | number>
}

export interface AlarmTableColumnSizeItem {
  fieldName: string
  width: number
}

export interface AlarmTableColumnSizeState {
  active: boolean
  columnSizes: AlarmTableColumnSizeItem[]
}

export interface AlarmTableControlProps {
  alarmTable: {
    alarmTableAdditional: AlarmTableAdditionalState
    alarmTableAlarms: AlarmTableAlarmDataState
    alarmTableData: AlarmTableAlarmDataState
    alarmTablePaging: AlarmTablePaginationState
    alarmTableColumnSizes?: AlarmTableColumnSizeState
  }
}

export interface AlarmTableControlActions {
  clear: () => void
  escalate: () => void
  acknowledge: () => void
  details: () => void
}
