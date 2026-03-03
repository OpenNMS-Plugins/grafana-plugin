import { RefObject, useEffect, useRef, useState } from 'react'

export const useAlarmTableMenu = (indexes: RefObject<boolean[]>, rowClicked, series, setState) => {
    const [menu, setMenu] = useState({ x: 0, y: 0 })
    const [menuOpen, setMenuOpen] = useState(false)

    const table = useRef<HTMLDivElement>(null)

    const contextMenu = (index: number, e: MouseEvent) => {
        e.preventDefault()
        if (index >= 0) {
            rowClicked(index, e, true)
        }
        setMenu({ x: e.x, y: e.y })
        setMenuOpen(() => true)
    }

    const addClassToTableBody = () => {
        const headerGroup = table.current?.querySelector('div[role="rowgroup"] + div')
        headerGroup?.classList.add('table-body')
    }

    // user click is in a table cell, we find its parent row's index to
    // know which alarm item was clicked
    const getIndexFromCell = (cell: HTMLElement) => {
      const row = cell.parentElement
      const rows = table.current?.querySelectorAll('.table-body div[role="row"]')

      let rowIndex = -1

      if (rows && rows.length) {
        for (let i = 0; i < rows.length; i++) {
          // reference equality
          if (rows[i] === row) {
            rowIndex = i
            break
          }
        }
      }

      return rowIndex
    }

    const onTableClicked = (e: Event) => {
      const rowIndex = getIndexFromCell(e.target as HTMLElement)

      if (rowIndex >= 0) {
        rowClicked(rowIndex, e as MouseEvent, false)
      } else {
        // user clicked on table background, clear all selections
        const newIndexes = indexes.current.map(x => false)
        setState({ indexes: newIndexes, lastClicked: -1 })
      }
    }

    const onTableContextMenu = (e: Event) => {
      const rowIndex = getIndexFromCell(e.target as HTMLElement)

      if (rowIndex >= 0) {
        contextMenu(rowIndex, e as MouseEvent)
      } else if (indexes.current.length > 0 && indexes.current.some(x => x === true)) {
        contextMenu(-1, e as MouseEvent)
      }
    }

    // apply click handlers to the table, but make sure they aren't applied to the Pagination component
    useEffect(() => {
        const currentTable = table.current
        const tableWrapper = currentTable?.querySelector('div.alarm-table-wrapper')

        tableWrapper?.addEventListener('click', onTableClicked)
        tableWrapper?.addEventListener('contextmenu', onTableContextMenu)

        return () => {
          tableWrapper?.removeEventListener('click', onTableClicked)
          tableWrapper?.removeEventListener('contextmenu', onTableContextMenu)
        }

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [table.current])

    useEffect(() => {
        addClassToTableBody()
    }, [menu, menuOpen, rowClicked, series])

    return { table, menu, menuOpen, setMenu, setMenuOpen }
}
