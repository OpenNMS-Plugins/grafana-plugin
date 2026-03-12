import React, { useState, useEffect } from 'react'
import { Combobox } from '@grafana/ui'
import { AlarmTableAlarmDataState } from './AlarmTableTypes'
import { ColorThemeDisplay } from 'components/ColorThemeDisplay'
import { OnmsInlineField } from 'components/OnmsInlineField'
import { alarmSeverityThemeOptions } from './constants'

interface AlarmTableAlarmProps {
    onChange: Function
    alarmTable: any;
}
export const AlarmTableAlarms: React.FC<AlarmTableAlarmProps> = ({ onChange, alarmTable }) => {
    const [alarmTableAlarmData, setAlarmTableAlarmData] = useState<AlarmTableAlarmDataState>({
        styleWithSeverity: alarmTable?.alarmTableAlarms?.styleWithSeverity || { label: 'Column', value: 1 },
        severityTheme: alarmTable?.alarmTableAlarms?.severityTheme ||{ label: 'Default', value: 0 }
    });

    useEffect(() => {
        onChange(alarmTableAlarmData)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [alarmTableAlarmData])

    const setAlarmTableState = (key, value) => {
        const newState = { ...alarmTableAlarmData }
        newState[key] = value
        setAlarmTableAlarmData(newState);
    }

    return (
        <div>
            <OnmsInlineField label="Style with severity">
                {/** 
                  * Support for row-level colours is not coded into the current version of Grafana: https://github.com/grafana/grafana/discussions/38151     
                  * If it's supported in the future, we can re-enable the option here.
                  *    */}
                <Combobox
                    value={alarmTableAlarmData.styleWithSeverity}
                    onChange={(val) => setAlarmTableState('styleWithSeverity', val)}
                    options={[{ label: 'Column', value: 1 }, { label: 'Off', value: 2 }]}
                />
            </OnmsInlineField>
            <OnmsInlineField label="Severity theme">
                <Combobox
                    value={alarmTableAlarmData.severityTheme}
                    onChange={(val) => setAlarmTableState('severityTheme', val)}
                    options={alarmSeverityThemeOptions}
                />
            </OnmsInlineField>
            <ColorThemeDisplay theme={alarmTableAlarmData.severityTheme?.value} />
        </div>
    )
}
