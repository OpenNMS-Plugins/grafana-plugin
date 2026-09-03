import { resolveMaintainer } from '../../../scripts/deb/maintainer'
import { renderChangelog, renderControl, toDebianDepends } from '../../../scripts/deb/metadata'
import realPkgInfo from '../../../package.json'

const pkgInfo = {
  name: 'opennms-grafana-plugin',
  description: 'An OpenNMS Integration for Grafana',
  spec: { requires: ['grafana >= 12.0.0'] }
}

describe('resolveMaintainer', () => {
  it('should default to the OpenNMS build account', () => {
    expect(resolveMaintainer({})).toEqual('OpenNMS Build Account <opennms@opennms.org>')
  })

  it('should honour DEBFULLNAME and DEBEMAIL', () => {
    // The standard Debian variables, already set by the OpenNMS build environment.
    expect(resolveMaintainer({ DEBFULLNAME: 'Someone Else', DEBEMAIL: 'someone@example.com' })).toEqual(
      'Someone Else <someone@example.com>'
    )
  })

  it('should honour either variable on its own', () => {
    expect(resolveMaintainer({ DEBEMAIL: 'someone@example.com' })).toEqual(
      'OpenNMS Build Account <someone@example.com>'
    )
    expect(resolveMaintainer({ DEBFULLNAME: 'Someone Else' })).toEqual('Someone Else <opennms@opennms.org>')
  })

  it('should ignore empty variables rather than emitting an empty identity', () => {
    expect(resolveMaintainer({ DEBFULLNAME: '', DEBEMAIL: '' })).toEqual(
      'OpenNMS Build Account <opennms@opennms.org>'
    )
  })
})

/**
 * Golden test for the generated debian/control. If a diff is intentional, read it
 * carefully before running jest -u: this is package metadata users see via
 * `dpkg -f Maintainer`.
 */
describe('renderControl :: golden output', () => {
  it('should render control for the real package.json', () => {
    expect(renderControl({ pkgInfo: realPkgInfo, maintainer: resolveMaintainer({}) })).toMatchSnapshot()
  })
})

describe('renderControl', () => {
  const control = () => renderControl({ pkgInfo, maintainer: 'OpenNMS Build Account <opennms@opennms.org>' })

  it('should set the maintainer', () => {
    expect(control()).toContain('Maintainer: OpenNMS Build Account <opennms@opennms.org>')
  })

  it('should not cite a former maintainer', () => {
    expect(control()).not.toContain('Benjamin Reed')
    expect(control()).not.toContain('ranger@')
  })

  it('should name the source and binary package from package.json', () => {
    expect(control()).toContain('Source: opennms-grafana-plugin')
    expect(control()).toContain('Package: opennms-grafana-plugin')
  })

  it('should take Depends from the same spec.requires the RPM uses', () => {
    expect(control()).toContain('Depends: grafana (>= 12.0.0)')
    expect(control()).not.toContain('9.0')
  })

  it('should omit Depends entirely when nothing is required', () => {
    const bare = renderControl({ pkgInfo: { ...pkgInfo, spec: {} }, maintainer: 'A <a@b.c>' })

    // Careful: Build-Depends also contains "Depends:", so match the field at line start.
    expect(bare.split('\n').some((line) => line.startsWith('Depends:'))).toEqual(false)
    expect(bare).toContain('Build-Depends: debhelper (>= 9)')
    expect(bare).toContain('Package: opennms-grafana-plugin')
  })
})

/**
 * The RPM takes its Requires straight from package.json spec.requires. The deb takes
 * the same list so the two packages cannot disagree about which Grafana they need,
 * which they previously did: the deb said 9.0 while the RPM and plugin.json said 12.
 */
describe('toDebianDepends', () => {
  it('should parenthesise a versioned dependency the way dpkg expects', () => {
    expect(toDebianDepends(['grafana >= 12.0.0'])).toEqual('grafana (>= 12.0.0)')
  })

  it('should join multiple dependencies with commas', () => {
    expect(toDebianDepends(['grafana >= 12.0.0', 'jq >= 1.6'])).toEqual('grafana (>= 12.0.0), jq (>= 1.6)')
  })

  it('should leave an unversioned dependency bare', () => {
    expect(toDebianDepends(['jq'])).toEqual('jq')
  })

  it('should translate strict inequalities to the Debian spelling', () => {
    // Debian reads `>` and `<` as `>=` and `<=`; `>>` and `<<` are the strict forms.
    expect(toDebianDepends(['grafana > 12.0.0'])).toEqual('grafana (>> 12.0.0)')
    expect(toDebianDepends(['grafana < 13.0.0'])).toEqual('grafana (<< 13.0.0)')
  })

  it('should pass through the remaining operators unchanged', () => {
    expect(toDebianDepends(['grafana <= 12.9'])).toEqual('grafana (<= 12.9)')
    expect(toDebianDepends(['grafana = 12.0.0'])).toEqual('grafana (= 12.0.0)')
  })

  it('should tolerate irregular spacing', () => {
    expect(toDebianDepends(['grafana>=12.0.0'])).toEqual('grafana (>= 12.0.0)')
  })

  it('should return nothing for an empty list', () => {
    expect(toDebianDepends([])).toEqual('')
    expect(toDebianDepends(undefined)).toEqual('')
  })
})

describe('renderChangelog', () => {
  const changelog = (overrides: any = {}) =>
    renderChangelog({
      pkgInfo,
      version: '12.0.2',
      release: '0.27652.SNAPSHOT',
      maintainer: 'OpenNMS Build Account <opennms@opennms.org>',
      date: new Date(Date.UTC(2026, 8, 2, 21, 0, 0)),
      ...overrides
    })

  it('should open with the package name, version and release', () => {
    expect(changelog()).toContain('opennms-grafana-plugin (12.0.2-0.27652.SNAPSHOT) unstable; urgency=low')
  })

  it('should sign off as the maintainer in RFC822 form', () => {
    expect(changelog()).toContain(' -- OpenNMS Build Account <opennms@opennms.org>  Wed, 02 Sep 2026 21:00:00 +0000')
  })

  it('should not cite a former maintainer', () => {
    expect(changelog()).not.toContain('Benjamin Reed')
    expect(changelog()).not.toContain('ranger@')
  })

  it('should end with a newline so dpkg-parsechangelog can read it', () => {
    expect(changelog().endsWith('\n')).toEqual(true)
  })
})
