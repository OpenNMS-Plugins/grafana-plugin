import React, { useState, useEffect } from 'react'
import { css } from '@emotion/css'
import { GrafanaTheme2 } from '@grafana/data'
import { SegmentInput, useStyles2 } from '@grafana/ui';
import { SegmentSectionWithIcon } from 'components/SegmentSectionWithIcon';
import { PerformanceQuery } from './types'

export interface PerformanceExpressionProps {
    query: PerformanceQuery;
    updateQuery: Function;
}

const getStyles = (theme: GrafanaTheme2) => ({
    spacer: css`
        margin-top: ${theme.spacing(1)};
    `,
})

export const PerformanceExpression: React.FC<PerformanceExpressionProps> = ({ query, updateQuery }) => {
    const [expression, setExpression] = useState<string | number>(query.expression || '')
    const [label, setLabel] = useState<string | number>(query.label || '')
    const s = useStyles2(getStyles)

    useEffect(() => {
        updateQuery(expression, label)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expression, label])

    return (
        <>
            <div className={s.spacer} />
            <SegmentSectionWithIcon label='Expression' icon='calendar'>
                <SegmentInput
                    value={expression}
                    placeholder='series expression'
                    onChange={(value) => {
                        if (!label) {
                            setLabel('expression' + query.refId)
                        }
                        setExpression(value);
                    }}
                />
            </SegmentSectionWithIcon>
            <div className={s.spacer} />
            <SegmentSectionWithIcon label='Label' icon='font'>
                <SegmentInput
                    value={label}
                    placeholder='series label'
                    onChange={(value) => {
                        setLabel(value);
                    }}
                />
            </SegmentSectionWithIcon>
        </>
    )
}
