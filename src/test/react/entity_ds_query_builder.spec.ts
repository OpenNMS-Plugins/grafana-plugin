import { dateTime } from '@grafana/data'
import { API } from 'opennms'
import { buildQueryFilter } from 'datasources/entity-ds/queries/queryBuilder'
import { EntityQuery, EntityQueryRequest } from 'datasources/entity-ds/types'
import { EntityTypes } from 'constants/constants'
import {
    ALL_TEXT,
    ALL_VALUE,
    FakeVariableSpec,
    SCENES_SCOPED_VARS,
    legacyRepeatScopedVars,
    makeLegacyTemplateSrv,
    makeScenesTemplateSrv
} from './support/templateSrvFakes'

/**
 * OPG-521 for the Entity datasource.
 *
 * simpleVariableSubstitution() already passes request.scopedVars to templateSrv.replace(), so
 * single-valued variables are fine. The multi-valued path is not: isAllVariable(),
 * isMultiVariable() and getCurrentValuesFromMultiValuedTemplateVariables() all read
 * templateVariable.current, which is dashboard scope. A repeated panel therefore gets an OR over
 * every selected value instead of its own single value.
 *
 * Note this predates Scenes: because that path ignores scopedVars entirely, it is broken on the
 * legacy engine too.
 */
describe('EntityDataSource :: buildQueryFilter :: template variables', () => {
    const multiValuedNode: FakeVariableSpec = {
        name: 'node',
        multi: true,
        includeAll: true,
        current: { value: ['1', '2', '3'] },
        options: [
            { value: ALL_VALUE, text: ALL_TEXT },
            { value: '1' }, { value: '2' }, { value: '3' }
        ]
    }

    const allSelectedNode: FakeVariableSpec = { ...multiValuedNode, current: { value: [ALL_VALUE], text: ALL_TEXT } }

    const buildRequest = (scopedVars: any): EntityQueryRequest<EntityQuery> => ({
        scopedVars,
        range: { from: dateTime(0), to: dateTime(1), raw: { from: 'now-6h', to: 'now' } },
        enforceTimeRange: false,
        entityType: EntityTypes.Alarms,
        targets: [],
        queryText: ''
    } as unknown as EntityQueryRequest<EntityQuery>)

    const filterOnNodeId = () =>
        new API.Filter().withAndRestriction(new API.Restriction('node.id', API.Comparators.EQ, '$node'))

    /** Flatten a built filter into [attribute, comparator label, value] triples for readable assertions. */
    const restrictionsOf = (filter: API.Filter): Array<[string, string, any]> => {
        const out: Array<[string, string, any]> = []

        const walk = (clauses: API.Clause[]) => {
            for (const clause of clauses) {
                const restriction: any = clause.restriction

                if (restriction?.clauses) {
                    walk(restriction.clauses)
                } else if (restriction) {
                    out.push([restriction.attribute, restriction.comparator.label, restriction.value])
                }
            }
        }

        walk(filter.clauses)

        return out
    }

    describe('Scenes engine :: repeated panel or row (OPG-521)', () => {
        it('should restrict to the repeat clone\'s own value, not OR over every selected value', () => {
            const templateSrv = makeScenesTemplateSrv([multiValuedNode], { node: '2' })

            const built = buildQueryFilter(filterOnNodeId(), buildRequest(SCENES_SCOPED_VARS), templateSrv as any)

            expect(restrictionsOf(built)).toStrictEqual([['node.id', 'EQ', '2']])
        })

        it('should restrict to the clone\'s own value rather than dropping the clause when the dashboard variable is All', () => {
            // Without a repeat, "All" means "no restriction" and the clause is dropped. A repeated
            // clone is never showing "all" -- it is showing exactly one value.
            const templateSrv = makeScenesTemplateSrv([allSelectedNode], { node: '3' })

            const built = buildQueryFilter(filterOnNodeId(), buildRequest(SCENES_SCOPED_VARS), templateSrv as any)

            expect(restrictionsOf(built)).toStrictEqual([['node.id', 'EQ', '3']])
        })
    })

    describe('Scenes engine :: no repeat (regression guards)', () => {
        it('should OR over every selected value of a multi-valued variable', () => {
            const templateSrv = makeScenesTemplateSrv([multiValuedNode])

            const built = buildQueryFilter(filterOnNodeId(), buildRequest(SCENES_SCOPED_VARS), templateSrv as any)

            expect(restrictionsOf(built)).toStrictEqual([
                ['node.id', 'EQ', '1'],
                ['node.id', 'EQ', '2'],
                ['node.id', 'EQ', '3']
            ])
        })

        it('should drop the clause entirely when the variable is set to All', () => {
            const templateSrv = makeScenesTemplateSrv([allSelectedNode])

            const built = buildQueryFilter(filterOnNodeId(), buildRequest(SCENES_SCOPED_VARS), templateSrv as any)

            expect(restrictionsOf(built)).toStrictEqual([])
        })

        it('should substitute a single-valued variable directly', () => {
            const single: FakeVariableSpec = { name: 'node', current: { value: '7' }, options: [{ value: '7' }] }
            const templateSrv = makeScenesTemplateSrv([single])

            const built = buildQueryFilter(filterOnNodeId(), buildRequest(SCENES_SCOPED_VARS), templateSrv as any)

            expect(restrictionsOf(built)).toStrictEqual([['node.id', 'EQ', '7']])
        })
    })

    describe('resolution is memoised per request', () => {
        it('should resolve a variable once however many clauses reference it', () => {
            const templateSrv: any = makeScenesTemplateSrv([multiValuedNode])
            const realReplace = templateSrv.replace
            let jsonReplaceCalls = 0

            templateSrv.replace = (target: any, scopedVars?: any, format?: string) => {
                if (typeof target === 'string' && target.includes(':json')) {
                    jsonReplaceCalls++
                }

                return realReplace(target, scopedVars, format)
            }

            // Three clauses, plus a nested restriction, all referencing $node.
            const filter = new API.Filter()
                .withAndRestriction(new API.Restriction('node.id', API.Comparators.EQ, '$node'))
                .withAndRestriction(new API.Restriction('node.label', API.Comparators.EQ, '$node'))
                .withAndRestriction(new API.NestedRestriction()
                    .withOrRestriction(new API.Restriction('node.foreignId', API.Comparators.EQ, '$node')))

            buildQueryFilter(filter, buildRequest(SCENES_SCOPED_VARS), templateSrv)

            // resolveInSceneScope makes exactly two ':json' calls, scoped and unscoped, so one
            // resolution is 2. Without the memo it grows with the number of referencing clauses.
            expect(jsonReplaceCalls).toBe(2)
        })
    })

    describe('${var:text} format (OPG-466)', () => {
        // Values and display texts differ, which is the whole point of the :text specifier.
        const nodeWithLabels: FakeVariableSpec = {
            name: 'node',
            multi: true,
            current: { value: ['1', '2', '3'], text: ['alpha', 'beta', 'gamma'] },
            options: [
                { value: '1', text: 'alpha' }, { value: '2', text: 'beta' }, { value: '3', text: 'gamma' }
            ]
        }

        const filterOnNodeLabel = () =>
            new API.Filter().withAndRestriction(new API.Restriction('node.label', API.Comparators.EQ, '${node:text}'))

        it('should OR over the display texts, not the values, when not repeating', () => {
            const templateSrv = makeScenesTemplateSrv([nodeWithLabels])

            const built = buildQueryFilter(filterOnNodeLabel(), buildRequest(SCENES_SCOPED_VARS), templateSrv as any)

            expect(restrictionsOf(built)).toStrictEqual([
                ['node.label', 'EQ', 'alpha'],
                ['node.label', 'EQ', 'beta'],
                ['node.label', 'EQ', 'gamma']
            ])
        })

        it("should use the repeat clone's own display text", () => {
            const templateSrv = makeScenesTemplateSrv([nodeWithLabels], { node: { value: '2', text: 'beta' } })

            const built = buildQueryFilter(filterOnNodeLabel(), buildRequest(SCENES_SCOPED_VARS), templateSrv as any)

            expect(restrictionsOf(built)).toStrictEqual([['node.label', 'EQ', 'beta']])
        })

        it('should still substitute the value, not the text, for a plain $var reference', () => {
            const templateSrv = makeScenesTemplateSrv([nodeWithLabels], { node: { value: '2', text: 'beta' } })

            const built = buildQueryFilter(filterOnNodeId(), buildRequest(SCENES_SCOPED_VARS), templateSrv as any)

            expect(restrictionsOf(built)).toStrictEqual([['node.id', 'EQ', '2']])
        })

        it('should OR over the display texts on the legacy engine too', () => {
            const templateSrv = makeLegacyTemplateSrv([nodeWithLabels])

            const built = buildQueryFilter(filterOnNodeLabel(), buildRequest(undefined), templateSrv as any)

            expect(restrictionsOf(built)).toStrictEqual([
                ['node.label', 'EQ', 'alpha'],
                ['node.label', 'EQ', 'beta'],
                ['node.label', 'EQ', 'gamma']
            ])
        })

        it("should use the repeat clone's display text on the legacy engine too", () => {
            const templateSrv = makeLegacyTemplateSrv([nodeWithLabels])

            const built = buildQueryFilter(
                filterOnNodeLabel(),
                buildRequest(legacyRepeatScopedVars({ node: { value: '2', text: 'beta' } })),
                templateSrv as any
            )

            expect(restrictionsOf(built)).toStrictEqual([['node.label', 'EQ', 'beta']])
        })
    })

    describe('legacy engine (Grafana 10/11, or Grafana 12 with ?scenes=false)', () => {
        it('should restrict to the repeat value carried in scopedVars', () => {
            const templateSrv = makeLegacyTemplateSrv([multiValuedNode])

            const built = buildQueryFilter(
                filterOnNodeId(),
                buildRequest(legacyRepeatScopedVars({ node: '2' })),
                templateSrv as any
            )

            expect(restrictionsOf(built)).toStrictEqual([['node.id', 'EQ', '2']])
        })

        it('should still OR over every selected value when no panel is repeating', () => {
            const templateSrv = makeLegacyTemplateSrv([multiValuedNode])

            const built = buildQueryFilter(filterOnNodeId(), buildRequest(undefined), templateSrv as any)

            expect(restrictionsOf(built)).toStrictEqual([
                ['node.id', 'EQ', '1'],
                ['node.id', 'EQ', '2'],
                ['node.id', 'EQ', '3']
            ])
        })

        it('should still drop the clause when the variable is set to All', () => {
            const templateSrv = makeLegacyTemplateSrv([allSelectedNode])

            const built = buildQueryFilter(filterOnNodeId(), buildRequest(undefined), templateSrv as any)

            expect(restrictionsOf(built)).toStrictEqual([])
        })
    })
})
