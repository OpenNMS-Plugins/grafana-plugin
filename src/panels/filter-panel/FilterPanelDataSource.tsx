import React from 'react'
import { SelectableValue } from '@grafana/data'
import { Combobox, ComboboxOption, InlineField } from '@grafana/ui'
import { GrafanaDatasource, useDatasources } from 'hooks/useDataSources'

interface FilterPanelDataSourceProps {
    datasource?: SelectableValue<GrafanaDatasource>,
    onChange: Function
}

export const FilterPanelDataSource: React.FC<FilterPanelDataSourceProps> = ({ datasource, onChange }) => {
    const allowedDatasources = ['opennms-entity-datasource']
    const { datasources } = useDatasources();
    const entityDatasources = datasources?.filter((d) => allowedDatasources.includes(d.type))
    const comboOptions: Array<ComboboxOption<string>> = entityDatasources?.map(d => ({ label: d.name, value: d.id }))

    return (
        <InlineField label='Data source entity'>
            <div style={{ display: 'flex', gap: '10px' }}>
                <Combobox
                    options={comboOptions}
                    onChange={(e) => onChange(entityDatasources?.find(d => d.id === e.value))}
                    value={{ label: datasource?.label ?? '', value: datasource?.id ?? '' }} />
            </div>
        </InlineField>
    )
}
