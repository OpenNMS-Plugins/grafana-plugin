import { ComboboxOption } from '@grafana/ui';
import { SelectableValue } from '@grafana/data'

export interface AlarmTableControlState {
  selectedAlarmIds: Set<number>
  lastClickedAlarmId: number
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

export interface AlarmTableOptionsState {
  alarmTableAdditional: AlarmTableAdditionalState
  alarmTableAlarms: AlarmTableAlarmDataState
  alarmTableData: AlarmTableDataState
  alarmTablePaging: AlarmTablePaginationState
  alarmTableColumnSizes?: AlarmTableColumnSizeState
}

export interface AlarmTableControlProps {
  alarmTable: AlarmTableOptionsState
}

export interface AlarmTableControlActions {
  clear: () => void
  escalate: () => void
  acknowledge: () => void
  details: () => void
}
