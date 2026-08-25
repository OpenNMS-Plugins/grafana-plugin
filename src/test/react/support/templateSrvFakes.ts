import { ScopedVars, TypedVariableModel } from '@grafana/data'

/**
 * Test doubles for Grafana's TemplateSrv.
 *
 * Grafana 12 ships two interpolation engines behind the same TemplateSrv facade, and OPG has to
 * work with both (Scenes on Grafana 12/13, the legacy engine on Grafana 10/11 and on Grafana 12
 * with '?scenes=false' or 'dashboardScene = false'). They differ in three ways that matter to us:
 *
 *  1. What arrives in DataQueryRequest.scopedVars.
 *     Legacy puts the repeated panel's value there directly, as { node: { value: '2' } }.
 *     Scenes puts only { __sceneObject, __interval, __interval_ms } -- the repeat value lives in a
 *     LocalValueVariable hanging off the panel's (or row's) node in the scene graph, and is reached
 *     by handing __sceneObject back to templateSrv.replace().
 *
 *  2. What templateSrv.getVariables() returns.
 *     Both return DASHBOARD scope. Under Scenes that is resolved from window.__grafanaSceneContext,
 *     which is the dashboard root, so a repeat's local override is invisible to it. This is the
 *     root cause of OPG-521.
 *
 *  3. How the ':json' format renders a scalar.
 *     Scenes: `typeof value === 'string' ? value : JSON.stringify(value)` -- scalars are NOT quoted.
 *     Core:   `JSON.stringify(value)`                                     -- scalars ARE quoted.
 *
 * See:
 *   grafana/scenes  packages/scenes/src/variables/interpolation/formatRegistry.ts
 *   grafana/scenes  packages/scenes/src/variables/variants/MultiValueVariable.ts
 *   grafana/grafana public/app/features/templating/template_srv.ts
 */

export const ALL_VALUE = '$__all'
export const ALL_TEXT = 'All'

/** Grafana's own variableRegex. Groups: 1 = $name, 2/3 = [[name:format]], 4 = ${name}, 5 = fieldPath, 6 = format. */
const variableRegex = /\$(\w+)|\[\[(\w+?)(?::(\w+))?\]\]|\$\{(\w+)(?:\.([^:^}]+))?(?::([^}]+))?\}/g

export interface FakeVariableOption {
    value: string
    text?: string
}

export interface FakeVariableSpec {
    name: string
    multi?: boolean
    includeAll?: boolean
    /** Currently selected value(s) at dashboard scope. Use ALL_VALUE to model the "All" selection. */
    current: { value: string | string[], text?: string | string[] }
    /** Full option list. Required for any variable that can be set to "All". */
    options?: FakeVariableOption[]
}

/** The resolved value of one variable, in whatever scope the caller asked for. */
interface ResolvedValue {
    value: string | string[]
    text: string | string[]
}

type Resolver = (name: string) => ResolvedValue | undefined
type Formatter = (resolved: ResolvedValue, format?: string) => string

/**
 * What SceneQueryRunner actually puts on the request. Note the absence of any repeat variable:
 *   private _scopedVars = { __sceneObject: wrapInSafeSerializableSceneObject(this) }
 */
export const SCENES_SCOPED_VARS: ScopedVars = {
    __sceneObject: { text: '__sceneObject', value: { valueOf: () => ({}) } },
    __interval: { text: '1m', value: '1m' },
    __interval_ms: { text: '60000', value: 60000 }
}

const asArray = (value: string | string[]): string[] => Array.isArray(value) ? value : [value]

const isAllSelection = (value: string | string[] | undefined): boolean =>
    value !== undefined && asArray(value)[0] === ALL_VALUE

const concreteOptions = (spec: FakeVariableSpec): FakeVariableOption[] =>
    (spec.options ?? []).filter(o => o.value !== ALL_VALUE)

const buildVariableModel = (spec: FakeVariableSpec): TypedVariableModel => ({
    name: spec.name,
    type: 'query',
    multi: !!spec.multi,
    includeAll: !!spec.includeAll,
    current: {
        value: spec.current.value,
        text: spec.current.text ?? spec.current.value,
        selected: true
    },
    options: (spec.options ?? []).map(o => ({
        value: o.value,
        text: o.text ?? o.value,
        selected: false
    }))
} as unknown as TypedVariableModel)

/**
 * Dashboard-scope value, mirroring scenes' MultiValueVariable.getValue()/getValueText():
 * an "All" selection expands to every concrete option value, while its *text* stays "All".
 */
const dashboardScopeValue = (spec: FakeVariableSpec): ResolvedValue => {
    if (isAllSelection(spec.current.value)) {
        return { value: concreteOptions(spec).map(o => o.value), text: ALL_TEXT }
    }

    return { value: spec.current.value, text: spec.current.text ?? spec.current.value }
}

const interpolateWith = (target: any, resolve: Resolver, format: Formatter, defaultFormat?: string) => {
    if (typeof target !== 'string') {
        return target
    }

    variableRegex.lastIndex = 0

    return target.replace(variableRegex, (match, bare, bracketed, bracketedFormat, braced, _fieldPath, bracedFormat) => {
        const name = bare ?? bracketed ?? braced
        const resolved = resolve(name)

        if (!resolved) {
            return match
        }

        return format(resolved, bracketedFormat ?? bracedFormat ?? defaultFormat)
    })
}

/** grafana/scenes formatRegistry. */
const scenesFormat: Formatter = ({ value, text }, format) => {
    switch (format) {
        case 'json':
            // NB: scalars pass through unquoted.
            return typeof value === 'string' ? value : JSON.stringify(value)
        case 'text':
            return Array.isArray(text) ? text.join(' + ') : String(text)
        case 'csv':
            return Array.isArray(value) ? value.join(',') : String(value)
        case 'raw':
            return String(value)
        default:
            return Array.isArray(value) ? `{${value.join(',')}}` : String(value)
    }
}

/** grafana/grafana core formatRegistry. */
const coreFormat: Formatter = ({ value, text }, format) => {
    switch (format) {
        case 'json':
            return JSON.stringify(value)
        case 'text':
            return Array.isArray(text) ? text.join(' + ') : String(text)
        case 'csv':
            return Array.isArray(value) ? value.join(',') : String(value)
        case 'raw':
            return String(value)
        default:
            return Array.isArray(value) ? `{${value.join(',')}}` : String(value)
    }
}

const commonMethods = (models: TypedVariableModel[]) => ({
    getVariables: () => models,

    isAllValue: (value: any) => isAllSelection(value),

    containsTemplate: (target: any) => {
        if (typeof target !== 'string') {
            return false
        }

        variableRegex.lastIndex = 0
        return variableRegex.test(target)
    },

    getVariableName: (expression: any) => {
        if (typeof expression !== 'string') {
            return null
        }

        variableRegex.lastIndex = 0
        const match = variableRegex.exec(expression)

        return match ? match.slice(1).find(m => m !== undefined) ?? null : null
    }
})

/**
 * TemplateSrv as it behaves under Dashboard Scenes (Grafana 12 default, Grafana 13 only).
 *
 * @param specs           the dashboard's variables
 * @param localOverrides  values shadowed by a repeat, e.g. { node: '2' }. Applied only when the
 *                        caller passes scopedVars containing __sceneObject -- exactly like
 *                        sceneGraph.interpolate() resolving a LocalValueVariable from the panel's
 *                        position in the scene graph. A repeated PANEL and a repeated ROW are
 *                        indistinguishable here, which is the point: both attach a
 *                        SceneVariableSet([LocalValueVariable]) that descendants inherit.
 */
export const makeScenesTemplateSrv = (specs: FakeVariableSpec[], localOverrides: Record<string, string> = {}) => {
    const models = specs.map(buildVariableModel)
    const bySpecName = new Map(specs.map(s => [s.name, s]))

    const resolverFor = (scopedVars?: ScopedVars): Resolver => (name: string) => {
        const spec = bySpecName.get(name)

        if (!spec) {
            return undefined
        }

        const hasSceneHandle = !!scopedVars?.__sceneObject
        const override = localOverrides[name]

        if (hasSceneHandle && override !== undefined) {
            return { value: override, text: override }
        }

        return dashboardScopeValue(spec)
    }

    return {
        ...commonMethods(models),
        replace: (target: any, scopedVars?: ScopedVars, format?: string) =>
            interpolateWith(target, resolverFor(scopedVars), scenesFormat, format)
    }
}

/**
 * TemplateSrv as it behaves without Scenes: Grafana 10/11, or Grafana 12 with '?scenes=false'
 * or 'dashboardScene = false'. Here the repeat value really is in scopedVars.
 */
export const makeLegacyTemplateSrv = (specs: FakeVariableSpec[]) => {
    const models = specs.map(buildVariableModel)
    const bySpecName = new Map(specs.map(s => [s.name, s]))

    const resolverFor = (scopedVars?: ScopedVars): Resolver => (name: string) => {
        const scoped = scopedVars?.[name]

        if (scoped !== undefined && scoped !== null) {
            return { value: String(scoped.value), text: String(scoped.text ?? scoped.value) }
        }

        const spec = bySpecName.get(name)

        return spec ? dashboardScopeValue(spec) : undefined
    }

    return {
        ...commonMethods(models),
        replace: (target: any, scopedVars?: ScopedVars, format?: string) =>
            interpolateWith(target, resolverFor(scopedVars), coreFormat, format)
    }
}

/** scopedVars as the legacy engine builds them for a repeated panel. */
export const legacyRepeatScopedVars = (values: Record<string, string>): ScopedVars =>
    Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { text: value, value }]))
