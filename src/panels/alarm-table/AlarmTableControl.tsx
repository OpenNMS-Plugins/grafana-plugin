import React, { useEffect, useRef } from 'react'
import { AppEvents, PanelProps } from '@grafana/data'
import { getAppEvents } from '@grafana/runtime'
import { Button, ContextMenu, Modal, Pagination, Tab, TabContent, Table, TabsBar } from '@grafana/ui'
import { AlarmTableMenu } from './AlarmTableMenu'
import { AlarmTableModalContent } from './modal/AlarmTableModalContent'
import { AlarmTableSelectionStyles } from './AlarmTableSelectionStyles'
import { AlarmTableControlProps } from './AlarmTableTypes'
import { useAlarmProperties } from './hooks/useAlarmProperties'
import { useAlarmTableMenuActions } from './hooks/useAlarmTableMenuActions'
import { useAlarmTableConfigDefaults } from './hooks/useAlarmTableConfigDefaults'
import { useAlarmTableMenu } from './hooks/useAlarmTableMenu'
import { useAlarmTableRowHighlighter } from './hooks/useAlarmTableRowHighlighter'
import { useAlarmTableSelection } from './hooks/useAlarmTableSelection'
import { useAlarmTableModalTabs } from './hooks/useAlarmTableModalTabs'
import { useOpenNMSClient } from '../../hooks/useOpenNMSClient'
import { useAlarm } from './hooks/useAlarm'
import { capitalize } from 'lib/utils'

export const AlarmTableControl: React.FC<PanelProps<AlarmTableControlProps>> = (props) => {
    const alarmIndexes = useRef<boolean[]>([] as boolean[])

    const { state, setState, rowClicked, soloIndex } = useAlarmTableSelection(() => {
        setDetailsModal(true)
    })

    const { client } = useOpenNMSClient(props.data?.request?.targets?.[0]?.datasource)
    const { filteredProps, page, setPage, totalPages } = useAlarmProperties(props?.data?.series[0], props?.options?.alarmTable)
    const { table, menu, menuOpen, setMenuOpen } = useAlarmTableMenu(alarmIndexes, rowClicked, filteredProps, setState)

    const { actions, detailsModal, setDetailsModal } = useAlarmTableMenuActions(
      state.indexes,
      props?.data?.series?.[0]?.fields || [],
      () => setMenuOpen(false),
      (actionName: string, results: any[]) => displayActionNotice(actionName, results),
      props?.options?.alarmTable?.alarmTableAdditional?.useGrafanaUser ?? false,
      client)    

    const { tabActive, tabClick, resetTabs } = useAlarmTableModalTabs()
    const { alarm, goToAlarm, alarmQuery } = useAlarm(props?.data?.series, soloIndex, client)

    const paginationRef = useRef<HTMLDivElement>(null)

    useAlarmTableRowHighlighter(state, table)
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

    useEffect(() => {
      alarmIndexes.current = state.indexes
    }, [state])

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
                  {alarmQuery ? <Table data={filteredProps} width={props.width} height={props.height - calcPaginationHeight()} /> :
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
                  renderMenuItems={() => <AlarmTableMenu state={state} actions={actions} />}
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
