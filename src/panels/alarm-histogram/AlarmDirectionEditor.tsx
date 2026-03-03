import React from 'react'
import { PanelOptionsEditorProps } from '@grafana/data'
import { Combobox } from '@grafana/ui'
import { AlarmDirections } from './constants'

interface Props extends PanelOptionsEditorProps<number> { }

export const AlarmDirectionEditor: React.FC<Props> = ({ value, onChange }) => {
    return (
        
        <div>
            <Combobox options={[
                { ...AlarmDirections.Vertical },
                { ...AlarmDirections.Horizontal },
            ]}

                value={value}
                onChange={(e) => onChange(e.value)}
            />
        </div>
    )
}
