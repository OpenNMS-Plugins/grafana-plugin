import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildDeb, findBuiltDebs, findDpkgBuildpackage, stageDebTree } from '../../../scripts/deb/build'

const pkgInfo = {
  name: 'opennms-grafana-plugin',
  description: 'An OpenNMS Integration for Grafana',
  spec: { requires: ['grafana >= 12.0.0'] }
}

const pluginInfo = { id: 'opennms-opennms-app' }
const maintainer = 'OpenNMS Build Account <opennms@opennms.org>'

let workDir: string
let distDir: string
let stageDir: string

const writeDistFile = (relativePath: string, contents = 'x') => {
  const target = path.join(distDir, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents)
}

/** A dist tree shaped like a real production build, fixtures and all. */
const setUp = () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opg-deb-test-'))
  distDir = path.join(workDir, 'dist')
  stageDir = path.join(workDir, 'staged')
  fs.mkdirSync(distDir)
  writeDistFile('module.js', 'console.log("plugin")')
  writeDistFile('plugin.json', JSON.stringify({ id: pluginInfo.id }))
  writeDistFile('img/logo.svg', '<svg/>')
  writeDistFile('test/react/support/fixtures/helm-v8-dashboard.json', '{}')
}

const tearDown = () => fs.rmSync(workDir, { recursive: true, force: true })

const stage = (overrides: any = {}) =>
  stageDebTree({ distDir, workDir: stageDir, pkgInfo, version: '12.0.2', release: '1', maintainer, ...overrides })

const readStaged = (relativePath: string) => fs.readFileSync(path.join(stageDir, relativePath), 'utf-8')
const stagedExists = (relativePath: string) => fs.existsSync(path.join(stageDir, relativePath))

describe('stageDebTree', () => {
  beforeEach(setUp)
  afterEach(tearDown)

  it('should stage the built plugin files', async () => {
    await stage()

    expect(stagedExists('module.js')).toBe(true)
    expect(stagedExists('img/logo.svg')).toBe(true)
  })

  it('should not stage the jest fixtures webpack drags into dist', async () => {
    await stage()

    expect(stagedExists('test')).toBe(false)
  })

  it('should copy the debian control files the package needs', async () => {
    await stage()

    expect(stagedExists('debian/rules')).toBe(true)
    expect(stagedExists('debian/compat')).toBe(true)
    expect(stagedExists('debian/source/format')).toBe(true)
    expect(stagedExists('debian/opennms-grafana-plugin.postinst')).toBe(true)
  })

  it('should render the templates rather than copying them through', async () => {
    // A stray control.mustache in debian/ would be packaged as a file, and dpkg would
    // read the unrendered template as the real control.
    await stage()

    expect(stagedExists('debian/control.mustache')).toBe(false)
  })

  it('should write a control naming the maintainer and the grafana dependency', async () => {
    await stage()

    expect(readStaged('debian/control')).toContain('Maintainer: ' + maintainer)
    expect(readStaged('debian/control')).toContain('Depends: grafana (>= 12.0.0)')
  })

  it('should write a changelog for the version and release being built', async () => {
    await stage()

    expect(readStaged('debian/changelog')).toContain('opennms-grafana-plugin (12.0.2-1)')
    expect(readStaged('debian/changelog')).toContain('-- ' + maintainer)
  })

  it('should fail with a message naming the real problem when dist is missing', async () => {
    fs.rmSync(distDir, { recursive: true })

    await expect(stage()).rejects.toThrow(/npm run build/)
  })
})

describe('findBuiltDebs', () => {
  beforeEach(setUp)
  afterEach(tearDown)

  it('should find the built deb', () => {
    fs.writeFileSync(path.join(workDir, 'opennms-grafana-plugin_12.0.2-1_all.deb'), '')

    expect(findBuiltDebs(workDir)).toEqual([path.join(workDir, 'opennms-grafana-plugin_12.0.2-1_all.deb')])
  })

  it('should ignore the other files dpkg-buildpackage leaves beside it', () => {
    // dpkg-buildpackage also writes .dsc, .changes, .buildinfo and a source tarball;
    // only the .deb is the artifact we publish.
    ;['_12.0.2-1_amd64.changes', '_12.0.2-1_amd64.buildinfo', '_12.0.2-1.dsc', '_12.0.2-1.tar.gz'].forEach(
      (suffix) => fs.writeFileSync(path.join(workDir, 'opennms-grafana-plugin' + suffix), '')
    )
    fs.writeFileSync(path.join(workDir, 'opennms-grafana-plugin_12.0.2-1_all.deb'), '')

    expect(findBuiltDebs(workDir)).toHaveLength(1)
  })

  it('should return nothing when the directory does not exist', () => {
    expect(findBuiltDebs(path.join(workDir, 'nope'))).toEqual([])
  })
})

const describeDeb = findDpkgBuildpackage() ? describe : describe.skip

if (!findDpkgBuildpackage()) {
  console.warn('dpkg-buildpackage not found on PATH; skipping the DEB end-to-end tests')
}

describeDeb('buildDeb', () => {
  let buildRoot: string
  let artifactsDir: string

  beforeEach(() => {
    setUp()
    buildRoot = path.join(workDir, 'build')
    artifactsDir = path.join(workDir, 'artifacts')
  })
  afterEach(tearDown)

  const build = (overrides: any = {}) =>
    buildDeb({
      distDir,
      buildRoot,
      artifactsDir,
      pkgInfo,
      pluginInfo,
      version: '12.0.2',
      release: '1',
      maintainer,
      ...overrides
    })

  it('should publish exactly one deb into the artifacts directory', async () => {
    const { debPath } = await build()

    expect(debPath).toEqual(path.join(artifactsDir, 'opennms-grafana-plugin_12.0.2-1_all.deb'))
    expect(fs.existsSync(debPath)).toBe(true)
  })

  it('should not publish the dsc, changes, buildinfo or source tarball beside it', async () => {
    // dpkg-buildpackage writes all of those next to the deb. The build used to run
    // inside artifacts/, so CI stored every one of them as a build artifact.
    await build()

    expect(fs.readdirSync(artifactsDir)).toEqual(['opennms-grafana-plugin_12.0.2-1_all.deb'])
  })

  it('should remove its build directory when the build succeeds', async () => {
    await build()

    expect(fs.existsSync(buildRoot)).toBe(false)
  })

  it('should remove its build directory when the build fails', async () => {
    // The old script only cleaned up on the success path, and built inside artifacts/,
    // so a failed run left a full copy of dist where CI collects build artifacts.
    fs.rmSync(distDir, { recursive: true })

    await expect(build()).rejects.toThrow()

    expect(fs.existsSync(buildRoot)).toBe(false)
  })
})
