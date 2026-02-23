import { useEffect } from 'react'
import { AlarmTableControlState } from '../AlarmTableTypes'

export const useAlarmTableRowHighlighter = (state: AlarmTableControlState, table: React.RefObject<HTMLDivElement | null>) => {

    useEffect(() => {
        const rows = table.current?.querySelectorAll('.table-body div[role="row"]')
        // if previous sibling is not clicked, or first item in entry, select-start
        // if previous sibling is clicked, and next sibling is clicked, select-continue
        // if previous sibling is clicked, and next sibling is not clicked, select-end
        if (rows) {
            rows.forEach((row, index) => {
                row.classList.remove('select-start')
                row.classList.remove('select-continue')
                row.classList.remove('select-end')
                if (!state.indexes[index - 1] && state.indexes[index]) {
                    row.classList.add('select-start')
                }
                if (state.indexes[index - 1] && state.indexes[index] && state.indexes[index + 1]) {
                    row.classList.add('select-continue')
                }
                if (state.indexes[index] && !state.indexes[index + 1]) {
                    row.classList.add('select-end')
                }
            })
        }
    })
}
