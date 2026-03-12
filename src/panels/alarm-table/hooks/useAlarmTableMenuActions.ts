import { useState, useEffect } from 'react'
import { getBackendSrv } from '@grafana/runtime'
import { ClientDelegate } from 'lib/client_delegate'

/**
 * Hooks for the Alarm Table Panel action menu.
 *
 * @param selectedAlarmIds Selection state of alarms, based on alarm ids
 * @param closeMenu Function from the calling component to close the action menu.
 * @param actionCallback A callback to perform after an action; currently used to display a notice to the user.
 * @param useGrafanaUser If true, use the current Grafana user for the API call; this username will be saved in the 
 *   OpenNMS database as the user who performed the action.
 *   Otherwise uses the user configured in the Entity datasource.
 * @param client ClientDelegate for API calls.
 * @returns 
 */
export const useAlarmTableMenuActions = (
  selectedAlarmIds: Set<number>,
  closeMenu: () => void,
  actionCallback: (actionName: string, results: any[]) => void | null,
  useGrafanaUser: boolean,
  client: ClientDelegate | undefined) => {

  const [detailsModal, setDetailsModal] = useState(false)
  // 'id' is the Grafana user id, this doesn't correlate to anything in OpenNMS
  // 'login' should match OpenNMS username
  const [user, setUser] = useState<{ id: string, login: string }>()

  useEffect(() => {
    const getUserFromGrafana = async () => {
      if (useGrafanaUser) {
        // Grafana 'Get Actual User' API to get current user
        const apiUser = await getBackendSrv().get('/api/user')
        setUser(apiUser)
      } else {
        // unset user to use the user configured in the Entity datasource  
        setUser(undefined)
      }
    }

    getUserFromGrafana()
  }, [useGrafanaUser])

  const loopAction = async (action: (alarmId: number) => Promise<any>) => {
    const alarmIds = Array.from(selectedAlarmIds)

    const settled = await Promise.allSettled(
      alarmIds.map(alarmId => action(alarmId))
    )

    // result will be undefined for success, a GrafanaError object on failure (see opennms-js)
    return settled.map(r => r.status === 'fulfilled' ? r.value : r.reason)
  }

  const clear = async () => {
    const results = await loopAction(async alarmId => client?.doClear(alarmId, user?.login))

    if (actionCallback) {
      actionCallback('clear', results)
    }

    closeMenu()
  }

  const details = () => {
    closeMenu()
    setDetailsModal(true)
  }

  const escalate = async () => {
    const results = await loopAction(async alarmId => client?.doEscalate(alarmId, user?.login))
    
    if (actionCallback) {
      actionCallback('escalate', results)
    }

    closeMenu()
  }

  const acknowledge = async () => {
    const results = await loopAction(async alarmId => client?.doAck(alarmId, user?.login))

    if (actionCallback) {
      actionCallback('acknowledge', results)
    }

    closeMenu()
  }

  return { actions: { clear, details, escalate, acknowledge }, detailsModal, setDetailsModal }
}
