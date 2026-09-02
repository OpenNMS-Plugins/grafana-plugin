import fs from 'fs'
import os from 'os'
import path from 'path'
import { EXCLUDED_TOP_LEVEL, recursiveCopyFilter } from '../../../scripts/distContents'

const copy = require('recursive-copy')

let workDir: string
let distDir: string

const writeFile = (relativePath: string) => {
  const target = path.join(distDir, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, 'x')
}

const walk = (dir: string, prefix = ''): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory() ? walk(path.join(dir, entry.name), relativePath) : [relativePath]
  })

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opg-dist-test-'))
  distDir = path.join(workDir, 'dist')
  fs.mkdirSync(distDir)
})

afterEach(() => fs.rmSync(workDir, { recursive: true, force: true }))

describe('EXCLUDED_TOP_LEVEL', () => {
  it('should exclude the jest fixtures webpack copies into dist', () => {
    expect(EXCLUDED_TOP_LEVEL).toContain('test')
  })

  it('should exclude the rpmbuild working directories', () => {
    expect(EXCLUDED_TOP_LEVEL).toEqual(expect.arrayContaining(['SPECS', 'SOURCES', 'RPMS', 'SRPMS']))
  })
})

/**
 * makezip.js and makedeb.js both hand these patterns to recursive-copy, so the
 * assertion that matters is what actually lands in the copied tree.
 */
describe('recursiveCopyFilter', () => {
  it('should copy the plugin payload', async () => {
    writeFile('module.js')
    writeFile('plugin.json')
    writeFile('img/logo.svg')
    const target = path.join(workDir, 'out')

    await copy(distDir, target, { dot: true, junk: false, filter: recursiveCopyFilter() })

    expect(walk(target).sort()).toEqual(['img/logo.svg', 'module.js', 'plugin.json'])
  })

  it('should not copy the jest fixtures or the rpmbuild directories', async () => {
    writeFile('module.js')
    writeFile('test/react/support/fixtures/helm-v8-dashboard.json')
    writeFile('SPECS/plugin.spec')
    writeFile('SOURCES/plugin.tar.gz')
    const target = path.join(workDir, 'out')

    await copy(distDir, target, { dot: true, junk: false, filter: recursiveCopyFilter() })

    expect(walk(target).sort()).toEqual(['module.js'])
  })

  it('should keep a file whose name merely starts with an excluded name', async () => {
    writeFile('testing.js')
    const target = path.join(workDir, 'out')

    await copy(distDir, target, { dot: true, junk: false, filter: recursiveCopyFilter() })

    expect(walk(target)).toEqual(['testing.js'])
  })

  it('should append caller-supplied patterns', async () => {
    writeFile('module.js')
    writeFile('plugin.deb')
    const target = path.join(workDir, 'out')

    await copy(distDir, target, { dot: true, junk: false, filter: recursiveCopyFilter(['!**/*.deb']) })

    expect(walk(target)).toEqual(['module.js'])
  })
})
