import React, { useEffect, useState } from 'react'
import { PanelOptionsEditorProps } from '@grafana/data'
import { Combobox, ComboboxOption, Input, Switch } from '@grafana/ui'
import { OnmsInlineField } from 'components/OnmsInlineField'
import { SwitchBox } from 'components/SwitchBox'
import { DirectionOptions, DisplayOptions, ModeOptions, PositionOptions, UnitOptions } from './FlowHistogramConstants'
import { FlowHistogramOptionsProps } from './FlowHistogramTypes'

interface FlowHistogramProps {
}

export const FlowHistogramOptions: React.FC<PanelOptionsEditorProps<FlowHistogramProps>> = ({ onChange, context }) => {
    const convertToComboboxOption = (option?: any): ComboboxOption<string> | undefined => {
        if (!option?.value || !option?.label) {
            return undefined
        }

        return { label: String(option.label), value: String(option.value) }
    }

    const [options, setOptions] = useState<FlowHistogramOptionsProps>({
        direction: convertToComboboxOption(context.options?.flowHistogramOptions?.direction) ?? DirectionOptions[0],
        units: convertToComboboxOption(context.options?.flowHistogramOptions?.units) ?? UnitOptions[0],
        display: convertToComboboxOption(context.options?.flowHistogramOptions?.display) ?? DisplayOptions[0],
        mode: convertToComboboxOption(context.options?.flowHistogramOptions?.mode) ?? ModeOptions[0],
        showLegend: context.options?.flowHistogramOptions?.showLegend ?? true,
        position: convertToComboboxOption(context.options?.flowHistogramOptions?.position) ?? PositionOptions[0],
        height: context.options?.flowHistogramOptions?.height || 42
    })

    const updateOptions = (value: ComboboxOption<string | number>, key: string) => {
        setOptions((oldOptions) => {
            const newOptions = { ...oldOptions }
            newOptions[key] = { label: value.label, value: value.value };
            return newOptions
        })
    }

    const updateShowLegend = (value: boolean) => {
        setOptions((oldOptions) => {
            const newOptions = { ...oldOptions }
            newOptions.showLegend = value
            return newOptions
        })
    }

    const updateHeight = (value: number) => {
        setOptions((oldOptions) => {
            const newOptions = { ...oldOptions }
            newOptions.height = value
            return newOptions
        })
    }

    useEffect(() => {
        onChange(options)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options])

    return (
        <div>
            <p style={{ marginTop: 12, marginBottom: 3 }}>General</p>
            <OnmsInlineField label='Direction'>
                <Combobox
                    options={DirectionOptions}
                    value={convertToComboboxOption(options.direction)}
                    onChange={(e) => updateOptions(e, 'direction')}
                />
            </OnmsInlineField>
            <OnmsInlineField label='Units'>
                <Combobox
                    options={UnitOptions}
                    value={convertToComboboxOption(options.units)}
                    onChange={(e) => updateOptions(e, 'units')}
                />
            </OnmsInlineField>
            <OnmsInlineField label='Display'>
                <Combobox
                    options={DisplayOptions}
                    value={convertToComboboxOption(options.display)}
                    onChange={(e) => updateOptions(e, 'display')}
                />
            </OnmsInlineField>
            <OnmsInlineField label='Mode'>
                <Combobox
                    options={ModeOptions}
                    value={convertToComboboxOption(options.mode)}
                    onChange={(e) => updateOptions(e, 'mode')}
                />
            </OnmsInlineField>

            <p style={{ marginTop: 20, marginBottom: 3 }}>Legend</p>
            <OnmsInlineField label='Show Legend'>
                <SwitchBox>
                    <Switch
                        value={options.showLegend}
                        onChange={() => updateShowLegend(!options?.showLegend)} />
                </SwitchBox>
            </OnmsInlineField>
            <OnmsInlineField label='Position'>
                <Combobox
                    options={PositionOptions}
                    value={convertToComboboxOption(options.position)}
                    onChange={(e) => updateOptions(e, 'position')}
                />
            </OnmsInlineField>
            <OnmsInlineField label='Height'>
                <Input
                    type='number'
                    max={75}
                    min={20}
                    value={options.height}
                    onChange={(e) => updateHeight(Number.parseInt(e.currentTarget.value, 10) > 0 ? Number.parseInt(e.currentTarget.value, 10) : 0)}
                />
            </OnmsInlineField>
        </div>
    )
}
