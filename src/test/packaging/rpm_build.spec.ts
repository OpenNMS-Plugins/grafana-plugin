import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { buildRpm, copyToArtifacts, findRpmbuild } from '../../../scripts/rpm/build'

const pkgInfo = {
  name: 'opennms-grafana-plugin',
  description: 'An OpenNMS Integration for Grafana',
  license: 'MIT',
  spec: {
    specTemplate: 'src/rpm/spec.mustache',
    installDir: '/var/lib/grafana/plugins',
    requires: ['grafana >= 12.0.0']
  }
}

const pluginInfo = { id: 'opennms-opennms-app' }

let workDir: string
let distDir: string
let topDir: string

const writeDistFile = (relativePath: string, contents = 'x') => {
  const target = path.join(distDir, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents)
}

/** A dist tree shaped like a real production build, fixtures and all. */
const setUpDist = () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opg-rpm-test-'))
  distDir = path.join(workDir, 'dist')
  topDir = path.join(workDir, 'rpmbuild')
  fs.mkdirSync(distDir)
  writeDistFile('module.js', 'console.log("plugin")')
  writeDistFile('plugin.json', JSON.stringify({ id: pluginInfo.id }))
  writeDistFile('img/logo.svg', '<svg/>')
  writeDistFile('test/react/support/fixtures/helm-v8-dashboard.json', '{}')
}

const tearDownDist = () => fs.rmSync(workDir, { recursive: true, force: true })

const build = (overrides: any = {}) =>
  buildRpm({
    distDir,
    topDir,
    pkgInfo: { ...pkgInfo, ...(overrides.pkgInfo || {}) },
    pluginInfo,
    version: '12.0.2',
    release: '0'
  })

const query = (rpmPath: string, args: string[]) =>
  execFileSync('rpm', ['-qp', '--nosignature', ...args, rpmPath], { encoding: 'utf-8' })

const rpmbuild = findRpmbuild()
const describeIfRpmbuild = rpmbuild ? describe : describe.skip

if (!rpmbuild) {
  console.warn('rpmbuild not found on PATH; skipping the RPM end-to-end tests')
}

describe('findRpmbuild', () => {
  it('should return a path or null rather than throwing', () => {
    expect(rpmbuild === null || typeof rpmbuild === 'string').toEqual(true)
  })
})

/**
 * End-to-end tests. These run rpmbuild and then interrogate the real package, which
 * is the only way to prove the installed layout rather than just the spec text.
 * rpmbuild is slow, so the read-only assertions all share one build.
 */
describeIfRpmbuild('buildRpm :: the built package', () => {
  let rpmPath: string

  beforeAll(async () => {
    setUpDist()
    rpmPath = (await build()).rpmPath
  }, 120000)

  afterAll(tearDownDist)

  it('should be named for the package version and release', () => {
    expect(path.basename(rpmPath)).toEqual('opennms-grafana-plugin-12.0.2-0.noarch.rpm')
    expect(fs.existsSync(rpmPath)).toEqual(true)
  })

  it('should record the package identity from package.json', () => {
    expect(query(rpmPath, ['--queryformat', '%{NAME} %{VERSION} %{RELEASE} %{ARCH} %{LICENSE}'])).toEqual(
      'opennms-grafana-plugin 12.0.2 0 noarch MIT'
    )
    expect(query(rpmPath, ['--queryformat', '%{SUMMARY}'])).toEqual('An OpenNMS Integration for Grafana')
  })

  it('should install the plugin into the Grafana plugin directory', () => {
    const files = query(rpmPath, ['--list']).trim().split('\n').sort()

    expect(files).toEqual([
      '/var/lib/grafana/plugins/opennms-opennms-app',
      '/var/lib/grafana/plugins/opennms-opennms-app/img',
      '/var/lib/grafana/plugins/opennms-opennms-app/img/logo.svg',
      '/var/lib/grafana/plugins/opennms-opennms-app/module.js',
      '/var/lib/grafana/plugins/opennms-opennms-app/plugin.json'
    ])
  })

  it('should own the installed files as the grafana user', () => {
    const owners = query(rpmPath, ['--queryformat', '[%{FILEUSERNAME}:%{FILEGROUPNAME}\n]']).trim().split('\n')

    expect(new Set(owners)).toEqual(new Set(['grafana:grafana']))
  })

  it('should require grafana and nothing from the node ecosystem', () => {
    const requires = query(rpmPath, ['--requires'])

    expect(requires).toContain('grafana >= 12.0.0')
    expect(requires).not.toContain('nodejs')
    expect(requires).not.toContain('npm')
  })

  /**
   * speculate 6.x generated a %pre that created a system user and a %post that ran
   * `systemctl enable` on a service unit that does not exist. A static asset plugin
   * needs no scriptlets at all.
   */
  it('should not carry any install scriptlets', () => {
    expect(query(rpmPath, ['--scripts']).trim()).toEqual('')
  })

  it('should not package the jest fixtures webpack copies into dist', () => {
    expect(query(rpmPath, ['--list'])).not.toContain('test')
  })

  it('should leave no generated spec or sources behind in dist', () => {
    expect(fs.existsSync(path.join(distDir, 'SPECS'))).toEqual(false)
    expect(fs.existsSync(path.join(distDir, 'SOURCES'))).toEqual(false)
  })
})

describeIfRpmbuild('buildRpm :: build behaviour', () => {
  beforeEach(setUpDist)
  afterEach(tearDownDist)

  it('should succeed when dist already holds a previous run\'s SPECS and SOURCES', async () => {
    // makerpm.js called speculate's clean() on the cwd rather than on dist, so a
    // leftover dist/SPECS made the next build fail with EEXIST.
    fs.mkdirSync(path.join(distDir, 'SPECS'), { recursive: true })
    fs.writeFileSync(path.join(distDir, 'SPECS', 'stale.spec'), 'stale')
    fs.mkdirSync(path.join(distDir, 'SOURCES'), { recursive: true })

    const { rpmPath } = await build()

    expect(fs.existsSync(rpmPath)).toEqual(true)
  }, 120000)

  it('should find the rpm when a dist tag qualifies the release', async () => {
    // The spec template emits `Release: %{release}.%{?dist}` when spec.dist is set,
    // so the built file is name-version-release.dist.arch.rpm. Reconstructing the
    // filename without the dist tag reported a successful build as a failure.
    const { rpmPath } = await build({ pkgInfo: { spec: { ...pkgInfo.spec, dist: 'el9' } } })

    expect(path.basename(rpmPath)).toEqual('opennms-grafana-plugin-12.0.2-0.el9.noarch.rpm')
    expect(fs.existsSync(rpmPath)).toEqual(true)
  }, 120000)

  it('should build for the host architecture when noarch is disabled', async () => {
    const { rpmPath } = await build({ pkgInfo: { spec: { ...pkgInfo.spec, noarch: false } } })

    expect(path.basename(rpmPath)).not.toContain('noarch')
    expect(fs.existsSync(rpmPath)).toEqual(true)
  }, 120000)

  it('should fail when rpmbuild fails', async () => {
    // rpmbuild -ba refuses to build when a BuildRequires cannot be satisfied. The
    // old script only inspected spawn's `error`, never its exit status, so a failed
    // rpmbuild went unnoticed until the artifact copy blew up.
    await expect(
      build({ pkgInfo: { spec: { ...pkgInfo.spec, buildRequires: ['opg-no-such-build-dependency'] } } })
    ).rejects.toThrow(/rpmbuild/i)
  }, 120000)
})

describe('copyToArtifacts', () => {
  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opg-artifacts-test-'))
  })

  afterEach(() => fs.rmSync(workDir, { recursive: true, force: true }))

  const writeRpm = (contents: string) => {
    const rpmPath = path.join(workDir, 'plugin-1.0.0-1.noarch.rpm')
    fs.writeFileSync(rpmPath, contents)
    return rpmPath
  }

  it('should copy the rpm into the artifacts directory, creating it if needed', () => {
    const artifactsDir = path.join(workDir, 'artifacts')

    const target = copyToArtifacts(writeRpm('one'), artifactsDir)

    expect(target).toEqual(path.join(artifactsDir, 'plugin-1.0.0-1.noarch.rpm'))
    expect(fs.readFileSync(target, 'utf-8')).toEqual('one')
  })

  it('should replace an rpm left over from an earlier build', () => {
    const artifactsDir = path.join(workDir, 'artifacts')
    fs.mkdirSync(artifactsDir)
    fs.writeFileSync(path.join(artifactsDir, 'plugin-1.0.0-1.noarch.rpm'), 'stale')

    const target = copyToArtifacts(writeRpm('fresh'), artifactsDir)

    expect(fs.readFileSync(target, 'utf-8')).toEqual('fresh')
  })
})
