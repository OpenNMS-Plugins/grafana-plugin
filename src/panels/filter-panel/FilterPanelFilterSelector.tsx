import React, { useState } from 'react'
import { css } from '@emotion/css'
import { GrafanaTheme2 } from '@grafana/data'
import {
    Button,
    Combobox,
    ComboboxOption,
    InlineField,
    InlineFieldRow,
    Label,
    Stack,
    Switch,
    useStyles2
} from '@grafana/ui'
import { GrafanaDatasource } from 'hooks/useDataSources'
import { useEntities } from 'hooks/useEntities'
import { useEntityProperties } from 'hooks/useEntityProperties'
import { useFilterData } from '../../hooks/useFilterData'
import { ActiveFilter } from '../../datasources/entity-ds/types'
import { ClientDelegate } from 'lib/client_delegate'

interface FilterPanelFilterSelectorProps {
    datasource?: GrafanaDatasource,
    activeFilters: ActiveFilter[],
    client?: ClientDelegate,
    onChange: Function
}

export const FilterPanelFilterSelector: React.FC<FilterPanelFilterSelectorProps> =
    ({ datasource, activeFilters, client, onChange }) => {

    const { entities: entityOptions } = useEntities();
    const [entity, setEntity] = useState<ComboboxOption<string>>()
    const [attribute, setAttribute] = useState<ComboboxOption<string>>()
    const [featuredAttributes, setFeaturedAttributes] = useState<boolean>(true)
    const { propertiesAsArray } = useEntityProperties(entity?.label || '', featuredAttributes, client as any)
    const { getFilterId, getFilterIdFromParts } = useFilterData()

    const getStyles = (theme: GrafanaTheme2) => ({
        spacer: css`
            margin-bottom: ${theme.spacing(0.75)};
        `,
    })

    const s = useStyles2(getStyles)

    const isDisabled = () => {
        if (!entity || !attribute || !datasource || attribute.label === 'Select Attribute') {
            return true
        }

        // prevent adding duplicate filters
        const filterId = getFilterIdFromParts({ label: entity.label, value: entity.value }, { label: attribute.label, id: attribute.value, value: attribute.value })
        return activeFilters.some(f => getFilterId(f) === filterId)
    }

    /**
     * Values in propertiesAsArray contains additional properties such as 'valueProvider'
     * which are very large and cause circular references (causing issues with JSON.stringify)
     * and are not needed. We just return the necessary properties here
     */
    const getAttributeOptions = () => {
        return propertiesAsArray.map(p => ({
            id: p.id,
            label: p.label,
            name: p.name,
            orderBy: p.orderBy,
            value: p.value,
            type: p.type
        }))
    }

    const addFilterRow = () => {
        let newFilters: any = []
        if (activeFilters) {
            newFilters = [...activeFilters]
            newFilters.push({ entity, attribute })
        }

        onChange(newFilters)
        setAttribute({ label: 'Select Attribute', value: '' })
    }

    return (
        <>
             <Label style={{ marginTop: 12 }}>
                Filters
            </Label>
            <Stack direction='row'>
                <Combobox placeholder='Entity' options={entityOptions.map(e => ({ label: e.label, value: e.value }))} onChange={(e) => setEntity(e)} value={entity} />
                <Combobox placeholder='Attribute' options={getAttributeOptions().map(o => ({ label: o.label, value: o.id } ))} onChange={(e) => setAttribute(e)} value={attribute} />
                <Button disabled={isDisabled()} onClick={addFilterRow}>Add Filter Row</Button>
            </Stack>
            <div className={s.spacer} />
            <InlineFieldRow>
                <InlineField label='Featured attributes'>
                    <div style={{ display: 'flex', alignItems: 'center', height: '32px' }}>
                        <Switch
                            value={featuredAttributes}
                            onChange={() => setFeaturedAttributes(!featuredAttributes)} />
                    </div>
                </InlineField>
            </InlineFieldRow>
        </>
    )
}
