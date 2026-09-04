import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { buildZip, findZip } from '../../../scripts/zip/build'

const pkgId = 'opennms-opennms-app'

let workDir: string
let distDir: string
let stagingDir: string
let zipPath: string

const writeDistFile = (relativePath: string, contents = 'x') => {
  const target = path.join(distDir, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents)
}

/** A dist tree shaped like a real production build, fixtures and all. */
const setUp = () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opg-zip-test-'))
  distDir = path.join(workDir, 'dist')
  stagingDir = path.join(workDir, 'staging')
  zipPath = path.join(workDir, 'artifacts', 'opennms-grafana-plugin-12.0.2.zip')
  fs.mkdirSync(distDir)
  writeDistFile('module.js', 'console.log("plugin")')
  writeDistFile('plugin.json', JSON.stringify({ id: pkgId }))
  writeDistFile('img/logo.svg', '<svg/>')
  writeDistFile('test/react/support/fixtures/helm-v8-dashboard.json', '{}')
}

const tearDown = () => fs.rmSync(workDir, { recursive: true, force: true })

const build = (overrides: any = {}) =>
  buildZip({ distDir, stagingDir, zipPath, pkgId, ...overrides })

/** Entry names inside the built zip, one per line. */
const entries = () =>
  execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf-8' }).trim().split('\n')

describe('findZip', () => {
  it('should locate the zip executable when it is installed', () => {
    // Guards the not-found branch: if this returns null on a machine that has zip,
    // the lookup itself is broken rather than the tool being absent.
    expect(typeof findZip()).toEqual('string')
  })
})

const describeZip = findZip() ? describe : describe.skip

if (!findZip()) {
  console.warn('zip not found on PATH; skipping the ZIP end-to-end tests')
}

describeZip('buildZip', () => {
  beforeEach(setUp)
  afterEach(tearDown)

  it('should write the zip to the requested path', async () => {
    await build()

    expect(fs.existsSync(zipPath)).toBe(true)
  })

  it('should root every entry at the plugin id', async () => {
    // Grafana loads a plugin zip by its top-level directory; a zip rooted at the
    // dist contents instead would install to the wrong directory name.
    await build()

    entries().forEach((entry) => expect(entry.startsWith(pkgId + '/')).toBe(true))
  })

  it('should include the built plugin files', async () => {
    await build()

    expect(entries()).toEqual(expect.arrayContaining([`${pkgId}/module.js`, `${pkgId}/img/logo.svg`]))
  })

  it('should not ship the jest fixtures webpack drags into dist', async () => {
    await build()

    expect(entries().filter((entry) => entry.includes('/test/'))).toEqual([])
  })

  it('should replace an existing zip rather than adding to it', async () => {
    // `zip` updates an archive in place by default, so a rebuild at the same version
    // would otherwise keep files that are no longer in dist.
    fs.mkdirSync(path.dirname(zipPath), { recursive: true })
    fs.writeFileSync(path.join(distDir, 'stale.js'), 'stale')
    await build()
    expect(entries()).toContain(`${pkgId}/stale.js`)

    fs.rmSync(path.join(distDir, 'stale.js'))
    await build()

    expect(entries()).not.toContain(`${pkgId}/stale.js`)
  })

  it('should remove its staging directory when the build succeeds', async () => {
    await build()

    expect(fs.existsSync(stagingDir)).toBe(false)
  })

  it('should remove its staging directory when the build fails', async () => {
    // The old script only cleaned up on the success path, so a failed run left a
    // full copy of dist behind.
    fs.rmSync(distDir, { recursive: true })

    await expect(build()).rejects.toThrow()

    expect(fs.existsSync(stagingDir)).toBe(false)
  })

  it('should fail with a message naming the real problem when dist is missing', async () => {
    fs.rmSync(distDir, { recursive: true })

    await expect(build()).rejects.toThrow(/npm run build/)
  })
})
