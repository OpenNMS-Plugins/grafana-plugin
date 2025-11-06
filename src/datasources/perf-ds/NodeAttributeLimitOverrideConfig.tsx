import React, { useState } from 'react'
import { DataSourceSettings } from '@grafana/data'
import { InlineField, InlineFieldRow, InlineSwitch, Label, SegmentInput } from '@grafana/ui'
import { PerformanceDataSourceOptions } from './types'

interface Props {
  onOptionsChange: (o: DataSourceSettings<PerformanceDataSourceOptions>) => void
  options: DataSourceSettings<PerformanceDataSourceOptions>
}

export const NodeAttributeLimitOverrideConfig: React.FC<Props> = ({ onOptionsChange, options}) => {
  const tooltipText = 'When performing an Attribute or String Property query, ' +
    'we usually limit the amount of Nodes searched for populating the Node dropdown lists to 1000. ' +
    'You may remove that limit by selecting Unlimited, or else set a limit. ' +
    'Use caution as this may impact performance if you have a large quantity of nodes.'

  const [nodeLimit, setNodeLimit] = useState<number>(options.jsonData.attributeQueryNodeLimit?.limit ?? 0)
  const [isUnlimited, setUnlimited] = useState<boolean>(options.jsonData.attributeQueryNodeLimit?.unlimited ?? false)

  const onChange = () => {
    const newOptions = {
      ...options,
      jsonData: {
        ...options.jsonData,
        attributeQueryNodeLimit: {
          unlimited: isUnlimited,
          limit: nodeLimit
        }
      }
    }

    onOptionsChange(newOptions)
  }

  const validateAndSetNodeLimit = (value: string | number) => {
    const limit = parseInt(String(value), 10)

    if (!isNaN(limit) && limit >= 0) {
      setNodeLimit(limit)
      onChange()
    }
  }

  const updateUnlimited = (value: boolean) => {
    setUnlimited(value)
    onChange()
  }

  return (
    <>
      <style>
        {
          `
          .perf-config-editor-input {
              display: flex;
              align-items: center;
              height: 32px;
          }
          .perf-config-editor-input label {
              min-width: 32px;
          }
          .perf-config-editor-input div.perf-config-label label {
              padding: 0.5em;
          }
          .perf-config-editor-input input {
              min-width: 6em;
              padding: 0.5em;
          }

          .perf-config-editor-input-field .perf-config-editor-input .perf-config-label {
              margin-bottom: 0;
          }

          .perf-config-editor-input-field .perf-config-editor-input .perf-config-horiz-spacer {
              width: 2em;
          }

          `
      }
      </style>

      <InlineFieldRow>
          <InlineField className='perf-config-editor-input-field' label='Override attribute query node limit:' tooltip={tooltipText}>
            <div className='perf-config-editor-input'>
              <Label className="perf-config-label">
                Unlimited:
              </Label>

              <InlineSwitch
                label={'Unlimited'}
                value={isUnlimited}
                onChange={() => updateUnlimited(!isUnlimited)} />

              <div className="perf-config-horiz-spacer"></div>

              <Label className="perf-config-label">
                Set a limit:
              </Label>

              <SegmentInput
                  disabled={isUnlimited}
                  value={nodeLimit}
                  placeholder=''
                  onChange={(value) => validateAndSetNodeLimit(value)}
              />
            </div>
          </InlineField>
      </InlineFieldRow>
    </>
  )
}

