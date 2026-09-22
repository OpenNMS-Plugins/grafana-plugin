// The whole point of scripts/docs/validateXrefs.js is that Antora reports a dangling
// internal reference at *info* level, which --log-failure-level cannot fail on, so
// these tests pin the level-independent behaviour: a reference problem is a problem
// whatever level Antora logged it at, and nothing else is.

const {
  collectProblems,
  describeLocation,
  UNKNOWN_FILE
} = require('../../../scripts/docs/validateXrefs')

const record = (level: string, msg: string, file?: string) =>
  JSON.stringify({ level, time: 1, name: 'asciidoctor', msg, ...(file ? { file: { path: file } } : {}) })

describe('collectProblems', () => {
  it('flags a dangling internal reference even though Antora logs it at info', () => {
    const out = record('info', 'possible invalid reference: upgrade-dashboards', '/repo/docs/a.adoc')

    expect(collectProblems(out)).toEqual([
      { msg: 'possible invalid reference: upgrade-dashboards', file: '/repo/docs/a.adoc' }
    ])
  })

  it.each([
    ['error', 'target of xref not found: no-such-page.adoc'],
    ['error', 'target of image not found: no-such-image.png'],
    ['warn', 'target of include not found: no-such-include.adoc']
  ])('flags %s: %s', (level, msg) => {
    expect(collectProblems(record(level, msg, '/repo/docs/a.adoc'))).toHaveLength(1)
  })

  it('collects every problem, not just the first', () => {
    const out = [
      record('info', 'possible invalid reference: one', '/repo/docs/a.adoc'),
      record('error', 'target of xref not found: two.adoc', '/repo/docs/b.adoc')
    ].join('\n')

    expect(collectProblems(out).map((p: { file: string }) => p.file)).toEqual([
      '/repo/docs/a.adoc',
      '/repo/docs/b.adoc'
    ])
  })

  it('ignores unrelated messages at any level', () => {
    const out = [
      record('info', 'Using generator: @antora/xref-validator'),
      record('warn', 'the page reached its limit'),
      record('error', 'something else entirely')
    ].join('\n')

    expect(collectProblems(out)).toEqual([])
  })

  it('survives non-JSON lines and empty output', () => {
    const out = ['added 36 packages in 5s', '', record('info', 'possible invalid reference: x')].join('\n')

    expect(collectProblems(out)).toHaveLength(1)
    expect(collectProblems('')).toEqual([])
    expect(collectProblems(undefined)).toEqual([])
  })

  it('reports a missing file path rather than throwing', () => {
    expect(collectProblems(record('info', 'possible invalid reference: x'))).toEqual([
      { msg: 'possible invalid reference: x', file: '<unknown file>' }
    ])
  })

  it('does not flag a message that merely mentions a reference problem mid-sentence', () => {
    const out = record('info', 'checked for possible invalid reference targets', '/repo/docs/a.adoc')

    expect(collectProblems(out)).toEqual([])
  })
})

describe('describeLocation', () => {
  it('relativises a real path against the project directory', () => {
    expect(describeLocation('/repo/docs/a.adoc', '/repo')).toBe('docs/a.adoc')
  })

  it('leaves the unknown-file sentinel alone', () => {
    // path.relative would resolve it against the cwd and print something like
    // ../../../elsewhere/<unknown file> whenever the script runs from outside the repo.
    expect(describeLocation(UNKNOWN_FILE, '/repo')).toBe(UNKNOWN_FILE)
    expect(describeLocation(UNKNOWN_FILE, '/some/other/place')).toBe(UNKNOWN_FILE)
  })
})
