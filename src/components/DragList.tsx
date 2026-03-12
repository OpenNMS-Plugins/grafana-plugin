import React from 'react'
import { SelectableValue } from '@grafana/data'

interface DragListProps {
    values: Array<SelectableValue<string | number>>,
    onChange: (newValues: Array<SelectableValue<string | number>>) => void
    shouldDisplayRemove?: (val: SelectableValue<string | number>) => boolean
}

export const DragList: React.FC<DragListProps> = ({ values, onChange, shouldDisplayRemove }) => {
    const moveUp = (e: React.UIEvent<HTMLSpanElement>, index: number) => {
        const newValues = [...values]
        const movingValue = newValues.splice(index, 1);
        newValues.splice(index - 1, 0, movingValue[0])
        onChange(newValues)
    }

    const moveDown = (e: React.UIEvent<HTMLSpanElement>, index: number) => {
        const newValues = [...values]
        const movingValue = newValues.splice(index, 1);
        newValues.splice(index + 1, 0, movingValue[0])
        onChange(newValues)
    }

    const remove = (e: React.UIEvent<HTMLSpanElement>, index: number) => {
        const newValues = [...values]
        newValues.splice(index, 1);
        onChange(newValues)
    }

    const isEnterOrSpace = (key: string) => {
        return key === ' ' || key === 'Enter'
    }

    const keyUp = (e: React.KeyboardEvent<HTMLSpanElement>, index: number) => {
        if (isEnterOrSpace(e.key)) {
            moveUp(e, index)
        }
    }

    const keyDown = (e: React.KeyboardEvent<HTMLSpanElement>, index: number) => {
        if (isEnterOrSpace(e.key)) {
            moveDown(e, index)
        }
    }

    const keyDelete = (e: React.KeyboardEvent<HTMLSpanElement>, index: number) => {
        if (isEnterOrSpace(e.key)) {
            remove(e, index)
        }
    }

    return (
        <div className='onms-drag-list'>
            <style>
                {
                    `
                    .onms-drag-buttons {
                        display:flex;
                        margin-left:auto;
                    }
                    .onms-drag-list {
                        max-width:360px;
                    }
                    .onms-drag-button {
                        background-color:rgb(61, 113, 217);
                        border-radius:2px;
                        width:22px;
                        height:22px;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        margin-right:6px;
                        cursor:pointer;
                    }
                    .onms-drag-button.onms-drag-remove {
                        background-color:rgb(239, 25, 32);
                    }
                    .onms-drag-button-placeholder {
                        width:22px;
                        height:22px;
                        display:flex;
                        margin-right:6px;
                    }
                    .onms-drag-wrapper{
                        height: 40px;
                        margin-bottom:6px;
                        display: flex;
                        align-items: center;
                        border:1px solid #2f2e2e;
                        padding:10px 15px;
                        border-radius:2px;
                    }
                    `
                }
            </style>
            {values.map((val, index) => (
                <div key={index} className='onms-drag-wrapper'>
                    <span>{index + 1}.&nbsp;</span>
                    <span>{val.label}</span>
                    <div className='onms-drag-buttons'>
                        <span className='onms-drag-button' tabIndex={0} onKeyUp={(e) => keyUp(e,index)} onClick={(e) => moveUp(e, index)}><i className='fa fa-arrow-up'></i></span>
                        <span className='onms-drag-button' tabIndex={0} onKeyUp={(e) => keyDown(e,index)} onClick={(e) => moveDown(e, index)}>
                            <i className='fa fa-arrow-down'></i>
                        </span>
                        {(shouldDisplayRemove === undefined || shouldDisplayRemove(val)) ? (
                            <span className='onms-drag-button onms-drag-remove' onKeyUp={(e) => keyDelete(e,index)} tabIndex={0} onClick={(e) => remove(e, index)}><i className='fa fa-ban'></i></span>
                        ) : <span className='onms-drag-button-placeholder'></span>
                        }
                    </div>
                </div>
            ))}
        </div>
    )
}
