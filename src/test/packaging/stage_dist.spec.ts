import fs from 'fs'
import os from 'os'
import path from 'path'
import { assertDistExists, stageDist } from '../../../scripts/stageDist'

let workDir: string
let distDir: string
let targetDir: string

const writeDistFile = (relativePath: string, contents = 'x') => {
  const target = path.join(distDir, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents)
}

/** A dist tree shaped like a real production build, fixtures and all. */
const setUp = () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opg-stage-test-'))
  distDir = path.join(workDir, 'dist')
  targetDir = path.join(workDir, 'staged')
  fs.mkdirSync(distDir)
  writeDistFile('module.js', 'console.log("plugin")')
  writeDistFile('plugin.json', '{}')
  writeDistFile('img/logo.svg', '<svg/>')
  writeDistFile('test/react/support/fixtures/helm-v8-dashboard.json', '{}')
}

const tearDown = () => fs.rmSync(workDir, { recursive: true, force: true })

const staged = (relativePath: string) => fs.existsSync(path.join(targetDir, relativePath))

describe('assertDistExists', () => {
  beforeEach(setUp)
  afterEach(tearDown)

  it('should tell the caller to build when dist is missing', () => {
    fs.rmSync(distDir, { recursive: true })

    // The bare recursive-copy failure was an ENOENT on lstat, reported as
    // 'Copy failed', which says nothing about what to do next.
    expect(() => assertDistExists(distDir)).toThrow(/npm run build/)
  })

  it('should accept a dist directory that exists', () => {
    expect(() => assertDistExists(distDir)).not.toThrow()
  })
})

describe('stageDist', () => {
  beforeEach(setUp)
  afterEach(tearDown)

  it('should copy the plugin files into the target directory', async () => {
    await stageDist({ distDir, targetDir })

    expect(staged('module.js')).toBe(true)
    expect(staged('img/logo.svg')).toBe(true)
  })

  it('should not stage the jest fixtures webpack drags into dist', async () => {
    // Excluding only `test/**` still leaves an empty `test` directory behind, so
    // the directory itself has to go too.
    await stageDist({ distDir, targetDir })

    expect(staged('test/react/support/fixtures/helm-v8-dashboard.json')).toBe(false)
    expect(staged('test')).toBe(false)
  })

  it('should not stage the rpmbuild working directories', async () => {
    writeDistFile('SOURCES/opennms-grafana-plugin.tar.gz')
    writeDistFile('SPECS/opennms-grafana-plugin.spec')

    await stageDist({ distDir, targetDir })

    expect(staged('SOURCES')).toBe(false)
    expect(staged('SPECS')).toBe(false)
  })

  it('should honour additional excludes from the caller', async () => {
    writeDistFile('packages/old.deb')

    await stageDist({ distDir, targetDir, extraExcludes: ['!packages', '!packages/**'] })

    expect(staged('packages')).toBe(false)
    expect(staged('module.js')).toBe(true)
  })

  it('should report a staged count that leaves out what it filtered', async () => {
    // The count is what the scripts log. recursive-copy counts directories as
    // entries too, so this is 3 files plus img/ — the point is that the excluded
    // fixtures under test/ are not in it.
    const count = await stageDist({ distDir, targetDir })

    expect(count).toEqual(4)
  })

  it('should reject rather than stage a partial tree when dist is missing', async () => {
    fs.rmSync(distDir, { recursive: true })

    await expect(stageDist({ distDir, targetDir })).rejects.toThrow(/npm run build/)
  })
})
