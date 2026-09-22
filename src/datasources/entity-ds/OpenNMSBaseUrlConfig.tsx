import React from 'react'
import { DataSourceSettings } from '@grafana/data'
import { InlineField, InlineSwitch, Input } from '@grafana/ui'
import { isAbsoluteHttpUrl } from '../../lib/externalLinks'
import { EntityDataSourceOptions } from './types'

interface Props {
  onOptionsChange: (o: DataSourceSettings<EntityDataSourceOptions>) => void
  options: DataSourceSettings<EntityDataSourceOptions>
}

const tooltipText = 'Optionally enter the base URL of your OpenNMS instance as your browser reaches it, ' +
  'for example http://localhost:8980/opennms. It is used only to build direct links out to OpenNMS pages, ' +
  'such as the "Full Details" link in the Alarm Table panel\'s alarm detail dialog. This is separate from ' +
  'the URL in the HTTP settings above, which the Grafana server uses for API calls and which may not be ' +
  'reachable from your browser - a Docker host.docker.internal address, for instance.'

export const OpenNMSBaseUrlConfig: React.FC<Props> = ({ onOptionsChange, options }) => {
  const enabled = options.jsonData.useOpenNMSBaseUrl ?? false
  const baseUrl = options.jsonData.opennmsBaseUrl ?? ''

  // Turning the switch on without a usable url leaves links incomplete, so say so here rather
  // than only in the panel. A blank field reads like a saved value because of the placeholder,
  // and a scheme-less value such as 'localhost:8980/opennms' cannot resolve to OpenNMS at all.
  const blankUrl = enabled && !baseUrl.trim()
  const unresolvableUrl = enabled && !blankUrl && !isAbsoluteHttpUrl(baseUrl)

  const error = blankUrl
    ? 'Enter the base URL of your OpenNMS instance, or turn this setting off.'
    : 'The base URL must start with http:// or https://, for example http://localhost:8980/opennms.'

  const onChange = (jsonData: Partial<EntityDataSourceOptions>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        ...jsonData
      }
    })
  }

  return (
    <>
      <style>
        {
          `
          .entity-config-editor-switch {
              display: flex;
              align-items: center;
              height: 32px;
              width: 32px;
          }
          .entity-config-editor-switch label {
              min-width: 32px;
              width: 32px;
          }
          `
        }
      </style>
      <InlineField
        className='entity-config-editor-switch-field'
        label='Enable OpenNMS Base URL:'
        tooltip={tooltipText}
      >
        <div className='entity-config-editor-switch'>
          <InlineSwitch
            value={enabled}
            onChange={() => onChange({ useOpenNMSBaseUrl: !enabled })} />
        </div>
      </InlineField>
      {/* InlineField clones its child with its own invalid/disabled/loading props, so 'disabled'
          has to be set here rather than on the Input, or it gets overwritten with undefined. */}
      <InlineField
        label='OpenNMS Base URL:'
        tooltip={tooltipText}
        disabled={!enabled}
        invalid={blankUrl || unresolvableUrl}
        error={error}
      >
        <Input
          width={40}
          placeholder='e.g. http://localhost:8980/opennms'
          value={baseUrl}
          onChange={(e) => onChange({ opennmsBaseUrl: e.currentTarget.value })} />
      </InlineField>
    </>
  )
}
