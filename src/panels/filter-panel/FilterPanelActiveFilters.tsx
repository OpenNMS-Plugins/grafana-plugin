import React from 'react'
import { SelectableValue } from '@grafana/data'
import { Button, Combobox, ComboboxOption, Label, SegmentInput } from '@grafana/ui'
import { FieldDisplay } from 'components/FieldDisplay'
import { ActiveFilter } from '../../datasources/entity-ds/types'

interface FilterPanelActiveFiltersProps {
    activeFilters: ActiveFilter[],
    onChange: Function
}

export const FilterPanelActiveFilters: React.FC<FilterPanelActiveFiltersProps> = ({ activeFilters, onChange }) => {
    const updateFilterSelectionType = (value: ComboboxOption<string | number>, index: number) => {
        const newFilters = [...activeFilters]
        newFilters[index].selectionType = { label: value.label, value: String(value.value) } as SelectableValue<string>
        onChange(newFilters)
    }

    const updateAltColumnLabels = (value: string | number, index: number) => {
        if (typeof value === 'string') {
            const newFilters = [...activeFilters]
            newFilters[index].altColumnLabel = value
            onChange(newFilters)
        }
    }

    const removeFieldRow = (index: number) => {
        const newFilters = [...activeFilters]
        newFilters.splice(index, 1)
        onChange(newFilters)
    }

    const moveFieldDown = (index: number) => {
        const newFilters = [...activeFilters]
        const stored = newFilters[index];
        newFilters.splice(index, 1);
        newFilters.splice(index + 1, 0, stored);
        onChange(newFilters)
    }

    const moveFieldUp = (index: number) => {
        const newFilters = [...activeFilters]
        const stored = newFilters[index];
        newFilters.splice(index, 1);
        newFilters.splice(index - 1, 0, stored);
        onChange(newFilters)
    }

    return (
        <>
            <style>
                {
                    `
                        .no-margin {
                            margin:0;
                        }
                    `
                }
            </style>
            {activeFilters.length > 0 &&
                <div style={{ marginBottom: '6px' }}>

                    <Label style={{ marginTop: 12, marginBottom: 6 }}>
                        Active Filters
                    </Label>
                    {activeFilters?.map((filter, index) => {
                        return (
                            <div style={{ marginBottom: 10 }} key={index}>
                                <div style={{ display: 'flex' }}>
                                    <FieldDisplay>{filter?.entity?.label}</FieldDisplay>
                                    <SegmentInput
                                        placeholder={filter?.attribute?.label}
                                        value={filter.altColumnLabel}
                                        onChange={(e) => updateAltColumnLabels(e, index)}
                                    />
                                    <div
                                        style={{
                                            display: 'flex',
                                            marginLeft: 'auto',
                                            columnGap: '12px'
                                        }}>
                                        <Combobox
                                            options={[
                                                { label: 'Single', value: 'single' },
                                                { label: 'Multi', value: 'multi' },
                                                { label: 'Text', value: 'text' }
                                            ]}
                                            onChange={(e) => updateFilterSelectionType(e, index)}
                                            value={{ label: filter.selectionType?.label || 'Single', value: filter.selectionType?.value || 'single' }}
                                        />
                                        <Button
                                            disabled={index === 0}
                                            style={{ backgroundColor: 'rgb(61, 113, 217)' }}
                                            onClick={() => moveFieldUp(index)}
                                        >
                                            <i className='fa fa-arrow-up' />
                                        </Button>
                                        <Button
                                            disabled={index === activeFilters.length - 1}
                                            style={{ backgroundColor: 'rgb(61, 113, 217)' }}
                                            onClick={() => moveFieldDown(index)}
                                        >
                                            <i className='fa fa-arrow-down' />
                                        </Button>
                                        <Button
                                            style={{ backgroundColor: '#AA0000' }}
                                            onClick={() => removeFieldRow(index)}
                                        >
                                            <i className='fa fa-trash' />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            }
        </>
    )
}
