import { ScopedVars, TypedVariableModel } from '@grafana/data'
import { TemplateSrv } from '@grafana/runtime'
import { ALL_SELECTION_VALUE } from '../constants/constants'

/**
 * Resolving template variables to the values that apply to *one specific query*.
 *
 * Grafana 12 ships two interpolation engines behind the same TemplateSrv facade:
 *
 *  - Dashboard Scenes (the default on Grafana 12, the only option on Grafana 13). A dashboard is a
 *    reactive tree of SceneObjects, and variables resolve by walking up that tree. Repeating a panel
 *    or a row clones the subtree and attaches a SceneVariableSet holding a LocalValueVariable, so
 *    each clone shadows the repeat variable with its own single value.
 *
 *  - The legacy engine (Grafana 10/11, or Grafana 12 with '?scenes=false' or 'dashboardScene =
 *    false' in grafana.ini). Repeats put their value directly into DataQueryRequest.scopedVars.
 *
 * The trap for plugin authors is that under Scenes the repeat value is NOT in scopedVars -- that
 * only carries { __sceneObject, __interval, __interval_ms }. The local value is reachable only by
 * handing __sceneObject back to templateSrv.replace(), which routes to sceneGraph.interpolate() and
 * resolves from the panel's position in the tree. templateSrv.getVariables(), by contrast, always
 * answers at DASHBOARD scope, so any code that reads variable.current directly sees every selected
 * value and a repeated panel renders all of them. That was OPG-521.
 *
 * See:
 *   grafana/scenes  packages/scenes/src/querying/SceneQueryRunner.ts        (what scopedVars holds)
 *   grafana/scenes  packages/scenes/src/variables/interpolation/formatRegistry.ts
 *   grafana/grafana public/app/features/templating/template_srv.ts          (replace vs getVariables)
 */

/**
 * Whether to keep supporting Grafana without Dashboard Scenes.
 *
 * Grafana 13 removed the pre-Scenes renderer entirely, along with the 'dashboardScene' feature
 * toggle and the '?scenes=false' escape hatch. When OPG drops Grafana 10-12 support, set this to
 * false and then delete resolveInLegacyScope() and its tests -- nothing else needs to change.
 */
export const SUPPORT_NON_SCENES_GRAFANA = true

/** The effective state of one template variable, as seen by a single query. */
export interface ResolvedVariable {
    name: string
    /** Effective value(s) in this query's scope. A repeated panel or row sees exactly one. */
    values: string[]
    /** Display texts, index-aligned with `values`. Falls back to `values` when unavailable. */
    texts: string[]
    /** True when a repeated panel or row is shadowing this variable with its own value. */
    isLocalOverride: boolean
    /** True when the variable is set to "All" at dashboard scope, regardless of any local override. */
    isAllInDashboardScope: boolean
}

const asArray = (value: any): any[] => Array.isArray(value) ? value : [value]

/**
 * Grafana stores an "All" selection as the array ['$__all'] on a multi-value variable, but as the
 * bare string '$__all' on a single-select variable with includeAll. Both forms must be recognised.
 */
export const isAllSelection = (value: any): boolean => {
    if (value === undefined || value === null) {
        return false
    }

    return Array.isArray(value) ? value[0] === ALL_SELECTION_VALUE : value === ALL_SELECTION_VALUE
}

/** An option's value may itself be an array; Grafana uses the first entry in that case. */
const optionValue = (value: any): string =>
    String(Array.isArray(value) ? value[0] : value)

/** Every concrete option of a variable, i.e. its option list minus the "All" pseudo-option. */
const concreteOptions = (variable: TypedVariableModel) => {
    const options = ((variable as any)?.options ?? []) as Array<{ value: any, text?: any }>
    const concrete = options.filter(o => o.value !== ALL_SELECTION_VALUE)

    return {
        values: concrete.map(o => optionValue(o.value)),
        texts: concrete.map(o => String(o.text ?? optionValue(o.value)))
    }
}

/** Keep texts only when they line up with values one-for-one; otherwise the values are better labels. */
const alignTexts = (texts: string[], values: string[]): string[] =>
    texts.length === values.length ? texts : values

/**
 * Parse the result of interpolating '${name:json}'.
 *
 * The two engines disagree on scalars: the scenes JSON formatter is
 * `typeof value === 'string' ? value : JSON.stringify(value)`, so it leaves a scalar string
 * unquoted, while Grafana core JSON.stringify()s everything. A tolerant parse handles both, and
 * treats anything unparseable as a plain scalar -- which is what a value like 'web-01' will be.
 */
const parseInterpolatedJson = (raw: string): string[] | undefined => {
    let parsed: any

    try {
        parsed = JSON.parse(raw)
    } catch {
        return [raw]
    }

    if (Array.isArray(parsed)) {
        return parsed.map(v => String(v))
    }

    // A variable with a custom `allValue` interpolates to an object the JSON formatter cannot
    // render. Signal that so the caller can fall back to the default format.
    if (parsed !== null && typeof parsed === 'object') {
        return undefined
    }

    return [raw]
}

/**
 * Resolve against the scene graph, so a repeated panel or row sees only its own value.
 *
 * Resolving twice -- once with the __sceneObject handle and once without -- is what tells us
 * whether a repeat is shadowing the variable. Using templateSrv.replace() for this keeps us on the
 * public API rather than taking a dependency on @grafana/scenes just to test for LocalValueVariable.
 */
const resolveInSceneScope = (
    templateSrv: TemplateSrv,
    variable: TypedVariableModel,
    scopedVars?: ScopedVars
): ResolvedVariable => {
    const name = variable.name
    const jsonReference = '${' + name + ':json}'

    const scopedJson = templateSrv.replace(jsonReference, scopedVars)

    // Variable types that carry no interpolatable value, such as adhoc filters, come back
    // untouched. They can never be referenced from a query, so they contribute nothing.
    if (scopedJson === jsonReference) {
        return { name, values: [], texts: [], isLocalOverride: false, isAllInDashboardScope: false }
    }

    const values = parseInterpolatedJson(scopedJson) ?? [templateSrv.replace('$' + name, scopedVars)]

    // A repeat always shadows the variable with exactly one value (see Grafana's
    // getRepeatLocalVariableValue, which rejects arrays), so requiring a single value keeps us from
    // misreading an unexpected difference between the two scopes as an override. Getting that wrong
    // would push a multi-valued variable down the single-value path and mangle the query.
    const dashboardJson = templateSrv.replace(jsonReference)
    const isLocalOverride = scopedJson !== dashboardJson && values.length === 1

    const texts = isLocalOverride
        ? [templateSrv.replace('${' + name + ':text}', scopedVars)]
        : alignTexts(asArray((variable as any)?.current?.text ?? values).map(String), values)

    return {
        name,
        values,
        texts,
        isLocalOverride,
        isAllInDashboardScope: isAllSelection((variable as any)?.current?.value)
    }
}

/**
 * Resolve the way Grafana did before Scenes: the repeat value arrives in scopedVars, and an "All"
 * selection has to be expanded from the variable's own option list.
 *
 * OPG 13: delete this along with SUPPORT_NON_SCENES_GRAFANA.
 */
const resolveInLegacyScope = (
    variable: TypedVariableModel,
    scopedVars?: ScopedVars
): ResolvedVariable => {
    const name = variable.name
    const current = (variable as any)?.current
    const isAllInDashboardScope = isAllSelection(current?.value)
    const scoped = scopedVars?.[name]

    if (scoped !== undefined && scoped !== null) {
        const value = String(scoped.value)

        return {
            name,
            values: [value],
            texts: [String(scoped.text ?? value)],
            isLocalOverride: true,
            isAllInDashboardScope
        }
    }

    if (isAllInDashboardScope) {
        const options = concreteOptions(variable)

        return { name, values: options.values, texts: options.texts, isLocalOverride: false, isAllInDashboardScope }
    }

    const values = asArray(current?.value ?? []).map(String)
    const texts = alignTexts(asArray(current?.text ?? values).map(String), values)

    return { name, values, texts, isLocalOverride: false, isAllInDashboardScope }
}

/**
 * Scenes routes interpolation through the scene graph only when it is handed a scene object. The
 * window handle is Grafana's own fallback for the same purpose (see TemplateSrv.replace), and
 * covers calls made outside a query, such as metricFindQuery.
 */
const isSceneInterpolationAvailable = (scopedVars?: ScopedVars): boolean =>
    !!scopedVars?.__sceneObject || !!(window as any)?.__grafanaSceneContext

/** Resolve one variable to the values that apply to this query. */
export const resolveVariable = (
    templateSrv: TemplateSrv,
    variable: TypedVariableModel,
    scopedVars?: ScopedVars
): ResolvedVariable => {
    if (SUPPORT_NON_SCENES_GRAFANA && !isSceneInterpolationAvailable(scopedVars)) {
        return resolveInLegacyScope(variable, scopedVars)
    }

    return resolveInSceneScope(templateSrv, variable, scopedVars)
}

/** Resolve every dashboard variable to the values that apply to this query. */
export const resolveVariables = (
    templateSrv: TemplateSrv,
    scopedVars?: ScopedVars
): ResolvedVariable[] =>
    templateSrv.getVariables().map(variable => resolveVariable(templateSrv, variable, scopedVars))
