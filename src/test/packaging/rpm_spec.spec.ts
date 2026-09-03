import { renderSpec } from '../../../scripts/rpm/spec'
import realPkgInfo from '../../../package.json'
import realPluginInfo from '../../plugin.json'

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

const render = (overrides: any = {}) =>
  renderSpec({
    pkgInfo: { ...pkgInfo, ...(overrides.pkgInfo || {}) },
    pluginInfo: { ...pluginInfo, ...(overrides.pluginInfo || {}) },
    version: overrides.version || '12.0.2',
    release: overrides.release || '0'
  })

/**
 * Golden test. Snapshots the whole rendered spec from the real package.json and
 * plugin.json, so any unintended change to the RPM shows up as a diff rather than as
 * a package that misbehaves after release. If a diff is intentional, read it
 * carefully before running jest -u.
 */
describe('renderSpec :: golden output', () => {
  it('should render the spec for the real package.json and plugin.json', () => {
    expect(
      renderSpec({ pkgInfo: realPkgInfo, pluginInfo: realPluginInfo, version: '12.0.2', release: '0' })
    ).toMatchSnapshot()
  })
})

describe('renderSpec', () => {
  it('should install into the configured install dir under the Grafana plugin id', () => {
    const spec = render()

    expect(spec).toContain('%define pluginid opennms-opennms-app')
    expect(spec).toContain('mkdir -p %{buildroot}/var/lib/grafana/plugins/%{pluginid}')
    expect(spec).toContain('/var/lib/grafana/plugins/%{pluginid}')
  })

  it('should copy from the archive root, not from a dist subdirectory', () => {
    // The source archive is rooted at dist/, so the extracted tree has no dist/ level.
    const spec = render()

    expect(spec).toContain('cp -r ./. %{buildroot}/var/lib/grafana/plugins/%{pluginid}')
    expect(spec).not.toMatch(/\.\/dist/)
  })

  it('should not HTML-escape paths in the rendered spec', () => {
    // mustache escapes `/` as `&#x2F;` with {{ }}, so the template must use {{{ }}}.
    expect(render()).not.toContain('&#x2F;')
  })

  it('should declare the requires from the spec config', () => {
    const spec = render()

    expect(spec).toContain('Requires: grafana >= 12.0.0')
  })

  it('should declare one Requires line per configured requirement', () => {
    const spec = render({ pkgInfo: { spec: { ...pkgInfo.spec, requires: ['grafana >= 12.0.0', 'jq'] } } })

    expect(spec).toContain('Requires: grafana >= 12.0.0')
    expect(spec).toContain('Requires: jq')
  })

  it('should build a noarch package', () => {
    expect(render()).toContain('BuildArch: noarch')
  })

  it('should own the installed files as the grafana user', () => {
    expect(render()).toContain('%defattr(644, grafana, grafana, 755)')
  })

  it('should use the package description as the summary', () => {
    const spec = render()

    expect(spec).toContain('Summary: An OpenNMS Integration for Grafana')
    expect(spec).not.toContain('Summary: opennms-grafana-plugin')
  })

  it('should set version and release from the arguments', () => {
    const spec = render({ version: '12.1.0', release: '7' })

    expect(spec).toContain('%define version 12.1.0')
    expect(spec).toContain('%define release 7')
    expect(spec).toContain('Release: %{release}')
  })

  it('should qualify the release with a dist tag when one is configured', () => {
    const spec = render({ pkgInfo: { spec: { ...pkgInfo.spec, dist: 'el9' } } })

    expect(spec).toContain('%define dist el9')
    expect(spec).toContain('Release: %{release}.%{?dist}')
  })

  it('should not emit a post-install scriptlet when none is configured', () => {
    expect(render()).not.toContain('%post')
  })

  it('should emit the configured post-install commands', () => {
    const spec = render({ pkgInfo: { spec: { ...pkgInfo.spec, post: ['echo hello'] } } })

    expect(spec).toContain('%post')
    expect(spec).toContain('echo hello')
  })

  /**
   * speculate 6.x ignores spec.specTemplate and renders its own systemd-service spec
   * instead, which is how the plugin came to be packaged into /usr/lib with a bogus
   * service unit and a system user. These assertions are the regression guard.
   */
  it('should not package the plugin as a systemd node service', () => {
    const spec = render()

    expect(spec).not.toContain('/usr/lib')
    expect(spec).not.toContain('/var/log')
    expect(spec).not.toContain('systemctl')
    expect(spec).not.toContain('useradd')
    expect(spec).not.toContain('groupadd')
    expect(spec).not.toContain('nodejs')
    expect(spec).not.toContain('npm')
    expect(spec).not.toContain('.service')
  })

  it('should reject a spec config with no install dir', () => {
    expect(() => render({ pkgInfo: { spec: { ...pkgInfo.spec, installDir: undefined } } })).toThrow(/installDir/)
  })

  it('should reject a plugin.json with no id', () => {
    expect(() => render({ pluginInfo: { id: undefined } })).toThrow(/id/)
  })

  it('should reject a missing spec template', () => {
    expect(() =>
      render({ pkgInfo: { spec: { ...pkgInfo.spec, specTemplate: 'src/rpm/does-not-exist.mustache' } } })
    ).toThrow(/does-not-exist\.mustache/)
  })
})
