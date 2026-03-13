import { SelectableValue } from '@grafana/data'
import { Segment, SegmentInput, Spinner, Button, InlineFieldRow } from '@grafana/ui'
import React, { useEffect, useState } from 'react'
import { EntityClauseLabel } from './EntityClauseLabel'
import { Comparator, EntityClauseProps, OnmsEntityType, OnmsEntityNestType, SearchOption, ClauseActionType } from './types'
import { API } from 'opennms'

export const EntityClause = ({
    clause,
    dispatchClauses,
    propertiesAsArray,
    setAttribute,
    setComparator,
    setComparedValue,
    setComparedString,
    setClauseType,
    loading,
    index,
    hasMultipleClauses
}: EntityClauseProps) => {

    const createComparatorOptions = () => {
        return Object.keys(API.Comparators).map(key => API.Comparators[key])
    }

    const [comparatorOptions, setComparatorOptions] = useState<Array<SelectableValue<Comparator>>>(createComparatorOptions());
    const [comparedOptions, setComparedOptions] = useState<Array<SelectableValue<string>>>([]);

    useEffect(() => {
        const { values, comparators } = getValuesAndComparatorsFromClause();

        if (values) {
            buildOptionsFromAttributeValues(values);
        }

        if (comparators) {
            setComparatorOptions(comparators)
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clause.attribute])

    const buildOptionsFromAttributeValues = (values: string[]) => {
        values = { ...values };
        const options = Object.keys(values).map((i) => {
            const val = values?.[i] || ''
            return { value: val, label: val }
        })
        setComparedOptions(options)
    }

    const getValuesAndComparatorsFromClause = () => {
        let values = clause.attribute?.value?.values;
        let comparators = clause.attribute?.value?.type?.comparators?.map((c) => (
            {
                label: c.l,
                value: c
            }
        ))
        if (values && !comparators) {
            const comp = API.Comparators.EQ
            comparators = [{ label: comp.label, value: comp }]
        }
        return { values, comparators }
    }

    const getInputTypeFromAttributeType = (attribute: SearchOption | undefined) => {
        let type = 'text';
        if (attribute?.value?.type?.i === 'TIMESTAMP') {
            type = 'datetime-local'
        } else if (attribute?.value?.type?.i === 'INTEGER') {
            // leaving this as 'text' for now, otherwise user cannot input template variable
            // type = 'number'
        }
        return type;
    }

    const resetOrRemoveClause = (col: number) => {
        if (clause.type !== OnmsEntityType.FIRST || hasMultipleClauses) {
            dispatchClauses({ type: ClauseActionType.delete, index: col })
        }
        else {
            const comp = API.Comparators.EQ
            setAttribute(col, {})
            setComparator(col, { label: comp.label, value: comp })
            setComparedString(col, '')
            setComparedValue(col, {})
        }
    }

    return (
        <>
        <style>
          {`
            .entity-attr-value label.entity-attr-value-segment, label.entity-attr-value-segment-input, input {
              min-width: 100px;
            }
          `}
        </style>
        <InlineFieldRow>
            <EntityClauseLabel
                type={clause.type}
                nestingType={clause.nestingType}
                index={index}
                setClauseType={setClauseType}
            />
            <Segment
                placeholder='select attribute'
                value={clause.attribute}
                onChange={(text) => {
                    setAttribute(index, text);
                }}
                allowEmptyValue={false}
                options={propertiesAsArray.map((prop) => {
                    return {
                        label: prop.label,
                        type: prop.type,
                        value: {
                            id: prop.id,
                            label: prop.label,
                            name: prop.name,
                            orderBy: prop.orderBy,
                            type: prop.type,
                            values: prop.values
                        }
                    }
                })}
            />
            <Segment
                allowEmptyValue={false}
                value={clause.comparator}
                onChange={val => {
                    setComparator(index, val)
                }}
                options={comparatorOptions}
            />
            <div className='entity-attr-value'>
            {clause.attribute?.value?.values && Object.keys(clause.attribute?.value.values).length > 0 ?
                <Segment
                    className='entity-attr-value-segment'
                    allowEmptyValue={false}
                    value={clause.comparedValue}
                    onChange={(value) => {
                        // clear any existing string value, set new SelectableValue
                        setComparedString(index, '')
                        setComparedValue(index, value)
                    }}
                    options={comparedOptions}
                /> :
                <SegmentInput
                    className='entity-attr-value-segment-input'
                    placeholder='select value'
                    type={getInputTypeFromAttributeType(clause.attribute)}
                    onChange={(value) => {
                        const inputType = getInputTypeFromAttributeType(clause.attribute)

                        // clear any existing SelectableValue, set new string value
                        // if this value is a date / timestamp, convert to ISO string so that
                        // queries are sent correctly
                        setComparedValue(index, {})

                        const inputValue = (value && inputType.startsWith('date')) ? new Date(value).toISOString() : value
                        setComparedString(index, inputValue || '')
                    }}
                    value={clause.comparedString}
                />
            }
            </div>
            {loading && <div style={{ display: 'flex', alignItems: 'center' }}>
                <Spinner />
            </div>
            }
            {clause.nestingType === OnmsEntityNestType.TOP ? <>
                <Button onClick={() => dispatchClauses({ type: ClauseActionType.addClause, 'index': index })} size='xs' style={{ marginRight: '5px' }}>+</Button>
                <Button onClick={() => dispatchClauses({ type: ClauseActionType.addNestedClause, 'index': index })} size='xs'><i className='fa fa-file'></i></Button>
                <Button onClick={() => resetOrRemoveClause(index)} size='xs' style={{ marginLeft: '5px' }}>-</Button>
            </> : <>
                <Button onClick={() => dispatchClauses({ type: ClauseActionType.addSubClause, 'index': index })} size='xs' style={{ marginRight: '5px' }}>+</Button>
                <Button onClick={() => dispatchClauses({ type: ClauseActionType.delete, 'index': index })} size='xs'>-</Button>
            </>
            }
        </InlineFieldRow>
      </>
    )
}
