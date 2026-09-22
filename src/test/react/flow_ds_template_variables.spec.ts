import { convertTemplateVariables } from 'datasources/flow-ds/helpers'
import { FlowQueryData } from 'datasources/flow-ds/types'
import {
    FakeVariableSpec,
    SCENES_SCOPED_VARS,
    legacyRepeatScopedVars,
    makeLegacyTemplateSrv,
    makeScenesTemplateSrv
} from './support/templateSrvFakes'

/**
 * OPG-521 for the Flow datasource.
 *
 * convertTemplateVariables() calls templateSrv.replace() with no scopedVars at all. Under Scenes
 * that falls back to window.__grafanaSceneContext -- the dashboard root -- so a repeated panel
 * never sees its own value. FlowDataSource.query() has options.scopedVars in hand; it just never
 * threads it down.
 */
describe('FlowDataSource :: convertTemplateVariables', () => {
    const multiValuedNode: FakeVariableSpec = {
        name: 'node',
        multi: true,
        current: { value: ['1', '2', '3'] },
        options: [{ value: '1' }, { value: '2' }, { value: '3' }]
    }

    const queryUsingNode = (): FlowQueryData => ({
        segment: 0,
        functions: [{ label: 'withExporterNode' }],
        functionParameters: ['$node'],
        parameterOptions: [{ value: '$node', label: '$node' }],
        refId: 'A'
    })

    describe('Scenes engine :: repeated panel or row (OPG-521)', () => {
        it('should resolve function parameters to the repeat clone\'s own value', () => {
            const templateSrv = makeScenesTemplateSrv([multiValuedNode], { node: '2' })

            const converted = convertTemplateVariables(queryUsingNode(), templateSrv, SCENES_SCOPED_VARS)

            expect(converted.functionParameters).toStrictEqual(['2'])
        })

        it('should resolve parameter options to the repeat clone\'s own value', () => {
            const templateSrv = makeScenesTemplateSrv([multiValuedNode], { node: '3' })

            const converted = convertTemplateVariables(queryUsingNode(), templateSrv, SCENES_SCOPED_VARS)

            expect(converted.parameterOptions[0]).toStrictEqual({ value: '3', label: '3' })
        })
    })

    describe('Scenes engine :: no repeat (regression guards)', () => {
        it('should leave a multi-valued variable expanded at dashboard scope', () => {
            const templateSrv = makeScenesTemplateSrv([multiValuedNode])

            const converted = convertTemplateVariables(queryUsingNode(), templateSrv, SCENES_SCOPED_VARS)

            expect(converted.functionParameters).toStrictEqual(['{1,2,3}'])
        })

        it('should substitute a single-valued variable', () => {
            const single: FakeVariableSpec = { name: 'node', current: { value: '7' }, options: [{ value: '7' }] }
            const templateSrv = makeScenesTemplateSrv([single])

            const converted = convertTemplateVariables(queryUsingNode(), templateSrv, SCENES_SCOPED_VARS)

            expect(converted.functionParameters).toStrictEqual(['7'])
        })
    })

    describe('legacy engine (Grafana 10/11, or Grafana 12 with ?scenes=false)', () => {
        it('should resolve to the repeat value carried in scopedVars', () => {
            const templateSrv = makeLegacyTemplateSrv([multiValuedNode])

            const converted = convertTemplateVariables(
                queryUsingNode(), templateSrv, legacyRepeatScopedVars({ node: '2' })
            )

            expect(converted.functionParameters).toStrictEqual(['2'])
        })

        it('should still expand a multi-valued variable when no panel is repeating', () => {
            const templateSrv = makeLegacyTemplateSrv([multiValuedNode])

            const converted = convertTemplateVariables(queryUsingNode(), templateSrv, undefined)

            expect(converted.functionParameters).toStrictEqual(['{1,2,3}'])
        })
    })
})
