import React, { useState, useEffect } from 'react'
import { css } from '@emotion/css'
import { GrafanaTheme2 } from '@grafana/data'
import { SegmentAsync, useStyles2 } from '@grafana/ui'
import { SegmentSectionWithIcon } from 'components/SegmentSectionWithIcon'
import { PerformanceStringPropertyProps, PerformanceStringPropertyState } from './types'
import { isTemplateVariable } from '../../lib/variableHelpers'

export const defaultPerformanceStringState = {
    node: { id: '' },
    resource: { id: '', stringPropertyAttributes: {} },
    stringProperty: { label: '', value: '' }
}

const getStyles = (theme: GrafanaTheme2) => ({
    spacer: css`
        margin-top: ${theme.spacing(1)};
    `,
})

export const PerformanceStringProperty: React.FC<PerformanceStringPropertyProps> = ({
    query,
    updateQuery,
    loadNodes,
    loadResourcesByNode,
    loadResourcesForStringPropertyState,
    loadStringPropertiesForState
}) => {
    const [performanceState, setPerformanceState] = useState<PerformanceStringPropertyState>(query.stringPropertyState || defaultPerformanceStringState)
    const s = useStyles2(getStyles)

    const setPerformanceStateProperty = (propertyName: string, propertyValue: unknown) => {
        setPerformanceState({ ...performanceState, [propertyName]: propertyValue })
    }

    useEffect(() => {
        if (performanceState?.stringProperty){
            updateQuery(performanceState)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [performanceState])

    return (
        <>
            <div className={s.spacer} />
            <SegmentSectionWithIcon label='Node' icon='tree'>
                <SegmentAsync
                    value={performanceState?.node}
                    placeholder='Select Node'
                    loadOptions={loadNodes}
                    onChange={(value) => {
                        setPerformanceStateProperty('node', value)
                    }}
                />
            </SegmentSectionWithIcon>
            <div className={s.spacer} />

            {
                (performanceState?.node?.id  || isTemplateVariable(performanceState?.node)) &&

                <SegmentSectionWithIcon label='Resource' icon='leaf'>
                    <SegmentAsync
                        value={performanceState?.resource}
                        placeholder='Select Resource'
                        loadOptions={() => loadResourcesForStringPropertyState(performanceState)}
                        onChange={(value) => {
                            setPerformanceStateProperty('resource', value)
                        }}
                    />
                </SegmentSectionWithIcon>
            }
            <div className={s.spacer} />
            {
                (performanceState?.node?.id || isTemplateVariable(performanceState?.node)) && 
                (performanceState?.resource?.id || isTemplateVariable(performanceState?.resource)) &&

                <SegmentSectionWithIcon label='String Property' icon='tag'>
                    <SegmentAsync
                        value={performanceState?.stringProperty}
                        placeholder='Select String Property'
                        loadOptions={() => loadStringPropertiesForState(performanceState)}
                        onChange={(value) => {
                            setPerformanceStateProperty('stringProperty', value)
                        }}
                    />
                </SegmentSectionWithIcon>
            }
        </>
    )
}
