import React, { useEffect, useState } from 'react'
import { SelectableValue } from '@grafana/data'
import { Segment, SegmentAsync, SegmentInput } from '@grafana/ui'
import { SegmentSectionWithIcon } from 'components/SegmentSectionWithIcon'
import { ValueOverrideSwitch } from 'components/ValueOverrideSwitch'
import { getTemplateVariables, isTemplateVariable } from 'lib/variableHelpers'
import { OnmsResourceDto } from '../../lib/api_types'
import { PerformanceAttributeItemState, PerformanceAttributeState } from './types'

export interface PerformanceAttributesProps {
    enableInputValueOverrideComponents: boolean
    performanceAttributeState: PerformanceAttributeState
    updateQuery: Function
    loadNodes: (query?: string | undefined) => Promise<Array<SelectableValue<PerformanceAttributeItemState>>>
    loadResourcesByNode: (value: any) => Promise<OnmsResourceDto[]>
    loadAttributesByResourceAndNode: Function
}

export const defaultPerformanceState: PerformanceAttributeState = {
    node: { id: '' },
    resource: { id: '' },
    attribute: { name: '' },
    subAttribute: '',
    fallbackAttribute: { name: '' },
    aggregation: {},
    label: ''
}

export const PerformanceAttribute: React.FC<PerformanceAttributesProps> = ({
    enableInputValueOverrideComponents,
    performanceAttributeState,
    updateQuery,
    loadNodes,
    loadResourcesByNode,
    loadAttributesByResourceAndNode
}) => {
    const [performanceState, setPerformanceState] = useState<PerformanceAttributeState>(performanceAttributeState)
    const [isNodeOverride, setIsNodeOverride] = useState<boolean>(false)
    const [nodeOverrideValue, setNodeOverrideValue] = useState<string>('')
    const [isResourceOverride, setIsResourceOverride] = useState<boolean>(false)
    const [resourceOverrideValue, setResourceOverrideValue] = useState<string>('')

    useEffect(() => {
        // Note: this could result in invalid queries if not all parameters have been selected.
        // However, not updating the query results in old parameters still being used. This way,
        // query will always be in sync with UI
        if (performanceState) {
            updateQuery(performanceState)
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [performanceState])

    useEffect(() => {
      if (isNodeOverride) {
        const propertyValue = { id: nodeOverrideValue, label: nodeOverrideValue }
        setPerformanceStateNode(propertyValue)
      } else {
        setPerformanceStateNode(performanceState?.node)
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isNodeOverride, nodeOverrideValue])

    useEffect(() => {
      if (isResourceOverride) {
        const propertyValue = { id: resourceOverrideValue, label: resourceOverrideValue }
        setPerformanceStateProperty('resource', propertyValue)
      } else {
        setPerformanceStateProperty('resource', performanceState?.resource)
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isResourceOverride, resourceOverrideValue])

    const loadNodesAndVariables = async (query?: string) => {
      const nodeItems = await loadNodes(query)
      const variables = getTemplateVariables()
      const result = variables.map(x => { return { id: `$${x.name}`, label: `$${x.name}` }})
      nodeItems.forEach(x => result.push(x as any))

      return result
    }

    const loadResourcesByNodeAndVariables = async (value?: string | number) => {
      const resources = await loadResourcesByNode(value)

      const variables = getTemplateVariables()
      const result = variables.map(x => { return { id: `$${x.name}`, label: `$${x.name}` }})
      resources.forEach(x => result.push(x as any))

      return result
    }

    const setPerformanceStateProperty = (propertyName: string, propertyValue: unknown) => {
        setPerformanceState({...performanceState, [propertyName]: propertyValue})
    }

    /**
     * If node changed, need to repopulate the resource part of the query with resources
     * for the newly selected node.
     * Attempt to find the same resource label as existing; otherwise the new node
     * doesn't have the same resources, so clear them
     */
    const setPerformanceStateNode = async (propertyValue: unknown) => {
      if (!propertyValue) {
        return
      }

    const propertyValueAny = propertyValue as any

    const node = {
        id: String(propertyValueAny.id ?? ''),
        label: String(propertyValueAny.label ?? '')
    	} as PerformanceAttributeItemState	
     

      const resourceOptions: OnmsResourceDto[] = await loadResourcesByNode(node.id || node.label)
      const existingLabel = performanceState?.resource?.label

      let resource = performanceState?.resource ?? {}

      if (!isTemplateVariable(resource)) {
          const resourceOption = (existingLabel && resourceOptions && resourceOptions.filter(r => r.label === existingLabel)?.[0]) || null

          if (resourceOption?.id && resourceOption?.label) {
            resource = {
              id: resourceOption.id ?? '',
              label: resourceOption.label ?? ''
            }
          }
      }

      const state = {
        ...performanceState,
        node,
        resource
      } as PerformanceAttributeState

      setPerformanceState(state)
    }

    return (
        <>
            <style>
                {`
                .pf-query-editor .pf-query-editor-attr-switch-field .pf-query-editor-switch-wrapper {
                    display: flex;
                    align-items: center;
                    height: 32px;
                    width: 32px;
                }
                .pf-query-editor .pf-query-editor-attr-switch-field .pf-query-editor-switch-wrapper label {
                    min-width: 32px;
                    width: 32px;
                }
            `}
            </style>
            <div className='spacer' />
            <SegmentSectionWithIcon label='Node' icon='tree'>
                <SegmentAsync
                    value={performanceState?.node}
                    placeholder='Select Node'
                    loadOptions={loadNodesAndVariables}
                    reloadOptionsOnChange={true}
                    onChange={(value) => {
                      (async () => {
                        await setPerformanceStateNode(value)
                      })()
                    }}
                />
                { enableInputValueOverrideComponents &&
                  <ValueOverrideSwitch
                    override={isNodeOverride}
                    value={nodeOverrideValue}
                    setOverride={setIsNodeOverride}
                    setValue={setNodeOverrideValue}
                  />
                }
            </SegmentSectionWithIcon>

            <div className='spacer' />
            {
                (performanceState?.node?.id || performanceState?.node?.label) &&
                <SegmentSectionWithIcon label='Resource' icon='leaf'>
                    <SegmentAsync
                        value={performanceState?.resource}
                        placeholder='Select Resource'
                        loadOptions={() => loadResourcesByNodeAndVariables(performanceState?.node?.id || performanceState?.node?.label)}
                        onChange={(value) => { setPerformanceStateProperty('resource', value) }}
                    />
                    { enableInputValueOverrideComponents &&
                      <ValueOverrideSwitch
                        override={isResourceOverride}
                        value={resourceOverrideValue}
                        setOverride={setIsResourceOverride}
                        setValue={setResourceOverrideValue}
                      />
                    }
                </SegmentSectionWithIcon>
            }
            <div className='spacer' />
            {
                (performanceState?.node?.id || performanceState?.node?.label) &&
                (performanceState?.resource?.id || performanceState?.resource?.label) &&
                <>
                    <SegmentSectionWithIcon label='Attribute' icon='tag'>
                        <SegmentAsync
                            value={performanceState?.attribute}
                            placeholder='Select Attribute'
                            loadOptions={() => loadAttributesByResourceAndNode(performanceState?.node, performanceState?.resource)}
                            onChange={(value) => {
                                setPerformanceStateProperty('attribute', value)
                            }}
                        />
                    </SegmentSectionWithIcon>
                    <div className='spacer' />
                    <SegmentSectionWithIcon label='Sub-Attribute' icon='flash'>
                        <SegmentInput
                            value={performanceState?.subAttribute || ''}
                            placeholder='Sub-Attribute'
                            onChange={(value) => {
                                setPerformanceStateProperty('subAttribute', value)
                            }}
                        />
                    </SegmentSectionWithIcon>
                    <div className='spacer' />
                    <SegmentSectionWithIcon label='Fallback Attribute' icon='tag'>
                        <SegmentAsync
                            value={performanceState?.fallbackAttribute}
                            placeholder='Fallback Attribute'
                            loadOptions={() => loadAttributesByResourceAndNode(performanceState?.node, performanceState?.resource)}
                            onChange={(value) => {
                                setPerformanceStateProperty('fallbackAttribute', value)
                            }}
                        />
                    </SegmentSectionWithIcon>
                    <div className='spacer' />
                    <SegmentSectionWithIcon label='Aggregation' icon='calendar'>
                        <Segment
                            value={performanceState?.aggregation}
                            placeholder='Aggregation'
                            options={[{ label: 'Average' }, { label: 'Min' }, { label: 'Max' }, { label: 'Last' }]}
                            onChange={(value) => {
                                setPerformanceStateProperty('aggregation', value)
                            }}
                        />
                    </SegmentSectionWithIcon>
                </>
            }
            <div className='spacer' />
            <SegmentSectionWithIcon label='Label' icon='font'>
                <SegmentInput
                    value={performanceState?.label}
                    placeholder='Series Label'
                    onChange={(value) => setPerformanceStateProperty('label', value)}
                />
            </SegmentSectionWithIcon>
        </>
    )
}
