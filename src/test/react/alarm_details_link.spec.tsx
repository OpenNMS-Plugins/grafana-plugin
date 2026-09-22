import React from 'react'
import { render, screen } from '@testing-library/react'
import { OnmsAlarm } from 'opennms/src/model'
import { ClientDelegate } from '../../lib/client_delegate'
import { AlarmDetailsLink } from '../../panels/alarm-table/modal/AlarmDetailsLink'

const PROXY_URL = '/api/datasources/proxy/uid/af2mze8mmd9moa'
const RELATIVE_URL = '/alarm/detail.htm?id=9849'
const NOTE = /Link is relative to an OpenNMS instance/
const FULL_NOTE = 'Link is relative to an OpenNMS instance. To get a complete link, go to the Entity '
  + 'Datasource configuration, enable the OpenNMS Base URL setting and enter a URL.'

const clientFor = (jsonData: object) => new ClientDelegate({
  url: PROXY_URL,
  type: 'opennms-entity-datasource',
  name: 'opennms-entity-datasource',
  jsonData
}, undefined)

const alarmWith = (detailsPage?: string) => ({ id: 9849, detailsPage } as OnmsAlarm)

describe('AlarmDetailsLink', () => {
  it('should render a clickable external link when an OpenNMS Base URL is configured', () => {
    render(
      <AlarmDetailsLink
        alarm={alarmWith(`${PROXY_URL}/alarm/detail.htm?id=9849`)}
        client={clientFor({ useOpenNMSBaseUrl: true, opennmsBaseUrl: 'http://localhost:8980/opennms' })}
      />
    )

    const link = screen.getByRole('link', { name: /Full Details/ })

    expect(link).toHaveAttribute('href', 'http://localhost:8980/opennms/alarm/detail.htm?id=9849')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })

  it('should render the relative url as plain text, never a dead link, when no OpenNMS Base URL is configured', () => {
    render(
      <AlarmDetailsLink
        alarm={alarmWith(`${PROXY_URL}/alarm/detail.htm?id=9849`)}
        client={clientFor({})}
      />
    )

    // A relative href would resolve against Grafana's own origin and 404, so there must be no anchor
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(RELATIVE_URL, { exact: false })).toBeInTheDocument()
    expect(screen.getByText(NOTE)).toBeInTheDocument()
  })

  it('should tell the user which setting to turn on and that it needs a url', () => {
    render(
      <AlarmDetailsLink
        alarm={alarmWith(`${PROXY_URL}/alarm/detail.htm?id=9849`)}
        client={clientFor({})}
      />
    )

    expect(screen.getByText(FULL_NOTE)).toBeInTheDocument()
  })

  it('should render the relative url as plain text when the base url is enabled but left blank', () => {
    render(
      <AlarmDetailsLink
        alarm={alarmWith(`${PROXY_URL}/alarm/detail.htm?id=9849`)}
        client={clientFor({ useOpenNMSBaseUrl: true, opennmsBaseUrl: '' })}
      />
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(NOTE)).toBeInTheDocument()
  })

  it('should render nothing when the alarm has no details page', () => {
    const { container } = render(
      <AlarmDetailsLink
        alarm={alarmWith(undefined)}
        client={clientFor({ useOpenNMSBaseUrl: true, opennmsBaseUrl: 'http://localhost:8980/opennms' })}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('should render nothing when there is no alarm or the client has not resolved yet', () => {
    const withoutAlarm = render(
      <AlarmDetailsLink
        alarm={undefined}
        client={clientFor({ useOpenNMSBaseUrl: true, opennmsBaseUrl: 'http://localhost:8980/opennms' })}
      />
    )
    expect(withoutAlarm.container).toBeEmptyDOMElement()

    // useOpenNMSClient resolves the datasource asynchronously, so client is briefly undefined
    const withoutClient = render(
      <AlarmDetailsLink alarm={alarmWith(`${PROXY_URL}/alarm/detail.htm?id=9849`)} client={undefined} />
    )
    expect(withoutClient.container).toBeEmptyDOMElement()
  })
})
