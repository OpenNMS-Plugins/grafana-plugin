import React, { useEffect } from 'react'
import { css } from '@emotion/css'
import { GrafanaTheme2 } from '@grafana/data'
import { useStyles2 } from '@grafana/ui'
import { EntityClause } from './EntityClause'
import { ClauseActionType, OnmsEntityType, SearchOption } from './types'
import { API } from 'opennms'

interface EntityClauseEditorProps {
    setFilter: (filter: API.Filter) => void,
    loading: boolean
    propertiesAsArray: SearchOption[],
    clauses: any[],
    dispatchClauses: any
}

export const EntityClauseEditor = ({ setFilter, loading, propertiesAsArray, clauses, dispatchClauses }: EntityClauseEditorProps) => {
    const getStyles = (theme: GrafanaTheme2) => ({
        spacer: css`
        margin-top: ${theme.spacing(2)};
        margin-bottom: ${theme.spacing(2)};
        `,
    })

    const s = useStyles2(getStyles)

    useEffect(() => {
        const updatedFilter = new API.Filter();
        updatedFilter.limit = 10;

        // Build the filter. This could be extracted to a helper function.
        clauses.forEach((d, i) => {
            // comparator could be: '{ id, label }' or else '{ value: { i, l } }'
            let comparatorValue = clauses[i].comparator?.value

            if (!comparatorValue && clauses[i].comparator?.id) {
              comparatorValue = {
                id: clauses[i].comparator.id,
                label: clauses[i].comparator.label,
                l: clauses[i].comparator.label,
                i: clauses[i].comparator.id
              }
            }

            if ((d.type === OnmsEntityType.AND || d.type === OnmsEntityType.FIRST) && comparatorValue) {
                updatedFilter.withAndRestriction(
                    new API.Restriction(
                        clauses[i].attribute?.value?.id,
                        comparatorValue,
                        clauses[i].comparedString || clauses[i].comparedValue.value
                    )
                )
            } else if (d.type === OnmsEntityType.OR && comparatorValue) {
                updatedFilter.withOrRestriction(
                    new API.Restriction(
                        clauses[i].attribute?.value?.id,
                        comparatorValue,
                        clauses[i].comparedString || clauses[i].comparedValue.value
                    )
                )
            }
        })
        
        setFilter(updatedFilter)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clauses])

    return (
        <>
            {clauses.map((clause, index) => {
                return (
                    <>
                        <EntityClause
                            key={index}
                            clause={clauses[index]}
                            setAttribute={(col, val) => dispatchClauses({ type: ClauseActionType.update, index: col, property: 'attribute', value: val })}
                            setComparator={(col, val) => dispatchClauses({ type: ClauseActionType.update, index: col, property: 'comparator', value: val })}
                            setComparedValue={(col, val) => dispatchClauses({ type: ClauseActionType.update, index: col, property: 'comparedValue', value: val })}
                            setComparedString={(col, val) => dispatchClauses({ type: ClauseActionType.update, index: col, property: 'comparedString', value: val })}
                            setClauseType={(col, val) => dispatchClauses({ type: ClauseActionType.update, index: col, property: 'type', value: val })}
                            dispatchClauses={dispatchClauses}
                            loading={loading}
                            index={index}
                            propertiesAsArray={propertiesAsArray}
                            hasMultipleClauses={clauses.length > 1}
                        />

                        <div className={s.spacer} />
                    </>
                )
            })}
        </>)
};
