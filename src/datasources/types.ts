import { QueryResultMeta } from '@grafana/data'

export interface OnmsQueryResultMeta extends QueryResultMeta {
  entity_metadata: any[]
}
