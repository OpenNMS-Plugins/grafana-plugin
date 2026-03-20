import React, { useState, useEffect } from 'react'
import { css } from '@emotion/css'
import { GrafanaTheme2, SelectableValue } from '@grafana/data'
import { Segment, SegmentAsync, SegmentInput, useStyles2 } from '@grafana/ui'
import { SegmentSectionWithIcon } from 'components/SegmentSectionWithIcon'
import { PerformanceQuery, PerformanceQueryFilterParameter } from './types'

export interface FilterItem {
  key: string,
  type: string,
  displayName: string,
  description: string,
  required: boolean,
  default: string
}

export interface FilterResponse extends FilterItem {
  parameter: FilterItem[]
}

export interface PerformanceFilterProps {
  query: PerformanceQuery
  updateQuery: Function
  loadFilters: (query?: string | undefined) => Promise<Array<SelectableValue<FilterResponse>>>
}

const getStyles = (theme: GrafanaTheme2) => ({
  spacer: css`
    margin-top: ${theme.spacing(1)};
  `,
})

export const PerformanceFilter: React.FC<PerformanceFilterProps> = ({ query, updateQuery, loadFilters }) => {
  const [filter, setFilter] = useState<SelectableValue<FilterResponse>>(query.filter)
  const [filterState, setFilterState] = useState<Record<string, {value: any, filter: any}>>(query.filterState || {})
  const s = useStyles2(getStyles)

  const updateFilterState = (propertyName: string | undefined, value: {value: any, filter: any}) => {
    if (propertyName !== undefined) {
      setFilterState({ ...filterState, [propertyName]: value })
    }
  }

  const paramValueOrDefault = (param: PerformanceQueryFilterParameter, defaultValue: any = '') => {
    let value = param.default

    if (param.key && filterState[param.key] !== undefined) {
      value = filterState[param.key]?.value
    }

    return (value === undefined || value === null) ? defaultValue : value
  }

  useEffect(() => {
    updateQuery(filter, filterState)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterState, filter])

  return (
    <>
      <div className={s.spacer} />
      <SegmentSectionWithIcon label='Filter' icon='filter'>
        <SegmentAsync
          value={filter}
          placeholder='Select Filter'
          loadOptions={loadFilters}
          onChange={(value) => {
            setFilter(value)
          }}
        />
      </SegmentSectionWithIcon>
      { filter?.parameter?.map((param: PerformanceQueryFilterParameter, index) => {
        return (
            <>
              <div className={s.spacer} />
              <SegmentSectionWithIcon label={param.displayName || ''} key={index} >
                {param.type === 'boolean' &&
                  <Segment
                    placeholder={param.key}
                    value={paramValueOrDefault(param, 'false')}
                    onChange={(value: SelectableValue<string>) => {
                      updateFilterState(param.key, { value: value?.value, filter: param })
                    }}
                    options={[{ label: 'True', value: 'true'}, { label: 'False', value: 'false' }]}
                  />
                }
                { (param.type === 'double' || param.type === 'int' || param.type === 'long') &&
                  <SegmentInput
                    type='number'
                    value={paramValueOrDefault(param, 0)}
                    placeholder={param.key}
                    onChange={(value) => {
                      updateFilterState(param.key, { value, filter: param })
                    }}
                  />
                }
                { (param.type !== 'double' && param.type !== 'boolean' && param.type !== 'int' && param.type !== 'long') &&
                  <SegmentInput
                    value={paramValueOrDefault(param)}
                    placeholder={param.key}
                    onChange={(value) => {
                      updateFilterState(param.key, { value, filter: param })
                    }}
                  />}
                <p style={{ margin: 0, paddingTop: 6, paddingLeft: 5 }}>
                  { param.description }
                </p>
            </SegmentSectionWithIcon>
          </>
        )
      })}
    </>
  )
}
