import { useEffect } from 'react'
import { DataFrame } from '@grafana/data'
import { AlarmTableControlState } from '../AlarmTableTypes'
import { getAlarmIdsForRows } from '../AlarmTableHelper'

export const useAlarmTableRowHighlighter = (state: AlarmTableControlState, table: React.RefObject<HTMLDivElement | null>, frame: DataFrame) => {

    useEffect(() => {
        const rows = table.current?.querySelectorAll('.table-body div[role="row"]')
        
        // if previous sibling is not clicked, or first item in entry, select-start
        // if previous sibling is clicked, and next sibling is clicked, select-continue
        // if previous sibling is clicked, and next sibling is not clicked, select-end
        if (rows) {
            const alarmIdsForRows = getAlarmIdsForRows(Array.from(rows) as Element[], frame)

            rows.forEach((row, index) => {
                row.classList.remove('select-start')
                row.classList.remove('select-continue')
                row.classList.remove('select-end')

                const previousRow = index > 0 ? rows[index - 1] : null
                const nextRow = index < rows.length - 1 ? rows[index + 1] : null

                const alarmId = alarmIdsForRows[index]
                const previousAlarmId = previousRow ? alarmIdsForRows[index - 1] : -1
                const nextAlarmId = nextRow ? alarmIdsForRows[index + 1] : -1

                const thisRowSelected = state.selectedAlarmIds.has(alarmId)

                if (thisRowSelected) {
                    const previousRowSelected = previousAlarmId > 0 && state.selectedAlarmIds.has(previousAlarmId)
                    const nextRowSelected = nextAlarmId > 0 && state.selectedAlarmIds.has(nextAlarmId)

                    if (!previousRowSelected) {
                        row.classList.add('select-start')
                    } else if (previousRowSelected && nextRowSelected) {
                        row.classList.add('select-continue')
                    } else if (!nextRowSelected) {
                        row.classList.add('select-end')
                    }
                }
            })
        }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, state.selectedAlarmIds, frame])
}
