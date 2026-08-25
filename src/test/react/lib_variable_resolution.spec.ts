import { resolveVariable, resolveVariables, isAllSelection } from 'lib/variableResolution'
import {
    ALL_TEXT,
    ALL_VALUE,
    FakeVariableSpec,
    SCENES_SCOPED_VARS,
    legacyRepeatScopedVars,
    makeLegacyTemplateSrv,
    makeScenesTemplateSrv
} from './support/templateSrvFakes'

describe('lib :: variableResolution', () => {
    const multiValuedNode: FakeVariableSpec = {
        name: 'node',
        multi: true,
        includeAll: true,
        current: { value: ['1', '2', '3'], text: ['one', 'two', 'three'] },
        options: [
            { value: ALL_VALUE, text: ALL_TEXT },
            { value: '1', text: 'one' }, { value: '2', text: 'two' }, { value: '3', text: 'three' }
        ]
    }

    describe('isAllSelection', () => {
        it('should recognise the array form used by multi-value variables', () => {
            expect(isAllSelection([ALL_VALUE])).toBe(true)
        })

        it('should recognise the bare string form used by single-select variables with includeAll', () => {
            expect(isAllSelection(ALL_VALUE)).toBe(true)
        })

        it('should not fire on ordinary values', () => {
            expect(isAllSelection(['1', '2'])).toBe(false)
            expect(isAllSelection('1')).toBe(false)
            expect(isAllSelection(undefined)).toBe(false)
            expect(isAllSelection(null)).toBe(false)
        })
    })

    describe('Scenes engine', () => {
        it('should report a repeated panel or row as a local override, with just its own value', () => {
            const templateSrv = makeScenesTemplateSrv([multiValuedNode], { node: '2' })

            const resolved = resolveVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(resolved).toStrictEqual([{
                name: 'node',
                values: ['2'],
                texts: ['2'],
                isLocalOverride: true,
                isAllInDashboardScope: false
            }])
        })

        it('should report no override, and index-aligned texts, when nothing is repeating', () => {
            const templateSrv = makeScenesTemplateSrv([multiValuedNode])

            const resolved = resolveVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(resolved).toStrictEqual([{
                name: 'node',
                values: ['1', '2', '3'],
                texts: ['one', 'two', 'three'],
                isLocalOverride: false,
                isAllInDashboardScope: false
            }])
        })

        it('should still flag "All" at dashboard scope while a repeat clone holds one value', () => {
            const allSelected: FakeVariableSpec = { ...multiValuedNode, current: { value: [ALL_VALUE], text: ALL_TEXT } }
            const templateSrv = makeScenesTemplateSrv([allSelected], { node: '2' })

            const resolved = resolveVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(resolved[0].values).toStrictEqual(['2'])
            expect(resolved[0].isLocalOverride).toBe(true)
            expect(resolved[0].isAllInDashboardScope).toBe(true)
        })

        it('should fall back to values when texts do not line up with them', () => {
            // "All" carries the single text "All" against three values.
            const allSelected: FakeVariableSpec = { ...multiValuedNode, current: { value: [ALL_VALUE], text: ALL_TEXT } }
            const templateSrv = makeScenesTemplateSrv([allSelected])

            const resolved = resolveVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(resolved[0].values).toStrictEqual(['1', '2', '3'])
            expect(resolved[0].texts).toStrictEqual(['1', '2', '3'])
        })
    })

    describe('Scenes engine :: defensive guards', () => {
        it('should contribute nothing for a variable that does not interpolate, such as an adhoc filter', () => {
            // templateSrv hands the reference back untouched when there is no value to render.
            const templateSrv = {
                getVariables: () => [{ name: 'filters', type: 'adhoc' }],
                replace: (target: string) => target
            }

            const resolved = resolveVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(resolved).toStrictEqual([{
                name: 'filters',
                values: [],
                texts: [],
                isLocalOverride: false,
                isAllInDashboardScope: false
            }])
        })

        it('should not mistake a multi-valued scope difference for a repeat override', () => {
            // A repeat always shadows a variable with exactly one value (see Grafana's
            // getRepeatLocalVariableValue, which rejects arrays). If the two scopes disagree but the
            // scoped resolution is still multi-valued, that is not a repeat -- and treating it as one
            // would push a multi-valued variable down the single-value path and mangle the query.
            const variable = { name: 'node', multi: true, current: { value: ['1', '2'] } }
            const templateSrv = {
                getVariables: () => [variable],
                replace: (target: string, scopedVars?: any) => scopedVars ? '["1","2"]' : '["1","2","3"]'
            }

            const resolved = resolveVariable(templateSrv as any, variable as any, SCENES_SCOPED_VARS)

            expect(resolved.values).toStrictEqual(['1', '2'])
            expect(resolved.isLocalOverride).toBe(false)
        })

        it('should fall back to the default format when a custom allValue cannot render as JSON', () => {
            // A variable with a custom allValue interpolates to an object the JSON formatter renders
            // as '{}'; the default format still produces something usable.
            const variable = { name: 'node', multi: true, includeAll: true, current: { value: [ALL_VALUE] } }
            const templateSrv = {
                getVariables: () => [variable],
                replace: (target: string) => target.includes(':json') ? '{}' : '*'
            }

            const resolved = resolveVariable(templateSrv as any, variable as any, SCENES_SCOPED_VARS)

            expect(resolved.values).toStrictEqual(['*'])
        })
    })

    describe('legacy engine (Grafana 10/11, or Grafana 12 with ?scenes=false)', () => {
        it('should read the repeat value from scopedVars and report it as a local override', () => {
            const templateSrv = makeLegacyTemplateSrv([multiValuedNode])

            const resolved = resolveVariables(templateSrv as any, legacyRepeatScopedVars({ node: '2' }))

            expect(resolved).toStrictEqual([{
                name: 'node',
                values: ['2'],
                texts: ['2'],
                isLocalOverride: true,
                isAllInDashboardScope: false
            }])
        })

        it('should read dashboard scope when nothing is repeating', () => {
            const templateSrv = makeLegacyTemplateSrv([multiValuedNode])

            const resolved = resolveVariables(templateSrv as any, undefined)

            expect(resolved).toStrictEqual([{
                name: 'node',
                values: ['1', '2', '3'],
                texts: ['one', 'two', 'three'],
                isLocalOverride: false,
                isAllInDashboardScope: false
            }])
        })

        it('should expand "All" from the option list, in both the array and bare string forms', () => {
            const asArrayForm: FakeVariableSpec = { ...multiValuedNode, current: { value: [ALL_VALUE], text: ALL_TEXT } }
            const asStringForm: FakeVariableSpec = { ...multiValuedNode, multi: false, current: { value: ALL_VALUE, text: ALL_TEXT } }

            for (const spec of [asArrayForm, asStringForm]) {
                const resolved = resolveVariables(makeLegacyTemplateSrv([spec]) as any, undefined)

                expect(resolved[0].values).toStrictEqual(['1', '2', '3'])
                expect(resolved[0].texts).toStrictEqual(['one', 'two', 'three'])
                expect(resolved[0].isAllInDashboardScope).toBe(true)
            }
        })
    })
})
