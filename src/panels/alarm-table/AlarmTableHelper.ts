import { Field } from '@grafana/data'

export const getAlarmIdFromFields = (fields: Field[], index: number) => {
    return fields.find((d) => d.name === 'ID')?.values[index]
}
