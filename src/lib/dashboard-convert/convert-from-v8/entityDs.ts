import { getColumns } from '../../../datasources/entity-ds/EntityHelper'
import { getAttributeMapping } from '../../../datasources/entity-ds/queries/attributeMappings'
import { OnmsEntityNestType, OnmsEntityType } from '../../../datasources/entity-ds/types'

// Legacy Entity target looks something like this:
// {
//   "datasource": {
//     "type": "opennms-entity-datasource",
//     "uid": "IeFyksx4k"
//   },
//   "entityType": {
//     "id": "node",
//     "label": "Nodes",
//     "queryFunction": "nodes"
//   },
//   "filter": {
//     "clauses": [],
//     "limit": 0,
//     "orderBy": []
//   },
//   "limit": 0,
//   "orderBy": [],
//   "refId": "A"
// }
//
export const updateEntityQuery = (source: any) => {
  // Note, target.datasource will be set in caller
  let target: any = { ...source }

  target.selectType = {
    label: target.entityType?.label
  }

  // attribute.value should be something like this:
  // However, legacy may only have the label or id
  // we may need to make calls to get the name; perhaps use attribute mapping to get id
  // {
  //   id: "category.name",
  //   label: "category",
  //   name: "Category: Name",
  // }

  const columns = getColumns(target.entityType?.label || target.entityType?.id)

  target.clauses = (target.filter?.clauses || []).map((c, i) => {
    const attrLabel = c.restriction.attribute // 'label'
    const attrId = getAttributeMapping(target.selectType, attrLabel)
    const attrName = columns.find(col => col.resource === attrLabel)?.text || attrLabel // 'Label'

    // Confirm this logic
    let entityType = i === 0 ? OnmsEntityType.FIRST : OnmsEntityType.AND

    if (i !== 0 && (c.operator?.id !== undefined) && c.operator.id >= 0) {
      entityType = c.operator.id
    }

    return {
      attribute: {
        label: attrName,
        type: {
          id: 'STRING',
          label: 'string'
        },
        value: {
          id: attrId,
          label: attrName,  // these aren't necessarily specified in the source
          name: attrName,
          type: {
            id: 'STRING',
            label: 'string'
          }
        }
      },
      comparator: {
        label: c.restriction.comparator.label,
        value: c.restriction.comparator.id
      },
      comparedString: c.restriction.value,
      // Clearing this, using comparedString only for now
      comparedValue: '',
      // TODO: figure out nestingType
      nestingType: OnmsEntityNestType.TOP,
      type: entityType
    }
  })

  return target
}
