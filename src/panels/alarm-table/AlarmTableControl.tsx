import React, { useEffect, useRef, useState } from 'react'
import { AppEvents, DataFrame, PanelProps } from '@grafana/data'
import { getAppEvents } from '@grafana/runtime'
import { Button, ContextMenu, Modal, Pagination, Tab, TabContent, Table, TabsBar } from '@grafana/ui'
import { AlarmTableMenu } from './AlarmTableMenu'
import { AlarmTableModalContent } from './modal/AlarmTableModalContent'
import { AlarmTableSelectionStyles } from './AlarmTableSelectionStyles'
import { AlarmTableControlProps } from './AlarmTableTypes'
import { getAlarmIdFromCell, getFilteredProps } from './AlarmTableHelper'
import { useAlarmTableMenuActions } from './hooks/useAlarmTableMenuActions'
import { useAlarmTableConfigDefaults } from './hooks/useAlarmTableConfigDefaults'
import { useAlarmTableRowHighlighter } from './hooks/useAlarmTableRowHighlighter'
import { useAlarmTableSelection } from './hooks/useAlarmTableSelection'
import { useAlarmTableModalTabs } from './hooks/useAlarmTableModalTabs'
import { useOpenNMSClient } from '../../hooks/useOpenNMSClient'
import { useAlarm } from './hooks/useAlarm'
import { capitalize } from 'lib/utils'

export const AlarmTableControl: React.FC<PanelProps<AlarmTableControlProps>> = (props) => {
    const selectedAlarmIds = useRef<Set<number>>(new Set<number>())

    const { client } = useOpenNMSClient(props.data?.request?.targets?.[0]?.datasource)
    const [filteredPropState, setFilteredPropState] = useState({ fields: [], length: 0} as DataFrame)
    const filteredPropsRef = useRef<DataFrame>({ fields: [], length: 0 } as DataFrame)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(0)

    const table = useRef<HTMLDivElement>(null)
    const [menu, setMenu] = useState({ x: 0, y: 0 })
    const [menuOpen, setMenuOpen] = useState(false)

    const { alarmControlState, setAlarmControlState, rowClicked, soloAlarmId } = useAlarmTableSelection(() => { setDetailsModal(true) })

    const { actions, detailsModal, setDetailsModal } = useAlarmTableMenuActions(
      alarmControlState.selectedAlarmIds,
      () => setMenuOpen(false),
      (actionName: string, results: any[]) => displayActionNotice(actionName, results),
      props?.options?.alarmTable?.alarmTableAdditional?.useGrafanaUser ?? false,
      client)    

    const { tabActive, tabClick, resetTabs } = useAlarmTableModalTabs()
    const { alarm, goToAlarm, alarmQuery } = useAlarm(props?.data?.series, soloAlarmId, client)

    const paginationRef = useRef<HTMLDivElement>(null)

    useAlarmTableRowHighlighter(alarmControlState, table, filteredPropState)
    useAlarmTableConfigDefaults(props.fieldConfig, props.onFieldConfigChange, props.options)

    /**
     * Callback when an action menu item is clicked to display a message.
     * Grafana does not offer a clear way to refresh the panel programmatically, so we inform the user
     * they must do so.
     */
    const displayActionNotice = (actionName: string, results: any[]) => {
      if (props?.options?.alarmTable.alarmTableAdditional.displayActionNotice) {
        const numErrors = results.filter(r => r?.status === 'error').reduce((acc: number, result) => acc + 1, 0)

        const appEvents = getAppEvents()
        const capitalAction = capitalize(actionName)

        if (!numErrors) {
          appEvents.publish({
            type: AppEvents.alertSuccess.name,
            payload: [`Alarm ${capitalAction} was successful. You may need to refresh the panel for the updated status to display.`]
          })
        } else {
          const message = numErrors === 1 ? `Error processing alarm ${capitalAction}` : `There were ${numErrors} errors processing alarm ${capitalAction}`

          appEvents.publish({
            type: AppEvents.alertError.name,
            payload: [message]
          })
        }
      }
    }

    const getFontSize = () => {
      const fontSize = props.options?.alarmTable?.alarmTablePaging?.fontSize?.value
      return fontSize ? `font-size-${fontSize}` : ''
    }

    // this is subtracted from the Table height to ensure there's enough room for the Pagination control
    const calcPaginationHeight = () => {
      const paginationHeight = paginationRef.current?.firstElementChild?.clientHeight || 0
      const scrollHeight = props.options?.alarmTable?.alarmTablePaging?.scroll ? 8 : 0

      return paginationHeight + scrollHeight
    }

    const contextMenu = (alarmId: number, e: MouseEvent) => {
        e.preventDefault()

        // get the visible row elements
        const rows = table.current?.querySelectorAll('.table-body div[role="row"]')

        if (table.current && alarmId >= 0) {
            rowClicked(table.current, alarmId, e, rows ? Array.from(rows) : [] as Element[], filteredPropsRef.current, true)
        }

        setMenu({ x: e.x, y: e.y })
        setMenuOpen(() => true)
    }

    const addClassToTableBody = () => {
        const headerGroup = table.current?.querySelector('div[role="rowgroup"] + div')
        headerGroup?.classList.add('table-body')
    }

    const onTableClicked = (e: Event) => {
      const alarmId = getAlarmIdFromCell(e.target as HTMLElement, filteredPropsRef.current)

      if (table.current && alarmId > 0) {
        // user clicked on a row, toggle selection
        const rows = table?.current?.querySelectorAll('.table-body div[role="row"]')
        rowClicked(table.current, alarmId, e as MouseEvent, rows ? Array.from(rows) : [] as Element[], filteredPropsRef.current, false)
      } else {
        // user clicked on table background, clear all selections
        setAlarmControlState({ selectedAlarmIds: new Set<number>(), lastClickedAlarmId: alarmId })
      }
    }

    // User made a context-click (usually a right-click)
    const onTableContextMenu = (e: Event) => {
      const alarmId = getAlarmIdFromCell(e.target as HTMLElement, filteredPropsRef.current)

      if (alarmId > 0) {
        // user context-clicked a row, toggle selection for that row, then launch context menu
        contextMenu(alarmId, e as MouseEvent)
      } else if (selectedAlarmIds.current.size > 0) {
        // user context-clicked but not in a row, but there are rows selected, so launch context menu
        contextMenu(0, e as MouseEvent)
      }
    }

    const refreshFilteredProps = () => {
      if (props?.data?.series?.[0]) {
        const result = getFilteredProps(props?.data?.series?.[0], props?.options?.alarmTable, page)

        if (result) {
          setFilteredPropState(result.filteredProps)
          setTotalPages(result.totalPages)
        }
      }
    }

    useEffect(() => {
      refreshFilteredProps()

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props, props.data, props.options, page])

    useEffect(() => {
      selectedAlarmIds.current = new Set(alarmControlState.selectedAlarmIds)
    }, [alarmControlState, alarmControlState.selectedAlarmIds])

    useEffect(() => {
      filteredPropsRef.current = filteredPropState
    }, [filteredPropState])

    useEffect(() => {
      const scrollView = document.querySelector('.scrollbar-view') as HTMLElement | null
      if (props.options?.alarmTable?.alarmTablePaging?.scroll) {
        scrollView?.classList.remove('no-scroll')
      } else {
        scrollView?.classList.add('no-scroll')
      }
    }, [props.options?.alarmTable?.alarmTablePaging?.scroll])

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
    }, [table?.current])

    useEffect(() => {
        addClassToTableBody()
    }, [menu, menuOpen, rowClicked, filteredPropState])

    return (
        <div className={
            `
            alarm-table-control-wrapper
            ${alarmQuery ? 'alarm-query' : 'non-alarm-query'}
            `
        }>
          <div ref={table} className={
              `
              alarm-table-top-wrapper
              ${props.options?.alarmTable?.alarmTablePaging?.scroll ? 'scroll' : 'no-scroll'}
              ${getFontSize()}
              `
          }>
              <AlarmTableSelectionStyles />
              <div className='alarm-table-wrapper'>
                  {alarmQuery ? <Table data={filteredPropState} width={props.width} height={props.height - calcPaginationHeight()} /> :
                      <div>Select the Entity Datasource below, and choose an Alarm query to see results.</div>
                  }
              </div>
              {menuOpen && <ContextMenu
                  x={menu.x}
                  y={menu.y}
                  onClose={() => {
                      resetTabs();
                      setMenuOpen(false);
                  }}
                  renderMenuItems={() => <AlarmTableMenu state={alarmControlState} actions={actions} />}
              />}
              <Modal isOpen={detailsModal} title='Alarm Detail' onDismiss={() => setDetailsModal(false)}>
                  <Button style={{ marginBottom: 12 }} onClick={goToAlarm}><i className='fa fa-external-link'></i>&nbsp;Full Details</Button>
                  <TabsBar>
                      <Tab label='Overview' active={tabActive === 0} onChangeTab={() => tabClick(0)} />
                      <Tab label='Memos' active={tabActive === 1} onChangeTab={() => tabClick(1)} />
                      <Tab label='JSON' active={tabActive === 2} onChangeTab={() => tabClick(2)} />
                  </TabsBar>
                  <TabContent>
                      <AlarmTableModalContent tab={tabActive} alarm={alarm} client={client} />
                  </TabContent>
              </Modal>
          </div>
          <div className='alarm-table-pagination-wrapper'>
              <div ref={paginationRef}>
                  <Pagination
                      numberOfPages={totalPages === Infinity ? 0 : totalPages}
                      currentPage={page}
                      onNavigate={(b) => { setPage(b) }}
                      hideWhenSinglePage={true}
                  />
              </div>
          </div>
        </div>
    )
}
