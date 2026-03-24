import React, { useEffect, useState } from 'react'
import { css } from '@emotion/css'
import { GrafanaTheme2 } from '@grafana/data'
import {
  Collapse,
  Combobox,
  InlineField,
  InlineFieldRow,
  Input,
  Stack,
  Switch,
  useStyles2
} from '@grafana/ui'
import { FieldDisplay } from 'components/FieldDisplay'
import { AlarmTableColumnSizeItem, AlarmTableColumnSizeState } from './AlarmTableTypes'

interface AlarmTableColumnSizeProps {
    onChange: (state: AlarmTableColumnSizeState) => void
    columnState: AlarmTableColumnSizeState | undefined
    context: any
}

const getStyles = (theme: GrafanaTheme2) => ({
  spacer: css`
    margin-top: ${theme.spacing(2)};
  `,
})

export const AlarmTableColumnSizes: React.FC<AlarmTableColumnSizeProps> = ({ onChange, columnState, context }) => {
  const [isOpen, setIsOpen] = useState<boolean>(columnState?.active || false)
  const [active, setActive] = useState<boolean>(columnState?.active || false)
  const [columnSizes, setColumnSizes] = useState<AlarmTableColumnSizeItem[]>(columnState?.columnSizes || [])
  const s = useStyles2(getStyles)

  const onAddColumn = (fieldName?: string) => {
    if (fieldName && !columnSizes.some(c => c.fieldName === fieldName)) {
      const newColumn = {
        fieldName,
        width: 100
      }

      const newColumns = [...columnSizes]
      newColumns.push(newColumn)
      setColumnSizes(newColumns)
    }
  }

  const onChangeWidth = (field: AlarmTableColumnSizeItem, value: string) => {
    if (value) {
      const num = Number(value)

      if (num && !Number.isNaN(num)) {
        const newSizes = columnSizes.map(item => {
          return item.fieldName === field.fieldName ? { fieldName: item.fieldName, width: num } : item
        })
      
        setColumnSizes(newSizes)
      }
    }
  }

  const onRemove = (fieldName: string) => {
    const newColumns = columnSizes.filter(item => item.fieldName !== fieldName)
    setColumnSizes(newColumns)
  }

  useEffect(() => {
    const newState = {
      active,
      columnSizes
    }
    onChange(newState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, columnSizes])

  const tooltipText = 'Set fixed column widths for selected columns, which will retain their width ' +
    'even when the Alarm Table panel is resized.'

  return (
    <>
      <style>
      {
        `
          .field-display-width {
            width: 200px;
          }

          .button-remove {
            margin-left: 6px;
            background-color: rgb(239, 25, 32);
            border-radius: 2px;
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 6px;
            cursor: pointer;
          }
        `
      }
      </style>
      <div className={s.spacer}></div>
      <Collapse label="Column Sizes" isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)}>
        <InlineFieldRow>
          <InlineField label='Set column sizes' tooltip={tooltipText}>
            <div style={{ display: 'flex', alignItems: 'center', height: '32px' }}>
              <Switch
                value={columnState?.active}
                onChange={() => setActive(!active)} />
            </div>
          </InlineField>
        </InlineFieldRow>

        { columnState?.active &&
          <InlineFieldRow>
            <InlineField label='Add column'>
              <Combobox
                disabled={!columnState?.active}
                placeholder='Add Column'
                value={''}
                onChange={val => onAddColumn(val.label)}
                options={context?.data?.[0]?.fields.map((field, index) => ({ ...field, value: index, label: field.name }))}
              />
            </InlineField>
          </InlineFieldRow>
        }
      
        { columnState?.active ?
          <div>
            <Stack direction={'column'} rowGap={2}>
              {columnState?.columnSizes?.map((item, index) => {
                return (
                  <FieldDisplay key={item.fieldName}>
                    <span className='field-display-width'>{index + 1}. {item.fieldName}</span>
                    <Input type='number' width={12} value={item.width} onChange={(val) => onChangeWidth(item, val.currentTarget.value)} />
                    <span
                      className='button-remove'
                      tabIndex={0}
                      onClick={(e) => onRemove(item.fieldName)}
                      onKeyUp={(e) => { e.key === ' ' && onRemove(item.fieldName) }}
                    ><i className='fa fa-ban'></i></span>
                  </FieldDisplay>
                )
              })}
            </Stack>
          </div>
        :
          <div className={s.spacer}>
            No configured column sizes.
          </div>
        }
      </Collapse>
    </>
  )
}
