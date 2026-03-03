import React, { useEffect, useState } from 'react'
import { PanelProps, SelectableValue } from '@grafana/data'
import { getDataSourceSrv } from '@grafana/runtime'
import { Stack } from '@grafana/ui'
import { loadFilterEditorData, saveFilterEditorData } from 'lib/localStorageService'
import { FilterControlProps } from './FilterPanelTypes'
import { useFilterData } from '../../hooks/useFilterData'
import { ActiveFilter, FilterEditorData, FilterSelectableValues, OnmsMetricFindValue } from '../../datasources/entity-ds/types'
import { FilterPanelControlField } from './FilterPanelControlField'
import { getFuncNameFromEntityType } from 'lib/function_formatter'

export const FilterPanelControl: React.FC<PanelProps<FilterControlProps>> = (props) => {
    const { getFilterId } = useFilterData()

    // array of metric values for each filter id
    const [metricValues, setMetricValues] = useState<Array<[string, OnmsMetricFindValue[]]>>([])

    // array of selectable values for each filter id
    const [selectableValues, setSelectableValues] = useState<FilterSelectableValues[]>([])

    useEffect(() => {
        const dashboardUid = props.data.request?.dashboardUID || ''
        const filterEditorData = dashboardUid ? loadFilterEditorData(dashboardUid) : null

        if (filterEditorData && filterEditorData.selectableValues) {
            setSelectableValues(filterEditorData.selectableValues)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        const fetchMetricValues = async () => {
            const newMetricValues: Array<[string, OnmsMetricFindValue[]]> = []
            let shouldUpdate = false

            // loop through filters, create metricValues entry for each
            for (const filter of props.options.filterEditor.activeFilters || []) {
                const filterId = getFilterId(filter)
                const [key, values] = metricValues.find(([k,v]) => k === filterId) || []

                if (key) {
                    // key already existed, assume values were already fetched
                    newMetricValues.push([key, values || []])
                } else {
                    // values were not previously retrieved
                    const newValues = await getValuesFromDatasource(filter)
                    newMetricValues.push([filterId, newValues])
                    shouldUpdate = true
                }
            }

            if (shouldUpdate) {
                setMetricValues(newMetricValues)
            }
        }

        fetchMetricValues()

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props])

    const getValuesFromDatasource = async (filter: ActiveFilter) => {
        const grafanaDatasource = props.options.filterEditor?.datasource?.value

        if (grafanaDatasource && grafanaDatasource?.id) {
            const datasourceSrv = getDataSourceSrv()
            const qualifiedDatasource = await datasourceSrv.get(grafanaDatasource)

            if (qualifiedDatasource && qualifiedDatasource.metricFindQuery) {
                const entityFunc = getFuncNameFromEntityType(filter.entity.label ?? '')
                const entity = (filter.entity.label || '').toLowerCase()
                const attr = filter.attribute.id

                if (entity && attr) {
                    // TODO: opts changed from 
                    // const opts = { entityType: entity }
                    // to a LegacyMetricFindQueryOptions which has a:
                    // scopedVars?: ScopedVars;
                    // May need to make additional changes for this to work correctly
                    const opts = { scopedVars: { entityType: { value: entity } } }
                    const query = `${entityFunc}(${attr})`

                    const metricFindValues = await qualifiedDatasource.metricFindQuery(query, opts)

                    // got values from the datasource, store them and set update flag
                    if (metricFindValues.length > 0) {
                        const onmsMetricFindValues = metricFindValues.map(v => {
                            return {
                                id: v['id'] ? v['id'] : '',
                                label: v['label'] ? v['label'] : '',
                                text: v.text,
                                value: v.value,
                            } as OnmsMetricFindValue
                        })

                        return onmsMetricFindValues
                    }
                }
            }
        }

        return []
    }

    const inputChanged = (e, filter: ActiveFilter) => {
        const filterId = getFilterId(filter)
        const newValues = selectableValues.filter(v => v.filterId !== filterId)

        const newValue = {
            label: '',
            value: (e.target.value || '') as string
        }

        const newEntry = {
            filterId,
            values: [newValue]
        } as FilterSelectableValues

        newValues.push(newEntry)
        setSelectableValues(newValues)
        saveFilterPanel(newValues)
    }

    const selectChanged = (value: (SelectableValue | SelectableValue[]), filter: ActiveFilter) => {
        const filterId = getFilterId(filter)
        const newValue = Array.isArray(value) ? value : [value]
        const newValues = selectableValues.filter(v => v.filterId !== filterId)

        const newEntry = {
            filterId,
            values: newValue
        } as FilterSelectableValues

        newValues.push(newEntry)
        setSelectableValues(newValues)
        saveFilterPanel(newValues)
    }

    /**
     * Save filter panel data to localStorage, for use by Entity Datasource when filtering queries.
     */
    const saveFilterPanel = (filterSelectableValues: FilterSelectableValues[]) => {
        if (props.options.filterEditor) {
            const dashboardUid = props.data.request?.dashboardUID || ''

            // store this in options so FilterPanelOptions can retrieve it
            props.options.dashboardUid = dashboardUid

            const filterData: FilterEditorData = {
                dashboardUid,
                ...props.options.filterEditor,
                isHorizontalLayout: props.options.filterEditor.isHorizontalLayout || false,
                selectableValues: filterSelectableValues
            }

            saveFilterEditorData(filterData)
        }
    }

    useEffect(() => {
        saveFilterPanel(selectableValues)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.options.filterEditor])

    return (
      <>
        { props.options.filterEditor.isHorizontalLayout ?
          <div style={{ height: '100%', overflowX: 'auto' }}>
            <Stack direction='row' alignItems='flex-start'>
                {props.options?.filterEditor?.activeFilters.map((filter, index) => {
                  return (
                    <FilterPanelControlField
                      key={getFilterId(filter)}
                      filter={filter}
                      getFilterId={getFilterId}
                      index={index}
                      inputChanged={inputChanged}
                      isHorizontal={true}
                      metricValues={metricValues}
                      selectChanged={selectChanged}
                      selectableValues={selectableValues}
                    />
                  )
                  })}
            </Stack>
          </div>
        :
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <Stack direction='column' alignItems='flex-start'>
                {props.options?.filterEditor?.activeFilters.map((filter, index) => {
                  return (
                    <FilterPanelControlField
                      key={getFilterId(filter)}
                      filter={filter}
                      index={index}
                      getFilterId={getFilterId}
                      inputChanged={inputChanged}
                      isHorizontal={false}
                      metricValues={metricValues}
                      selectChanged={selectChanged}
                      selectableValues={selectableValues}
                    />
                  )
                })}
            </Stack>
          </div>
        }
      </>
  )
}
