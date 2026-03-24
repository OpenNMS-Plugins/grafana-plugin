import React, { useState, useEffect, useReducer } from 'react'
import { css } from '@emotion/css'
import {
    InlineField,
    InlineFieldRow,
    Input,
    Segment,
    SegmentSection,
    Spinner,
    Switch,
    useStyles2
} from '@grafana/ui'
import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { useEntityProperties } from '../../hooks/useEntityProperties';
import { isInteger } from '../../lib/utils'
import { EntityClauseEditor } from './EntityClauseEditor';
import { EntityOrderByEditor } from './EntityOrderByEditor';
import { defaultClause } from './constants';
import { OnmsEntityNestType, OnmsEntityType, OnmsEntityClause, Action, ClauseActionType, EntityQueryEditorProps } from './types';
import { getSmallerAPIFilter } from './EntityHelper';

/**
 * Clause Reducer used with reducer to handle different type of actions that may affect the clauses in the query editor
 * @param clauses array of OnmsEntityClause
 * @param action action being executed
 * @returns updated clauses
 */
const clausesReducer = (clauses: OnmsEntityClause[], action: Action): OnmsEntityClause[] => {
    let newClauses: OnmsEntityClause[] = []
    let newClause: OnmsEntityClause = { ...defaultClause }

    switch (action.type) {
        case ClauseActionType.reset:
            newClauses = [newClause]
            break
        case ClauseActionType.addSubClause:
            newClause.nestingType = OnmsEntityNestType.SUB
            newClause.type = OnmsEntityType.AND
            newClauses = addClause(clauses, newClause, action.index)
            break
        case ClauseActionType.addNestedClause:
            newClause.nestingType = OnmsEntityNestType.NESTED
            newClause.type = OnmsEntityType.AND
            newClauses = addClause(clauses, newClause, action.index)
            break
        case ClauseActionType.addClause:
            newClause.nestingType = OnmsEntityNestType.TOP
            newClause.type = OnmsEntityType.AND
            newClauses = addClause(clauses, newClause, action.index)
            break
        case ClauseActionType.update:
            newClauses = [...clauses]
            newClauses[action.index][action.property] = action.value
            break
        case ClauseActionType.delete:
            newClauses = [...clauses]
            newClauses.splice(action.index, 1)

            if (newClauses[action.index] && newClauses[action.index].type !== clauses[action.index].type) {
                if (newClauses[action.index].nestingType !== clauses[action.index].nestingType) {
                    newClauses[action.index].nestingType = clauses[action.index].nestingType
                }
                newClauses[action.index].type = clauses[action.index].type
            }
            break
        default:
            throw new Error("shouldn't get here")
    }

    return newClauses
}

const addClause = (clauses: OnmsEntityClause[], clause: OnmsEntityClause, index: number): OnmsEntityClause[] => {
    const newClauses = [...clauses]
    newClauses.splice(index + 1, 0, clause)
    return newClauses
}

export const EntityQueryEditor: React.FC<EntityQueryEditorProps> = ({ onChange, query, onRunQuery, datasource, ...rest }) => {
    const client = datasource.client
    const [value, setValue] = useState<SelectableValue<string>>(query.selectType || { label: 'Alarms' })
    const [clauses, dispatchClauses] = useReducer(clausesReducer, query.clauses || [{ ...defaultClause }])
    const [loading, setLoading] = useState(false)
    const [filter, setFilter] = useState(query?.filter || getSmallerAPIFilter())
    const [limit, setLimit] = useState(isInteger(query?.filter?.limit) ? query.filter.limit : 99)
    const [featuredAttributes, setFeaturedAttributes] = useState(true)
    const { propertiesLoading, propertiesAsArray } = useEntityProperties(value.label || '', featuredAttributes, client)

    const getStyles = (theme: GrafanaTheme2) => ({
        spacer: css`
        margin-top: ${theme.spacing(2)};
        margin-bottom: ${theme.spacing(2)};
        `,
        maxInput: css`
        max-width: 150px;
        `,
        biggerLabels: css`
        label {
            min-width: 32px;
        }
        `
    })

    const s = useStyles2(getStyles)

    useEffect(() => {
        if (propertiesLoading) {
            setLoading(true)
        } else {
            setLoading(false);
        }
    }, [propertiesLoading, setLoading])

    useEffect(() => {
        updateQuery()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter])

    const updateQuery = () => {
      onChange({
          ...query,
          selectType: value,
          filter,
          clauses
      })

      onRunQuery()
    }

    const updateLimit = (newLimit) => {
        setLimit(newLimit)
        setFilter({
            ...filter,
            limit: newLimit
        })
    }

    return (<div className={s.biggerLabels}>
        <SegmentSection label='Select'>
            <Segment
                value={value}
                onChange={(item) => {
                    setValue(item);
                    dispatchClauses({ type: ClauseActionType.reset })
                }}
                allowEmptyValue={false}
                options={[
                    { label: 'Alarms' },
                    { label: 'Nodes' },
                    { label: 'IP Interfaces' },
                    { label: 'SNMP Interfaces' },
                    { label: 'Monitored Services' },
                    { label: 'Outages' },
                ]}
            />
            {loading && <div style={{ display: 'flex', alignItems: 'center' }}>
                <Spinner />
            </div>}
        </SegmentSection>
        <div className={s.spacer} />

        <EntityClauseEditor
            clauses={clauses}
            dispatchClauses={dispatchClauses}
            setFilter={setFilter}
            loading={loading}
            propertiesAsArray={propertiesAsArray}
        />

        <EntityOrderByEditor
            filter={filter}
            setFilter={setFilter}
            searchAttributes={propertiesAsArray}
        />

        <div className={s.spacer} />
        <InlineFieldRow>
            <InlineField label='Limit'>
                <Input className={s.maxInput} type='number' value={limit}
                    onChange={(ev) => {
                        const elem = (ev.target as HTMLInputElement)
                        if (elem) {
                            updateLimit(Number(elem.value))
                        }
                    }} />
            </InlineField>
        </InlineFieldRow>
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
    </div>)
}
