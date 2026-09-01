/**
 * Grafana accepts three spellings of a template variable reference: '$name', '${name}' and the
 * legacy '[[name]]'. For a datasource ref, only the braced form resolves everywhere Grafana 12
 * needs it to:
 *
 *  - Import substitution of an '__inputs' value matches '(\$\{.+?\})' and registers its variables
 *    as '${' + name + '}', so '$name' and '[[name]]' are never substituted at import.
 *    See pkg/services/dashboardimport/utils/dash_template_evaluator.go.
 *  - getInstanceSettings only interpolates a uid that starts with '$', so a '[[name]]' uid falls
 *    through to a literal lookup and comes back undefined, and the datasource picker shows the
 *    datasource as missing even where get() would have resolved it and run the queries.
 *    See public/app/features/plugins/datasource_srv.ts.
 *
 * Normalizing to '${name}' is safe for a reference that has no matching '__inputs' entry: the
 * import evaluator leaves an unmatched '${...}' as it found it, and the runtime interpolates it.
 */

/** True if the value is a template variable reference in any of the three spellings. */
export const isVariableReference = (value?: any): boolean => {
  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()

  return (trimmed.startsWith('${') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[[') && trimmed.endsWith(']]')) ||
    (trimmed.startsWith('$') && !trimmed.includes('{') && !trimmed.includes('}'))
}

/**
 * The braced spelling of a variable reference, whichever spelling it arrived in.
 * Returns undefined if the value is not a variable reference at all, e.g. a datasource name.
 */
export const toBracedVariable = (value?: any): string | undefined => {
  if (!isVariableReference(value)) {
    return undefined
  }

  const rawName = String(value).trim().replaceAll(/[${}[\]]/g, '')

  return rawName ? `\${${rawName}}` : undefined
}
