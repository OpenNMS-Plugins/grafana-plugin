import React from 'react'
import { SelectableValue } from '@grafana/data'
import { Combobox, ComboboxOption, Stack, Input, MultiCombobox } from '@grafana/ui'
import { FieldDisplay } from 'components/FieldDisplay'
import { ALL_SELECTION_VALUE } from 'constants/constants'
import { ActiveFilter, FilterSelectableValues, OnmsMetricFindValue } from '../../datasources/entity-ds/types'

interface FilterPanelControlFieldProps {
  filter: ActiveFilter
  getFilterId: (filter: ActiveFilter) => string
  index: number
  inputChanged: (e: any, filter: ActiveFilter) => void
  isHorizontal?: boolean
  metricValues: Array<[string, OnmsMetricFindValue[]]>
  selectableValues: FilterSelectableValues[]
  selectChanged: (value: (SelectableValue | SelectableValue[]), filter: ActiveFilter) => void
}

export const FilterPanelControlField: React.FC<FilterPanelControlFieldProps> = (props) => {
    const filterDisplayLabel = (filter: ActiveFilter, index: number) => {
        const altLabel = filter.altColumnLabel

        if (altLabel) {
            return altLabel
        }

        return `${filter.entity.label || ''}: ${filter.attribute.label || ''}`
    }

    const getInputSelectableValue = (filter: ActiveFilter) => {
        const filterId = props.getFilterId(filter)
        const selVals = props.selectableValues.find(v => v.filterId === filterId)

        if (selVals && selVals.values?.length > 0) {
            return selVals.values[0].value || ''
        }

        return ''
    }

    const getSelectSelectableValues = (filter: ActiveFilter) => {
        const filterId = props.getFilterId(filter)
        const selVals = props.selectableValues.find(v => v.filterId === filterId)

        return selVals?.values ? selVals.values.map(v => ({ label: v.label, value: v.value } as ComboboxOption<string | number>)) : []
    }

    const generateFilterSelectOptions = (filter: ActiveFilter) => {
        const filterId = props.getFilterId(filter)
        const isMulti = filter.selectionType?.label === 'Multi'
        const [key, currentValues] = props.metricValues.find(([k,v]) => k === filterId) || []

        if (key && currentValues) {
            const values = currentValues.map(v => ({
                label: v.text,
                value: v.value || ''
            } as ComboboxOption<string | number>))

            // Single select dropdown add 'All'
            // For multi-select, user would just not select anything
            if (!isMulti) {
                const allValue = { label: 'All', value: ALL_SELECTION_VALUE}
                return [allValue, ...values]
            }

            return values
        }

        return []
    }

    return (
      <>
        <style>
        {
          `
          .filter-panel-horizontal-layout div[class$='horizontal-group'] {
            align-items: baseline;
          }
          `
        }
        </style>

        <div className={ props.isHorizontal ? 'filter-panel-horizontal-layout' : '' }>
          <Stack direction={props.isHorizontal ? 'row' : 'column'} key={props.getFilterId(props.filter)}>
              <FieldDisplay>{filterDisplayLabel(props.filter, props.index)}</FieldDisplay>
              { props.filter.selectionType?.label === 'Text' &&
                <Input
                  value={getInputSelectableValue(props.filter)}
                  onChange={(e) => props.inputChanged(e, props.filter)}
                />
              }
              { props.filter.selectionType?.label !== 'Text' && props.filter.selectionType?.label !== 'Multi' &&
                <Combobox
                  minWidth={100}
                  width='auto'
                  options={generateFilterSelectOptions(props.filter)}
                  value={getInputSelectableValue(props.filter)}
                  onChange={(value) => props.selectChanged(value as SelectableValue<string | number>, props.filter)} />
              }
              {  props.filter.selectionType?.label === 'Multi' && 
                <MultiCombobox
                  minWidth={100}
                  width='auto'
                  options={generateFilterSelectOptions(props.filter)}
                  value={getSelectSelectableValues(props.filter)}
                  onChange={(value) => props.selectChanged(value, props.filter)} />
              }
          </Stack>
        </div>
    </>
  )
}
