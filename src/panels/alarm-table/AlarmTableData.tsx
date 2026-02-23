import React, { useEffect, useState } from 'react'
import { Combobox } from '@grafana/ui'
import { DragList } from 'components/DragList'
import { OnmsInlineField } from 'components/OnmsInlineField'
import { AlarmTableDataState } from './AlarmTableTypes'
import { alarmTableDefaultColumns } from './constants'

interface AlarmTableDataProps {
    onChange: Function;
    context: any;
}

export const AlarmTableData: React.FC<AlarmTableDataProps> = ({ onChange, context }) => {
    const [alarmTableData, setAlarmTableData] = useState<AlarmTableDataState>(context?.options?.alarmTable?.alarmTableData || {
        columns: alarmTableDefaultColumns
    })

    useEffect(() => {
        onChange(alarmTableData);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [alarmTableData])

    const setAlarmTableState = (key, value) => {
        const newState = { ...alarmTableData }
        newState[key] = value
        setAlarmTableData(newState)
   }

    return (
        <div>
            {/** 
              * 
              * Commented out for now. This is in the original table, but 
              * from what I can tell there was only ever one transformer
              * written, so there's no need to have the ability to swap them
              * TODO: Double check if we need the ability to 'transform' in different ways
              * 
              * <OnmsInlineField label="Table Transform">
                <Combobox
                    value={alarmTableData.transformType}
                    onChange={(val) => setAlarmTableState('transformType', val)}
                    options={[{ label: 'Table', value: 0 }]}
                />
            </OnmsInlineField> */}

            <OnmsInlineField label="Columns">
                <Combobox
                    placeholder='Add Column'
                    value={''}
                    onChange={(val) => {
                        const newColumns = [...alarmTableData.columns]
                        newColumns.push(val)
                        setAlarmTableState('columns', newColumns)
                    }}
                    options={context?.data?.[0]?.fields.map((field, index) => ({ ...field, value: index, label: field.name }))}
                />
            </OnmsInlineField>
            <DragList values={alarmTableData?.columns} onChange={(val) => { setAlarmTableState('columns', val) }} />
        </div>
    )
}
