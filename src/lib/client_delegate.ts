import { API, Client, DAO, Model, Rest, GrafanaError } from 'opennms'
import { isString } from './utils'

export class ClientDelegate {
    type?: string
    url?: string
    name?: string
    searchLimit: number
    timeout?: number
    client: Client
    clientWithMetadata?: Promise<Client>

    constructor(settings: any, public backendSrv: any) {
        this.type = settings.type
        this.url = settings.url
        this.name = settings.name
        this.searchLimit = 1000

        if (settings.jsonData && settings.jsonData.timeout) {
            this.timeout = parseInt(settings.jsonData.timeout,10) * 1000
        }

        let authConfig = undefined

        if (settings.basicAuth) {
          // If basic auth is configured, pass the username and password to the client
          // This allows the datasource to work in direct mode
          // We need the raw username and password, so we decode the token
          const token = settings.basicAuth.split(' ')[1]
          const decodedToken = atob(token)
          const username = decodedToken.split(':')[0]
          const password = decodedToken.substring(username.length+1, decodedToken.length)
          authConfig = new API.OnmsAuthConfig(username, password)
        }

        const server = API.OnmsServer.newBuilder(this.url).setName(this.name).setAuth(authConfig).build()
        const http = new Rest.GrafanaHTTP(this.backendSrv, server, this.timeout)
        this.client = new Client(http)
        this.clientWithMetadata = undefined
     }

    decorateError(err) {
        let ret = err

        if (err.err) {
            ret = err.err
        }
        if (err.data && err.data.err) {
            ret = err.data.err
        }
        let statusText = 'Request failed.'

        // cancelled property causes the UI to never complete on failure
        if (err.cancelled) {
            statusText = 'Request timed out.'
            delete err.cancelled
        }
        if (err.data && err.data.cancelled) {
            statusText = 'Request timed out.'
            delete err.data.cancelled
        }

        if (!ret.message) {
            ret.message = ret.statusText || statusText
        }
        if (ret.message && ret.message.indexOf('too_many_buckets_exception') !== -1) {
            ret.message = ret.message + '; - alternatively you can edit the "Query options" of this panel\'s query and set "Max data points" to a smaller value.'
        }
        if (!ret.status) {
            ret.status = 'error'
        }
        return Promise.reject(ret)
    }

    getClientWithMetadata(): Promise<Client> {
        if (!this.clientWithMetadata) {
              const self = this
              const http = self.client.http
              const client = Client.getMetadata(http.server, http, self.timeout)
                .then(function(metadata) {
                    // Ensure the OpenNMS we are talking to is compatible
                    if (metadata.apiVersion() < 2) {
                        throw new Error('Unsupported Version')
                    }
                    const server = API.OnmsServer.newBuilder(http.server.url)
                        .setName(http.server.name)
                        .setAuth(http.server.auth)
                        .setMetadata(metadata)
                        .build()

                    http.server = server
                    return self.client
                }).catch(function(e) {
                    // in case of error, reset the client, otherwise
                    // the datasource may never recover
                    self.clientWithMetadata = void 0
                    throw e
                })

          this.clientWithMetadata = Promise.resolve(client)
        }
        return this.clientWithMetadata
    }

    // Inventory (node) related functions
    getNodeDao(): Promise<DAO.NodeDAO> {
        return this.getClientWithMetadata().then((client) => client.nodes())
    }

    findNodes(filter: API.Filter, fetchPrimaryInterfaces = false): Promise<Model.OnmsNode[]> {
        return Promise.all([this.getClientWithMetadata(), this.getNodeDao(), this.getIpInterfaceDao()])
            .then(async ([client, nodeDao, ipInterfaceDao]) => {
                let nodes = await nodeDao.find(filter)

                if (fetchPrimaryInterfaces && client.http?.server?.metadata?.capabilities()?.ipInterfaceRest) {
                    let clauses = nodes.map((node) => {
                        return new API.Clause(new API.Restriction('node.id', API.Comparators.EQ, node.id), API.Operators.OR)
                    })

                    const mapped = {} as [number: Model.OnmsIpInterface]

                    while (clauses.length > 0) {
                        // do this 100 at a time so the query strings don't get too long
                        const temporary = clauses.splice(0, 100)

                        const filter = new API.Filter()
                            .withAndRestriction(new API.Restriction('snmpPrimary', API.Comparators.EQ, Model.PrimaryTypes.PRIMARY))
                            .withAndRestriction(new API.NestedRestriction(...temporary))

                        try {
                            const interfaces = await ipInterfaceDao.find(filter)

                            interfaces.forEach((iface) => {
                                if (iface.node && iface.node.id !== undefined) {
                                    mapped[iface.node.id] = iface
                                }
                            })
                        } catch (err) {
                            // uncomment to debug locally. do not include console statements in the final code
                            // console.warn('An error occurred querying the IP interface')
                        }
                    }

                    nodes = nodes.map((node) => {
                        if (mapped[node.id]) {
                            node.ipInterfaces.push(mapped[node.id])
                        }
                        return node
                    })
                }

                return nodes
            })
            .catch(this.decorateError)
    }

    async getNodeByFilter(filter: any): Promise<Model.OnmsNode[]> {
        const nodeDao = await this.getNodeDao()
        return await nodeDao.find(filter)
    }

    getNode(nodeId): Promise<Model.OnmsNode> {
      return this.getNodeDao()
        .then((nodeDao) => nodeDao.get(nodeId))
        .catch(this.decorateError)
    }

    getNodeProperties(): Promise<API.SearchProperty[]> {
        return this.getNodeDao()
            .then((nodeDao) => nodeDao.searchProperties())
            .catch(this.decorateError)
    }

    findNodeProperty(propertyId): API.SearchProperty {
        return this.getNodeProperties()
            .then((properties) => {
                return properties.find((property) => property.id === propertyId)
            })
    }

    getNodePropertyComparators(propertyId): Promise<any[]> {
        return this.findNodeProperty(propertyId)
            .then(property => {
                if (property) {
                    const comparators = property.type.getComparators()
                    if (comparators && comparators.length > 0) {
                        return comparators
                    }
                }

                // uncomment to debug locally. do not include console statements in the final code
                // console.warn(`No comparators found for property with id '${propertyId}'. Falling back to EQ.`)

                // This may be the case when the user entered a property, which does not exist
                // therefore fallback to EQ
                return [ API.Comparators.EQ ]
            }).catch(this.decorateError)
    }

    // IP interface related functions

    getIpInterfaceDao(): Promise<DAO.IpInterfaceDAO> {
        return this.getClientWithMetadata()
            .then((client) => client.ipInterfaces())
    }

    findIpInterfaces(filter): Promise<Model.OnmsIpInterface[]> {
        return this.getIpInterfaceDao()
            .then((dao) => dao.find(filter))
            .catch(this.decorateError)
    }

    getIpInterfaces(id): Promise<Model.OnmsIpInterface> {
        return this.getIpInterfaceDao()
            .then((dao) => dao.get(id))
            .catch(this.decorateError)
    }

    getIpInterfaceProperties(): Promise<API.SearchProperty[]> {
        return this.getIpInterfaceDao()
            .then((dao) => dao.searchProperties())
            .catch(this.decorateError)
    }

    findIpInterfaceProperty(propertyId): API.SearchProperty {
        return this.getIpInterfaceProperties()
            .then((properties) => {
                return properties.find((property) => property.id === propertyId)
            })
    }

    getIpInterfacePropertyComparators(propertyId): Promise<any[]> {
        return this.findIpInterfaceProperty(propertyId)
            .then(property => {
                if (property) {
                    const comparators = property.type.getComparators()
                    if (comparators && comparators.length > 0) {
                        return comparators
                    }
                }
                // uncomment to debug locally. do not include console statements in the final code
                // console.warn(`No comparators found for property with id '${propertyId}'. Falling back to EQ.`)

                // This may be the case when the user entered a property, which does not exist
                // therefore fallback to EQ
                return [ API.Comparators.EQ ]
            }).catch(this.decorateError)
    }

    // SNMP interface related functions

    getSnmpInterfaceDao(): Promise<DAO.SnmpInterfaceDAO> {
        return this.getClientWithMetadata()
            .then((client) => client.snmpInterfaces())
    }

    findSnmpInterfaces(filter): Promise<Model.OnmsSnmpInterface[]> {
        return this.getSnmpInterfaceDao()
            .then((dao) => dao.find(filter))
            .catch(this.decorateError)
    }

    getSnmpInterfaces(id): Promise<Model.OnmsSnmpInterface> {
        return this.getSnmpInterfaceDao()
            .then((dao) => dao.get(id))
            .catch(this.decorateError)
    }

    getSnmpInterfaceProperties(): Promise<API.SearchProperty[]> {
        return this.getSnmpInterfaceDao()
            .then((dao) => dao.searchProperties())
            .catch(this.decorateError)
    }

    findSnmpInterfaceProperty(propertyId): API.SearchProperty {
        return this.getSnmpInterfaceProperties()
            .then((properties) => {
                return properties.find(property => property.id === propertyId)
            })
    }

    getSnmpInterfacePropertyComparators(propertyId): Promise<any[]> {
        return this.findSnmpInterfaceProperty(propertyId)
            .then(property => {
                if (property) {
                    const comparators = property.type.getComparators()
                    if (comparators && comparators.length > 0) {
                        return comparators
                    }
                }
                // uncomment to debug locally. do not include console statements in the final code
                // console.warn(`No comparators found for property with id '${propertyId}'. Falling back to EQ.`)

                // This may be the case when the user entered a property, which does not exist
                // therefore fallback to EQ
                return [ API.Comparators.EQ ]
            }).catch(this.decorateError)
    }

    // monitored service related functions

    getMonitoredServiceDao(): Promise<DAO.MonitoredServiceDAO> {
        return this.getClientWithMetadata()
            .then((client) => client.monitoredServices())
    }

    findMonitoredServices(filter): Promise<Model.OnmsMonitoredService[]> {
        return this.getMonitoredServiceDao()
            .then((dao) => dao.find(filter))
            .catch(this.decorateError)
    }

    getMonitoredServices(id): Promise<Model.OnmsMonitoredService> {
        return this.getMonitoredServiceDao()
            .then((dao) => dao.get(id))
            .catch(this.decorateError)
    }

    getMonitoredServiceProperties(): Promise<API.SearchProperty[]> {
        return this.getMonitoredServiceDao()
            .then((dao) => dao.searchProperties())
            .catch(this.decorateError)
    }

    findMonitoredServiceProperty(propertyId) {
        return this.getMonitoredServiceProperties()
            .then((properties) => {
                return properties.find(property => property.id === propertyId)
            })
    }

    getMonitoredServicePropertyComparators(propertyId): Promise<any[]> {
        return this.findMonitoredServiceProperty(propertyId)
            .then(property => {
                if (property) {
                    const comparators = property.type.getComparators()
                    if (comparators && comparators.length > 0) {
                        return comparators
                    }
                }
                // uncomment to debug locally. do not include console statements in the final code
                // console.warn(`No comparators found for property with id '${propertyId}'. Falling back to EQ.`)

                // This may be the case when the user entered a property, which does not exist
                // therefore fallback to EQ
                return [ API.Comparators.EQ ]
            }).catch(this.decorateError)
    }

    // outage related functions

    getOutageDao(): Promise<DAO.OutageDAO> {
        return this.getClientWithMetadata()
            .then((client) => client.outages())
    }

    findOutages(filter): Promise<Model.OnmsOutage[]> {
        return this.getOutageDao()
            .then((dao) => dao.find(filter))
            .catch(this.decorateError)
    }

    getOutages(id): Promise<Model.OnmsOutage> {
        return this.getOutageDao()
            .then((dao) => dao.get(id))
            .catch(this.decorateError)
    }

    getOutageProperties(): Promise<API.SearchProperty[]> {
        return this.getOutageDao()
            .then((dao) => dao.searchProperties())
            .catch(this.decorateError)
    }

    findOutageProperty(propertyId) {
        return this.getOutageProperties()
            .then((properties) => {
                return properties.find(property => property.id === propertyId)
            })
    }

    getOutagePropertyComparators(propertyId): Promise<any[]> {
        return this.findOutageProperty(propertyId)
            .then(property => {
                if (property) {
                    const comparators = property.type.getComparators()
                    if (comparators && comparators.length > 0) {
                        return comparators
                    }
                }
                // uncomment to debug locally. do not include console statements in the final code
                // console.warn(`No comparators found for property with id '${propertyId}'. Falling back to EQ.`)

                // This may be the case when the user entered a property, which does not exist
                // therefore fallback to EQ
                return [ API.Comparators.EQ ]
            }).catch(this.decorateError)
    }

    // Fault related functions

    getAlarmDao(): Promise<DAO.AlarmDAO> {
        return this.getClientWithMetadata()
            .then((client) => client.alarms())
    }

    findAlarms(filter): Promise<Model.OnmsAlarm[]> {
        return this.getAlarmDao()
            .then((alarmDao) => alarmDao.find(filter))
            .catch(this.decorateError)
    }

    getAlarm(alarmId): Promise<Model.OnmsAlarm> {
      return this.getAlarmDao()
        .then((alarmDao) => alarmDao.get(alarmId))
        .catch(this.decorateError)
    }

    doEscalate(alarmId, user) {
        return this.getAlarmDao()
            .then((alarmDao) => alarmDao.escalate(alarmId, user))
            .catch(this.decorateError)
    }

    doClear(alarmId, user) {
        return this.getAlarmDao()
            .then((alarmDao) => alarmDao.clear(alarmId, user))
            .catch(this.decorateError)
    }

    doUnack(alarmId, user) {
        return this.getAlarmDao()
            .then((alarmDao) => alarmDao.unacknowledge(alarmId, user))
            .catch(this.decorateError)
    }

    doAck(alarmId, user) {
        return this.getAlarmDao()
            .then((alarmDao) => alarmDao.acknowledge(alarmId, user))
            .catch(this.decorateError)
    }

    doTicketAction(alarmId, action) {
        const supportedActions = ['create', 'update', 'close']

        if (supportedActions.indexOf(action) < 0) {
            throw { message: `Action '${action}' not supported.` }
        }
        const self = this

        return this.backendSrv.datasourceRequest({
            url: `${self.url}/api/v2/alarms/${alarmId}/ticket/${action}`,
            method: 'POST',
        }).catch(this.decorateError)
    }

    saveSticky(alarmId, sticky, user) {
      return this.getAlarmDao()
        .then((alarmDao) => alarmDao.saveStickyMemo(alarmId, sticky, user))
        .catch(this.decorateError)
    }

    deleteSticky(alarmId) {
      return this.getAlarmDao()
        .then(function(alarmDao) {
          return alarmDao.deleteStickyMemo(alarmId)
        }).catch(this.decorateError)
    }

    saveJournal(alarmId, journal, user) {
      return this.getAlarmDao()
        .then(function(alarmDao) {
          return alarmDao.saveJournalMemo(alarmId, journal, user)
        }).catch(this.decorateError)
    }

    deleteJournal(alarmId) {
      return this.getAlarmDao()
        .then(function(alarmDao) {
          return alarmDao.deleteJournalMemo(alarmId)
        }).catch(this.decorateError)
    }

    findOperators(): Promise<API.Operator[]> {
        const operators = API.Operators.map(operator => {
            return {
                id: operator.id,
                label: operator.label
            }
        })

        return Promise.resolve(operators)
    }

    getAlarmProperties(): Promise<API.SearchProperty[]> {
        return this.getAlarmDao()
            .then(alarmDao => {
                return alarmDao.searchProperties()
            }).catch(this.decorateError)
    }

    findAlarmProperty(propertyId): API.SearchProperty {
        return this.getAlarmProperties()
            .then(properties => {
                return properties.find(property => property.id === propertyId )
            })
    }

    getAlarmPropertyComparators(propertyId): Promise<API.Comparator[]> {
        return this.findAlarmProperty(propertyId)
            .then(property => {
                if (property) {
                    const comparators = property.type.getComparators()
                    if (comparators && comparators.length > 0) {
                        return comparators
                    }
                }
                // uncomment to debug locally. do not include console statements in the final code
                // console.warn(`No comparators found for property with id '${propertyId}'. Falling back to EQ.`)

                // This may be the case when the user entered a property, which does not exist
                // therefore fallback to EQ
                return [ API.Comparators.EQ ]
            }).catch(this.decorateError)
    }

    // Situation Feedback functions

    getSituationfeedbackDao(): Promise<DAO.SituationFeedbackDAO> {
        return this.getClientWithMetadata()
            .then((client) => client.situationfeedback())
            .catch(this.decorateError)
    }

    getSituationfeedback(situationId): Promise<Model.OnmsSituationFeedback> {
        return this.getSituationfeedbackDao()
        .then((dao) => dao.getFeedback(situationId))
        .catch(this.decorateError)
    }

    submitSituationFeedback(situationId, feedback): Promise<any> {
        return this.getSituationfeedbackDao()
            .then((dao) => dao.saveFeedback(feedback, situationId))
            .catch(this.decorateError)
    }

    // Flow related functions
    getFlowDao(): Promise<DAO.FlowDAO> {
        return this.getClientWithMetadata().then(function(c) {
            return c.flows()
        }).catch(this.decorateError)
    }

    // FIXME: Promise<Model.OnmsFlowTable>
    getApplications(prefix, start, end, nodeCriteria, interfaceId, dscp): Promise<any> {
        return this.getFlowDao()
            .then((dao) => dao.getApplications(prefix, start, end, nodeCriteria, interfaceId, dscp))
            .catch(this.decorateError)
    }

    getSeriesForTopNApplications(N, start, end, step, includeOther, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowSeries> {
        return this.getFlowDao()
            .then((dao) => dao.getSeriesForTopNApplications(N, start, end, step, includeOther, nodeCriteria, interfaceId, dscp))
            .catch(this.decorateError)
    }

    getSeriesForApplications(applications, start, end, step, includeOther, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowSeries> {
        return this.getFlowDao()
            .then((dao) => dao.getSeriesForApplications(applications, start, end, step, includeOther, nodeCriteria, interfaceId, dscp))
            .catch(this.decorateError)
    }

    getSummaryForTopNApplications(N, start, end, includeOther, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowTable> {
        return this.getFlowDao()
            .then((dao) => dao.getSummaryForTopNApplications(N, start, end, includeOther, nodeCriteria, interfaceId, dscp))
            .catch(this.decorateError)
    }

    getSummaryForApplications(applications, start, end, includeOther, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowTable> {
        return this.getFlowDao()
            .then((dao) => dao.getSummaryForApplications(applications, start, end, includeOther, nodeCriteria, interfaceId, dscp))
            .catch(this.decorateError)
    }

    getSeriesForTopNConversations(N, start, end, step, includeOther, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowSeries> {
        return this.getFlowDao()
            .then((dao) => dao.getSeriesForTopNConversations({
                    N: N,
                    start: start,
                    end: end,
                    step: step,
                    exporterNode: nodeCriteria,
                    ifIndex: interfaceId,
                    dscp: dscp,
                    includeOther: includeOther,
                })
            ).catch(this.decorateError)
    }

    getSeriesForConversations(conversations, start, end, step, includeOther, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowSeries> {
        return this.getFlowDao()
            .then((dao) => dao.getSeriesForConversations(conversations, start, end, step, includeOther, nodeCriteria, interfaceId, dscp))
            .catch(this.decorateError)
    }

    getSummaryForTopNConversations(N, start, end, includeOther, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowTable> {
        return this.getFlowDao()
            .then((dao) => dao.getSummaryForTopNConversations({
                    N: N,
                    start: start,
                    end: end,
                    exporterNode: nodeCriteria,
                    ifIndex: interfaceId,
                    dscp: dscp,
                    includeOther: includeOther
                })
            ).catch(this.decorateError)
    }

    getSummaryForConversations(conversations, start, end, includeOther, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowTable> {
        return this.getFlowDao()
            .then((dao) => dao.getSummaryForConversations(conversations, start, end, includeOther, nodeCriteria, interfaceId, dscp))
            .catch(this.decorateError)
    }

    // FIXME: Promise<Model.OnmsFlowTable>
    getHosts(prefix, start, end, nodeCriteria, interfaceId, dscp): Promise<any> {
        return this.getFlowDao()
            .then((dao) => dao.getHosts(prefix + '.*', start, end, nodeCriteria, interfaceId, dscp))
            .catch(this.decorateError)
    }

    getSeriesForHosts(hosts, start, end, step, includeOther, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowSeries> {
        return this.getFlowDao()
            .then((dao) => dao.getSeriesForHosts(hosts, start, end, step, includeOther, nodeCriteria, interfaceId, dscp))
            .catch(this.decorateError)
    }

    getSeriesForTopNHosts(N, start, end, step, includeOther, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowSeries> {
        return this.getFlowDao()
            .then((dao) => dao.getSeriesForTopNHosts(N, start, end, step, includeOther, nodeCriteria, interfaceId, dscp))
            .catch(this.decorateError)
    }

    getSummaryForTopNHosts(N, start, end, includeOther, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowTable> {
        return this.getFlowDao()
            .then((dao) => dao.getSummaryForTopNHosts(N, start, end, includeOther, nodeCriteria, interfaceId, dscp))
            .catch(this.decorateError)
    }

    getSummaryForHosts(hosts, start, end, includeOther, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowTable> {
        return this.getFlowDao()
            .then((dao) => dao.getSummaryForHosts(hosts, start, end, includeOther, nodeCriteria, interfaceId, dscp))
            .catch(this.decorateError)
    }

    // FIXME: Promise<Model.OnmsFlowExporterSummary[]>
    getExporters(): Promise<any[]> {
        const searchLimit = this.searchLimit

        return this.getFlowDao()
            .then((dao) => dao.getExporters(searchLimit))
            .catch(this.decorateError)
    }

    // FIXME: Promise<Model.OnmsFlowExporter>
    getExporter(nodeCriteria) {
        const searchLimit = this.searchLimit

        return this.getFlowDao()
            .then((dao) => dao.getExporter(nodeCriteria, searchLimit))
            .catch(this.decorateError)
    }

    getDscpValues(nodeCriteria, interfaceId, start, end) {
        return this.getClientWithMetadata().then(function(c) {
            const metadata = c.http.server.metadata

            if (metadata.tos()) {
                return c.flows().getDscpValues(nodeCriteria, interfaceId, start, end)
            } else {
                return Promise.resolve([])
            }
        }).catch(this.decorateError)
    }

    getSummaryForDscps(start, end, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowTable> {
      return this.getFlowDao()
          .then(function(flowDao) {
            return flowDao.getSummaryForDscps(start, end, nodeCriteria, interfaceId, dscp)
          }).catch(this.decorateError)
    }

    getSeriesForDscps(start, end, step, nodeCriteria, interfaceId, dscp): Promise<Model.OnmsFlowSeries> {
      return this.getFlowDao()
          .then(function(flowDao) {
            return flowDao.getSeriesForDscps(start, end, step, nodeCriteria, interfaceId, dscp)
          }).catch(this.decorateError)
    }

    testConnection = async () => {
        const defaultErrorMessage = 'Cannot connect to API'

        let response = { status: '', message: '' }

        try {
          await this.getClientWithMetadata()

          response = { status: 'Success', message: 'Success' }
        } catch (err) {
          let message = ''

          if (isString(err)) {
            message = err as string
          } else {
            let grafanaError = err as GrafanaError

            if (grafanaError) {
              message = `Fetch error: ${(grafanaError.data.statusText ? grafanaError.data.statusText : defaultErrorMessage)}`

              if (grafanaError.data?.message) {
                message += `: ${grafanaError.data.message}`
              }
            }
          }

          response = { status: 'error', message: message }
        }

        return response
      }
}
