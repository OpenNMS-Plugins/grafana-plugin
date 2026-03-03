import { useState, useEffect } from 'react'
import { DataFrame, Field } from '@grafana/data'
import cloneDeep from 'lodash/cloneDeep'
import { AlarmTableColumnSizeItem } from '../AlarmTableTypes'
import { OnmsQueryResultMeta } from 'datasources/types'

/**
 * Adds customizations to the series data before handing it to the Table display component.
 * Filters and sorts columns, adds cell background color, etc.
 * @param oldProperties DataFrame / series data
 * @param alarmTable Alarm Table Panel options - the 'alarmTable' from AlarmTableControlProps
 */
export const useAlarmProperties = (oldProperties: DataFrame, alarmTable) => {

    const [filteredPropState, setFilteredPropState] = useState(cloneDeep(oldProperties) as DataFrame)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(0)

    useEffect(() => {
        if (!oldProperties || !oldProperties.fields || !oldProperties.fields.length) {
          return
        }

        const filteredProps = cloneDeep(oldProperties)
        const totalRows = filteredProps.fields[0].values.length
        const rowsPerPage = Number(alarmTable.alarmTablePaging?.rowsPerPage || 10)

        // map of column names to override width, if activa
        const columnSizeMap = new Map<string,number>()

        if (alarmTable.alarmTableColumnSizes?.active) {
          (alarmTable.alarmTableColumnSizes?.columnSizes as AlarmTableColumnSizeItem[])?.forEach(col => {
            columnSizeMap.set(col.fieldName, col.width)
          })
        }

        if (filteredProps && (filteredProps.meta as OnmsQueryResultMeta)?.entity_metadata && filteredProps.name && filteredProps.name === 'alarms') {
            // Allow background color for severity column.
            if (alarmTable?.alarmTableAlarms?.styleWithSeverity?.value === 1) {
                filteredProps.fields.forEach((field) => {
                    if (field.name === 'Severity') {
                        field.config.custom = Object.assign(field.config.custom || {}, { displayMode: 'color-background' })
                    }
                })
            } 

            // Filter our columns according to our configured approved fields.
            filteredProps.fields = filteredProps.fields.filter((fil) => {
                let shouldIncludeThisField = true

                if (alarmTable?.alarmTableData) {
                    shouldIncludeThisField = !!alarmTable?.alarmTableData.columns?.find((col) => col.label === fil.name)
                }

                return shouldIncludeThisField
            })

            // Make any custom column width overrides
            if (columnSizeMap.size) {
              filteredProps.fields.forEach((field) => {
                if (columnSizeMap.has(field.name)) {
                  field.config.custom = Object.assign(field.config.custom || {}, { width: columnSizeMap.get(field.name) })
                }
              })
            }

            // Sort our columns based on the user provided order
            filteredProps.fields = filteredProps.fields.sort((f1, f2) => {
                const colIndex1 = alarmTable?.alarmTableData?.columns?.findIndex((col) => col.label === f1.name)
                const colIndex2 = alarmTable?.alarmTableData?.columns?.findIndex((col) => col.label === f2.name)
                return colIndex1 - colIndex2
            })

            if (rowsPerPage > 0 && totalRows > rowsPerPage) {
                const myPage = page

                filteredProps.fields = filteredProps.fields.map((field: Field) => {
                    const values = field.values
                    const start = (myPage - 1) * rowsPerPage
                    const end = start + rowsPerPage

                    const sliced = values.length > start ? values.slice(start, end) : []
                    field.values = sliced

                    return field
                })

                filteredProps.length = filteredProps.fields[0]?.values.length || 0
            } else {
                filteredProps.length = totalRows
            }

            setFilteredPropState(filteredProps)
            setTotalPages(Math.ceil(totalRows / rowsPerPage))
        }
    }, [
      oldProperties,
      page,
      alarmTable?.alarmTableData,
      alarmTable.alarmTablePaging?.rowsPerPage,
      alarmTable?.alarmTableAlarms?.styleWithSeverity,
      alarmTable?.alarmTableColumnSizes
    ])

    useEffect(() => {
        const scrollView = document.querySelector('.scroll .scrollbar-view')
        if (alarmTable?.alarmTablePaging?.scroll) {
            scrollView?.classList.remove('no-scroll')
        } else {
            scrollView?.classList.add('no-scroll')
        }
    }, [alarmTable?.alarmTablePaging?.scroll])

    return { filteredProps: filteredPropState, page, setPage, totalPages }
}
