import React  from 'react'
import { DataSourceSettings } from '@grafana/data'
import { InlineField, InlineSwitch } from '@grafana/ui'
import { PerformanceDataSourceOptions } from './types'

interface Props {
  onOptionsChange: (o: DataSourceSettings<PerformanceDataSourceOptions>) => void
  options: DataSourceSettings<PerformanceDataSourceOptions>
}

export const InputValueOverrideConfig: React.FC<Props> = ({ onOptionsChange, options}) => {
  const tooltipText = 'Enable input value override UI components for some input fields, e.g. Performance Node or Attribute, ' +
    'where you can enter a template variable, expression or other value manually, if it isn\'t allowed due to validation in the Select controls. ' +
    'Generally should not be needed.'

  const onChange = (value: boolean) => {
    const newOptions = {
      ...options,
      jsonData: {
        ...options.jsonData,
       enableInputValueOverrideComponents: value
      }
    }

    onOptionsChange(newOptions)
  }

  return (
    <>
      <style>
        {
          `
          .perf-config-editor-switch {
              display: flex;
              align-items: center;
              height: 32px;
              width: 32px;
          }
          .perf-config-editor-switch label {
              min-width: 32px;
              width: 32px;
          }
          `
      }
      </style>
      <InlineField className='perf-config-editor-switch-field' label='Enable input value override components:' tooltip={tooltipText}>
        <div className='perf-config-editor-switch'>
          <InlineSwitch
            value={options.jsonData.enableInputValueOverrideComponents}
            onChange={() => onChange(!options.jsonData.enableInputValueOverrideComponents)} />
        </div>
      </InlineField>
    </>
  )
}
