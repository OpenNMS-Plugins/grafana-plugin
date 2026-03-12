import { API } from 'opennms'
import { OnmsAlarm } from 'opennms/src/model/OnmsAlarm'
import { OnmsColumn, OnmsTableData, OnmsRow } from '../types'
import { ClientDelegate } from 'lib/client_delegate'
import { ServerMetadata } from 'opennms/src/api/ServerMetadata'
import { Client } from 'opennms/src/Client'
import { OnmsQueryResultMeta } from 'datasources/types'

const columns = Object.freeze([
    { text: 'ID', resource: 'id' },
    { text: 'Count', resource: 'count' },
    { text: 'Acked By', resource: 'ackUser' },
    { text: 'Ack Time', resource: 'alarmAckTime', featured: true },
    { text: 'UEI', resource: 'uei', featured: true },
    { text: 'Severity', resource: 'severity', featured: true },
    { text: 'Type', resource: 'type.label' },
    { text: 'Description', resource: 'description' },
    { text: 'Location', resource: 'location', featured: true },
    { text: 'Log Message', resource: 'logMessage' },
    { text: 'Reduction Key', resource: 'reductionKey', featured: true },
    { text: 'Trouble Ticket', resource: 'troubleTicket' },
    { text: 'Trouble Ticket State', resource: 'troubleTicketState.label' },
    { text: 'Node ID', resource: 'node', featured: true },
    { text: 'Node Label', resource: 'node.label', featured: true },
    { text: 'Service', resource: 'service.name', featured: true },
    { text: 'Suppressed Time', resource: 'suppressedTime' },
    { text: 'Suppressed Until', resource: 'suppressedUntil' },
    { text: 'Suppressed By', resource: 'suppressedBy' },
    { text: 'IP Address', resource: 'ipAddress', featured: true },
    { text: 'Is Acknowledged', resource: 'isAcknowledged', featured: true },
    { text: 'First Event Time', resource: 'firstEventTime' },
    { text: 'Last Event ID', resource: 'lastEvent.id' },
    { text: 'Last Event Time', resource: 'lastEvent.time' },
    { text: 'Last Event Source', resource: 'lastEvent.source' },
    { text: 'Last Event Creation Time', resource: 'lastEvent.createTime' },
    { text: 'Last Event Severity', resource: 'lastEvent.severity' },
    { text: 'Last Event Label', resource: 'lastEvent.label' },
    { text: 'Last Event Location', resource: 'lastEvent.location' },
    { text: 'Sticky ID', resource: 'sticky.id' },
    { text: 'Sticky Note', resource: 'sticky.body' },
    { text: 'Sticky Author', resource: 'sticky.author' },
    { text: 'Sticky Update Time', resource: 'sticky.updated' },
    { text: 'Sticky Creation Time', resource: 'sticky.created' },
    { text: 'Journal ID', resource: 'journal.id' },
    { text: 'Journal Note', resource: 'journal.body' },
    { text: 'Journal Author', resource: 'journal.author' },
    { text: 'Journal Update Time', resource: 'journal.updated' },
    { text: 'Journal Creation Time', resource: 'journal.created' },
    { text: 'Is Situation', resource: 'isSituation', featured: true },
    { text: 'Is In Situation', resource: 'isInSituation', featured: true, visible: false },
    { text: 'Situation Alarm Count', resource: 'situationAlarmCount', featured: true },
    { text: 'Affected Node Count', resource: 'affectedNodeCount', featured: true },
    { text: 'Managed Object Instance', resource: 'managedObjectInstance' },
    { text: 'Managed Object Type', resource: 'managedObjectType' },
    { text: 'Categories', resource: 'category', featured: true, visible: false },
    { text: 'Data Source' }
] as OnmsColumn[])

export const getAlarmColumns = () => columns

const TYPE = 'alarms'

export const queryAlarms = async (client: ClientDelegate, filter: API.Filter): Promise<OnmsTableData> => {
    let alarms: OnmsAlarm[] = []
    let cols = Array.from(columns)
    let metadata: ServerMetadata | null | undefined

    try {
        alarms = await client.findAlarms(filter)
        const c: Client = await client.getClientWithMetadata()
        metadata = c.http.server?.metadata

    } catch (e) {
        console.error(e);
    }

    const parameterNames = getParameterNames(alarms)

    cols = appendParameterNames(cols, parameterNames)

    const rows = alarms?.map((alarm) => {
        const isAcknowledged = !(alarm.ackUser === undefined || alarm.ackUser === null ||
          alarm.ackTime === undefined || alarm.ackTime === null)

        let row = [
            alarm.id,
            alarm.count,
            alarm.ackUser,
            alarm.ackTime,
            alarm.uei,
            alarm.severity?.label ?? '',
            alarm.type?.label ?? '',
            alarm.description,
            alarm.location,

            alarm.logMessage,
            alarm.reductionKey,
            alarm.troubleTicket,
            alarm.troubleTicketState?.label ?? '',
            alarm.nodeId,
            alarm.nodeLabel,
            alarm.service?.name ?? '',
            alarm.suppressedTime,
            alarm.suppressedUntil,
            alarm.suppressedBy,
            alarm.lastEvent?.ipAddress?.address ?? '',
            isAcknowledged,

            // Event
            alarm.firstEventTime,
            alarm.lastEvent?.id ?? '',
            alarm.lastEvent?.time ?? '',
            alarm.lastEvent?.source ?? '',
            alarm.lastEvent?.createTime ?? '',
            alarm.lastEvent?.severity?.label ?? '',
            alarm.lastEvent?.label ?? '',
            alarm.lastEvent?.location ?? '',

            // Sticky Note
            alarm.sticky?.id ?? '',
            alarm.sticky?.body ?? '',
            alarm.sticky?.author ?? '',
            alarm.sticky?.updated ?? '',
            alarm.sticky?.created ?? '',

            // Journal Note
            alarm.journal?.id ?? '',
            alarm.journal?.body ?? '',
            alarm.journal?.author ?? '',
            alarm.journal?.updated ?? '',
            alarm.journal?.created ?? '',

            // Situation Data
            alarm.relatedAlarms && alarm.relatedAlarms.length > 0 ? 'Y' : 'N',
            alarm.relatedAlarms?.length.toFixed(0) ?? 0,
            alarm.affectedNodeCount?.toFixed(0) ?? 0,
            alarm.managedObjectInstance,
            alarm.managedObjectType,

            // Data Source
            self.name
        ] as OnmsRow

        row = appendEventParameters(row, alarm, parameterNames)

        return row
    })

    const metas = alarms.map(alarm => {
        return {
            // Store the alarm for easy access by the panels
            'alarm': alarm,
            // Store the name of the data-source as part of the data so that
            // the panel can grab an instance of the DS to perform actions
            // on the alarms
            'source': client.name,
            // Store the entity type
            'type': TYPE,
            // Store the ticketerConfig here
            'ticketerConfig': metadata?.ticketerConfig
        }
    })

    return {
        name: 'alarms',
        meta: {
            entity_metadata: metas,
        } as OnmsQueryResultMeta,
        columns: cols.filter(column => column.visible !== false),
        rows: rows,
        type: 'table',
    } as OnmsTableData
}

/**
 * Build a sorted list of (unique) event parameter names
 * @param alarms 
 * @returns 
 */
const getParameterNames = (alarms?: OnmsAlarm[]) => {
    const mapped = alarms?.map(alarm => {
        if (!alarm.lastEvent || !alarm.lastEvent.parameters) {
            return [];
        }
        return alarm.lastEvent.parameters.map(parameter => {
            return parameter.name;
        })
    })

    // flattened, distinct, sorted
    const names = [...new Set((mapped || []).flat())]
    names.sort()

    return names
}

/**
 * Include the event parameters as columns
 * @param columns 
 * @returns 
 */
const appendParameterNames = (columns: OnmsColumn[], parameterNames?: string[]) => {
    parameterNames?.forEach(parameterName => {
        columns.push({
            text: 'Param_' + parameterName,
            resource: 'lastEvent.' + parameterName,
        })
    })

    return columns
}

/**
 * Index the event parameters by name and
 * Append the event parameters to the row
 * @param row 
 * @param alarm 
 * @param parameterNames 
 */
const appendEventParameters = (row: OnmsRow, alarm: OnmsAlarm, parameterNames?: string[]) => {
    const eventParametersByName = {};

    if (alarm.lastEvent && alarm.lastEvent.parameters) {
        alarm.lastEvent.parameters.forEach(parameter => {
            eventParametersByName[parameter.name] = parameter.value;
        })
    }

    parameterNames?.forEach(parameterName => {
        if (eventParametersByName.hasOwnProperty(parameterName)) {
            row.push(eventParametersByName[parameterName])
        } else {
            row.push(undefined)
        }
    })

    return row
}
