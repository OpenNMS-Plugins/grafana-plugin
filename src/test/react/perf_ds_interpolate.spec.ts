import { collectInterpolationVariables, interpolate } from '../../datasources/perf-ds/queries/interpolate'
import {
  ALL_TEXT,
  ALL_VALUE,
  FakeVariableSpec,
  SCENES_SCOPED_VARS,
  legacyRepeatScopedVars,
  makeLegacyTemplateSrv,
  makeScenesTemplateSrv
} from './support/templateSrvFakes'

describe('OpenNMSPerformanceDatasource :: interpolate', () => {
  const query = { resource: '$node', metric: '$x.$y' }
  const queryWithBraces = { resource: '${node}', metric: '$x.$y' }
  const queryWithBracesAndFormat = { resource: '${node:csv}', metric: '$x.$y' }

  it('should return the same object when the list of attributes is empty', () => {
    expect(interpolate(query, [], [])).toStrictEqual([query])
  })

  it('should return the same object when the list of variables is empty', () => {
    expect(interpolate(query, ['resource'], [])).toStrictEqual([query])
  })

  it('should return the same object when no matching variables are referenced', () => {
    expect(interpolate(query, ['resource'], [{ name: '!node', value: ['1'] }])).toStrictEqual([query])
  })

  it('should return an empty array when a referenced variable has no values', () => {
    // The cartesian product of an empty value list is empty, so callers cannot assume [0] exists.
    // Reachable whenever a referenced multi-value variable has nothing selected.
    expect(interpolate(query, ['resource'], [{ name: 'node', value: [] }])).toStrictEqual([])
  })

  it('should be able to interpolate a single variable in a single attribute', () => {
    const interpolated = interpolate(query, ['resource'], [{ name: 'node', value: ['1', '2'] }])

    expect(interpolated).toStrictEqual([
      { resource: '1', metric: '$x.$y' },
      { resource: '2', metric: '$x.$y' }
    ])
  })

  it('should be able to interpolate multiple variables in a single attribute', () => {
    const interpolated = interpolate(query, ['metric'], [
      { name: 'x', value: ['x1', 'x2'] },
      { name: 'y', value: ['y1', 'y2'] }
    ])

    expect(interpolated).toStrictEqual([
      { resource: '$node', metric: 'x1.y1' },
      { resource: '$node', metric: 'x1.y2' },
      { resource: '$node', metric: 'x2.y1' },
      { resource: '$node', metric: 'x2.y2' }
    ])
  })

  it('should be able to interpolate multiple variables in multiple attributes', () => {
    const interpolated = interpolate(query, ['resource', 'metric'], [
      { name: 'node', value: ['1', '2'] },
      { name: 'x', value: ['x1', 'x2'] },
      { name: 'y', value: ['y1', 'y2'] }
    ])

    expect(interpolated).toStrictEqual([
      { resource: '1', metric: 'x1.y1' },
      { resource: '1', metric: 'x1.y2' },
      { resource: '1', metric: 'x2.y1' },
      { resource: '1', metric: 'x2.y2' },
      { resource: '2', metric: 'x1.y1' },
      { resource: '2', metric: 'x1.y2' },
      { resource: '2', metric: 'x2.y1' },
      { resource: '2', metric: 'x2.y2' }
    ])
  })

  it('should support interpolating a special variable named $index which is unique for every row', () => {
    const queryWithIndex = {'resource': 'node', 'metric': '$x.$y', 'label': '$index'}

    const interpolated = interpolate(queryWithIndex, ['resource', 'metric', 'label'], [
      { name: 'x', value: ['x1', 'x2'] },
      { name: 'y', value: ['y1', 'y2'] }
    ])

    expect(interpolated).toStrictEqual([
      { resource: 'node', metric: 'x1.y1', label: 'idx0' },
      { resource: 'node', metric: 'x1.y2', label: 'idx1' },
      { resource: 'node', metric: 'x2.y1', label: 'idx2' },
      { resource: 'node', metric: 'x2.y2', label: 'idx3' }
    ])
  })

  it('should be able to interpolate multiple variables with the same name in a single attribute', () => {
    const queryWithMultipleVariables = {'resource': '$node', 'metric': '$x-var + $x-var'}
    const interpolated = interpolate(queryWithMultipleVariables, ['resource', 'metric'], [
      { name: 'x-var', value: ['x1', 'x2'] }
    ])

    expect(interpolated).toStrictEqual([
      { resource: '$node', metric: 'x1 + x1' },
      { resource: '$node', metric: 'x2 + x2' }
    ])
  })

  it('should be able to interpolate a single variable-with-braces in a single attribute', () => {
    const interpolated = interpolate(queryWithBraces, ['resource'], [{ name: 'node', value: ['1', '2'] }])

    expect(interpolated).toStrictEqual([
      { resource: '1', metric: '$x.$y' },
      { resource: '2', metric: '$x.$y' }
    ])
  })

  it('should be able to interpolate a single variable-with-braces-and-format in a single attribute', () => {
    const interpolated = interpolate(queryWithBracesAndFormat, ['resource'], [{ name: 'node', value: ['1', '2'] }])

    expect(interpolated).toStrictEqual([
      { resource: '1', metric: '$x.$y' },
      { resource: '2', metric: '$x.$y' }
    ])
  })
})

/**
 * OPG-521: repeating panels (and rows) show data for every value of the repeat variable
 * instead of just their own.
 *
 * The bug is entirely in collectInterpolationVariables(): under Dashboard Scenes the repeat value
 * is not in request.scopedVars, so the function falls through to templateSrv.getVariables(), which
 * resolves at DASHBOARD scope and hands back every selected value. interpolate() then faithfully
 * fans those out into one measurement source per value -- in every clone.
 *
 * These tests must hold on both interpolation engines: Scenes (Grafana 12 default, Grafana 13 only)
 * and legacy (Grafana 10/11, or Grafana 12 with '?scenes=false' / 'dashboardScene = false').
 */
describe('OpenNMSPerformanceDatasource :: collectInterpolationVariables', () => {
    const attributeSource = { nodeId: '$node', resourceId: 'nodeSnmp[]', label: '$node' }
    const sourceAttributes = ['nodeId', 'resourceId', 'label']

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

    // Grafana stores an "All" selection on a multi-value variable as the array ['$__all'].
    const allSelectedNode: FakeVariableSpec = { ...multiValuedNode, current: { value: [ALL_VALUE], text: ALL_TEXT } }

    describe('Scenes engine :: repeated panel (OPG-521)', () => {
        it('should use only the repeat clone\'s own value, not every selected value', () => {
            // The clone rendering node 2. Scenes puts the local value in the scene graph, and only a
            // __sceneObject handle in scopedVars.
            const templateSrv = makeScenesTemplateSrv([multiValuedNode], { node: '2' })

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(variables).toStrictEqual([{ name: 'node', value: ['2'] }])
        })

        it('should produce exactly one measurement source per repeated panel', () => {
            const templateSrv = makeScenesTemplateSrv([multiValuedNode], { node: '3' })

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)
            const sources = interpolate(attributeSource, sourceAttributes, variables)

            expect(sources).toStrictEqual([
                { nodeId: '3', resourceId: 'nodeSnmp[]', label: '3' }
            ])
        })

        it('should use the clone\'s own value even when the dashboard variable is set to All', () => {
            const templateSrv = makeScenesTemplateSrv([allSelectedNode], { node: '2' })

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(variables).toStrictEqual([{ name: 'node', value: ['2'] }])
        })

        it('should handle a repeat value that is not JSON-parseable as a scalar', () => {
            const labels: FakeVariableSpec = {
                name: 'node',
                multi: true,
                current: { value: ['web-01', 'web-02'] },
                options: [{ value: 'web-01' }, { value: 'web-02' }]
            }
            const templateSrv = makeScenesTemplateSrv([labels], { node: 'web-02' })

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(variables).toStrictEqual([{ name: 'node', value: ['web-02'] }])
        })

        it('should handle a repeat value containing a comma', () => {
            const labels: FakeVariableSpec = {
                name: 'node',
                multi: true,
                current: { value: ['a,b', 'c'] },
                options: [{ value: 'a,b' }, { value: 'c' }]
            }
            const templateSrv = makeScenesTemplateSrv([labels], { node: 'a,b' })

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(variables).toStrictEqual([{ name: 'node', value: ['a,b'] }])
        })

        it('should pin the repeated variable while still fanning out a second multi-valued variable', () => {
            const ifIndex: FakeVariableSpec = {
                name: 'ifIndex',
                multi: true,
                current: { value: ['8', '9'] },
                options: [{ value: '8' }, { value: '9' }]
            }
            const templateSrv = makeScenesTemplateSrv([multiValuedNode, ifIndex], { node: '2' })

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(variables).toStrictEqual([
                { name: 'node', value: ['2'] },
                { name: 'ifIndex', value: ['8', '9'] }
            ])
        })
    })

    describe('Scenes engine :: repeated row (OPG-521)', () => {
        // RowItemRepeater attaches SceneVariableSet([LocalValueVariable]) to each row clone, and
        // panels inside the row inherit it by walking up the scene graph. From the datasource's
        // point of view that is indistinguishable from a repeated panel -- which is why one fix
        // covers both. These tests pin that equivalence down.
        it('should use only the repeated row\'s own value', () => {
            const templateSrv = makeScenesTemplateSrv([multiValuedNode], { node: '1' })

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(variables).toStrictEqual([{ name: 'node', value: ['1'] }])
        })

        it('should resolve a panel inside a repeated row identically to a repeated panel', () => {
            const rowScoped = makeScenesTemplateSrv([multiValuedNode], { node: '2' })
            const panelScoped = makeScenesTemplateSrv([multiValuedNode], { node: '2' })

            expect(collectInterpolationVariables(rowScoped as any, SCENES_SCOPED_VARS))
                .toStrictEqual(collectInterpolationVariables(panelScoped as any, SCENES_SCOPED_VARS))
        })

        it('should pin the row variable while a panel-level multi-valued variable still fans out', () => {
            const ifIndex: FakeVariableSpec = {
                name: 'ifIndex',
                multi: true,
                current: { value: ['8', '9'] },
                options: [{ value: '8' }, { value: '9' }]
            }
            const templateSrv = makeScenesTemplateSrv([multiValuedNode, ifIndex], { node: '3' })

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)
            const sources = interpolate(
                { nodeId: '$node', resourceId: 'interfaceSnmp[$ifIndex]', label: '$node-$ifIndex' },
                sourceAttributes,
                variables
            )

            expect(sources).toStrictEqual([
                { nodeId: '3', resourceId: 'interfaceSnmp[8]', label: '3-8' },
                { nodeId: '3', resourceId: 'interfaceSnmp[9]', label: '3-9' }
            ])
        })
    })

    describe('Scenes engine :: no repeat (regression guards)', () => {
        it('should still expand a multi-valued variable into one source per value', () => {
            const templateSrv = makeScenesTemplateSrv([multiValuedNode])

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)
            const sources = interpolate(attributeSource, sourceAttributes, variables)

            expect(variables).toStrictEqual([{ name: 'node', value: ['1', '2', '3'] }])
            expect(sources).toStrictEqual([
                { nodeId: '1', resourceId: 'nodeSnmp[]', label: '1' },
                { nodeId: '2', resourceId: 'nodeSnmp[]', label: '2' },
                { nodeId: '3', resourceId: 'nodeSnmp[]', label: '3' }
            ])
        })

        it('should expand an "All" selection into every concrete option value', () => {
            const templateSrv = makeScenesTemplateSrv([allSelectedNode])

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(variables).toStrictEqual([{ name: 'node', value: ['1', '2', '3'] }])
        })

        it('should still take the cartesian product of two multi-valued variables', () => {
            const ifIndex: FakeVariableSpec = {
                name: 'ifIndex',
                multi: true,
                current: { value: ['8', '9'] },
                options: [{ value: '8' }, { value: '9' }]
            }
            const templateSrv = makeScenesTemplateSrv([multiValuedNode, ifIndex])

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)
            const sources = interpolate(
                { nodeId: '$node', resourceId: 'interfaceSnmp[$ifIndex]', label: '$node-$ifIndex' },
                sourceAttributes,
                variables
            )

            expect(sources).toHaveLength(6)
            expect(sources[0]).toStrictEqual({ nodeId: '1', resourceId: 'interfaceSnmp[8]', label: '1-8' })
            expect(sources[5]).toStrictEqual({ nodeId: '3', resourceId: 'interfaceSnmp[9]', label: '3-9' })
        })

        it('should expand an "All" selection stored as a bare string, not just as an array', () => {
            // A non-multi variable with includeAll stores current.value as the string '$__all'
            // rather than the array ['$__all']. Both forms must expand.
            const singleSelectWithAll: FakeVariableSpec = {
                name: 'node',
                includeAll: true,
                current: { value: ALL_VALUE, text: ALL_TEXT },
                options: [
                    { value: ALL_VALUE, text: ALL_TEXT },
                    { value: '1' }, { value: '2' }, { value: '3' }
                ]
            }
            const templateSrv = makeScenesTemplateSrv([singleSelectWithAll])

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(variables).toStrictEqual([{ name: 'node', value: ['1', '2', '3'] }])
        })

        it('should handle a single-valued variable', () => {
            const single: FakeVariableSpec = { name: 'node', current: { value: '7' }, options: [{ value: '7' }] }
            const templateSrv = makeScenesTemplateSrv([single])

            const variables = collectInterpolationVariables(templateSrv as any, SCENES_SCOPED_VARS)

            expect(variables).toStrictEqual([{ name: 'node', value: ['7'] }])
        })
    })

    describe('legacy engine (Grafana 10/11, or Grafana 12 with ?scenes=false)', () => {
        it('should use the repeat value that the legacy engine puts directly in scopedVars', () => {
            const templateSrv = makeLegacyTemplateSrv([multiValuedNode])
            const scopedVars = legacyRepeatScopedVars({ node: '2' })

            const variables = collectInterpolationVariables(templateSrv as any, scopedVars)
            const sources = interpolate(attributeSource, sourceAttributes, variables)

            expect(variables).toStrictEqual([{ name: 'node', value: ['2'] }])
            expect(sources).toStrictEqual([{ nodeId: '2', resourceId: 'nodeSnmp[]', label: '2' }])
        })

        it('should still expand a multi-valued variable when no panel is repeating', () => {
            const templateSrv = makeLegacyTemplateSrv([multiValuedNode])

            const variables = collectInterpolationVariables(templateSrv as any, undefined)

            expect(variables).toStrictEqual([{ name: 'node', value: ['1', '2', '3'] }])
        })

        it('should still expand an "All" selection from the variable\'s option list', () => {
            const templateSrv = makeLegacyTemplateSrv([allSelectedNode])

            const variables = collectInterpolationVariables(templateSrv as any, undefined)

            expect(variables).toStrictEqual([{ name: 'node', value: ['1', '2', '3'] }])
        })

        it('should expand an "All" selection stored as a bare string, not just as an array', () => {
            const singleSelectWithAll: FakeVariableSpec = {
                name: 'node',
                includeAll: true,
                current: { value: ALL_VALUE, text: ALL_TEXT },
                options: [
                    { value: ALL_VALUE, text: ALL_TEXT },
                    { value: '1' }, { value: '2' }, { value: '3' }
                ]
            }
            const templateSrv = makeLegacyTemplateSrv([singleSelectWithAll])

            const variables = collectInterpolationVariables(templateSrv as any, undefined)

            expect(variables).toStrictEqual([{ name: 'node', value: ['1', '2', '3'] }])
        })

        it('should pin the repeated variable while a second multi-valued variable fans out', () => {
            const ifIndex: FakeVariableSpec = {
                name: 'ifIndex',
                multi: true,
                current: { value: ['8', '9'] },
                options: [{ value: '8' }, { value: '9' }]
            }
            const templateSrv = makeLegacyTemplateSrv([multiValuedNode, ifIndex])
            const scopedVars = legacyRepeatScopedVars({ node: '2' })

            const variables = collectInterpolationVariables(templateSrv as any, scopedVars)

            expect(variables).toStrictEqual([
                { name: 'node', value: ['2'] },
                { name: 'ifIndex', value: ['8', '9'] }
            ])
        })
    })
})
