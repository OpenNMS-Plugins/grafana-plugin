import { copyIgnorePatterns } from '../../../scripts/distContents'
import { applyCopyIgnore } from '../../../scripts/webpack/excludeFromCopy'

class CopyPlugin {
  patterns: any[]
  constructor(patterns: any[]) {
    this.patterns = patterns
  }
}

class SomeOtherPlugin {}

describe('copyIgnorePatterns', () => {
  it('should ignore the jest fixture directory', () => {
    // webpack copies src/**/*.json into dist. Without this, src/test's fixtures land
    // in dist/test, get signed into MANIFEST.txt, and are then stripped from the
    // packages, leaving the manifest declaring files that are not there.
    expect(copyIgnorePatterns()).toContain('**/test/**')
  })

  it('should cover every entry that does not belong in a package', () => {
    const patterns = copyIgnorePatterns()

    expect(patterns).toHaveLength(6)
    expect(patterns).toEqual(expect.arrayContaining(['**/SOURCES/**', '**/SPECS/**', '**/.git/**']))
  })
})

describe('applyCopyIgnore', () => {
  it('should add the ignore list to every copy pattern', () => {
    const plugin = new CopyPlugin([{ from: '**/*.json', to: '.' }, { from: 'plugin.json', to: '.' }])

    applyCopyIgnore([new SomeOtherPlugin(), plugin] as any, ['**/test/**'])

    plugin.patterns.forEach((pattern) => {
      expect(pattern.globOptions.ignore).toEqual(['**/test/**'])
    })
  })

  it('should preserve patterns that already carry glob options', () => {
    const plugin = new CopyPlugin([
      { from: '**/*.svg', to: '.', globOptions: { dot: true, ignore: ['**/keep-me/**'] } }
    ])

    applyCopyIgnore([plugin] as any, ['**/test/**'])

    expect(plugin.patterns[0].globOptions.dot).toEqual(true)
    expect(plugin.patterns[0].globOptions.ignore).toEqual(['**/keep-me/**', '**/test/**'])
  })

  it('should leave the rest of each pattern alone', () => {
    const plugin = new CopyPlugin([{ from: '../README.md', to: '.', force: true }])

    applyCopyIgnore([plugin] as any, ['**/test/**'])

    expect(plugin.patterns[0]).toMatchObject({ from: '../README.md', to: '.', force: true })
  })

  /**
   * The patterns property is not part of copy-webpack-plugin's documented API. If an
   * upgrade moves it, this must fail loudly rather than silently stop excluding, which
   * would put the fixtures back into dist and break the signature again.
   */
  it('should throw when no copy plugin with patterns can be found', () => {
    expect(() => applyCopyIgnore([new SomeOtherPlugin()] as any, ['**/test/**'])).toThrow(/CopyPlugin/)
  })

  it('should throw when the patterns property is no longer an array', () => {
    const plugin = new CopyPlugin([])
    ;(plugin as any).patterns = undefined

    expect(() => applyCopyIgnore([plugin] as any, ['**/test/**'])).toThrow(/CopyPlugin/)
  })
})
