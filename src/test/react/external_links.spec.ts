import {
  isAbsoluteHttpUrl,
  normalizeBaseUrl,
  resolveOpenNMSLink,
  toOpenNMSRelativeUrl
} from '../../lib/externalLinks'
import { ClientDelegate } from '../../lib/client_delegate'

// The Grafana frontend rewrites a proxied datasource's url to this shape, and opennms-js
// builds Alarm.detailsPage by appending to it. See OnmsServer.resolveURL.
const PROXY_URL = '/api/datasources/proxy/uid/af2mze8mmd9moa'
const DETAILS_PAGE = `${PROXY_URL}/alarm/detail.htm?id=9849`

// In direct (browser) access mode Grafana leaves the datasource url as configured
const DIRECT_URL = 'http://onms.example.com/opennms'

describe('ExternalLinks :: normalizeBaseUrl', () => {
  it('should return an empty string when no base url is given', () => {
    expect(normalizeBaseUrl(undefined)).toEqual('')
    expect(normalizeBaseUrl('')).toEqual('')
    expect(normalizeBaseUrl('   ')).toEqual('')
  })

  it('should trim surrounding whitespace', () => {
    expect(normalizeBaseUrl('  http://localhost:8980/opennms  ')).toEqual('http://localhost:8980/opennms')
  })

  it('should drop a query or fragment, which cannot precede a path', () => {
    // The OpenNMS UI is hash-routed, so copying the address bar yields a trailing '#/'.
    // Appending to it gives '.../opennms/#/alarm/detail.htm', which lands on the root.
    expect(normalizeBaseUrl('http://localhost:8980/opennms/#/')).toEqual('http://localhost:8980/opennms')
    expect(normalizeBaseUrl('http://localhost:8980/opennms#/alarms')).toEqual('http://localhost:8980/opennms')
    expect(normalizeBaseUrl('http://localhost:8980/opennms?x=1')).toEqual('http://localhost:8980/opennms')
    expect(normalizeBaseUrl('http://localhost:8980/opennms/?x=1#/')).toEqual('http://localhost:8980/opennms')
  })

  it('should leave a relative datasource url alone, since it is used as a prefix to strip', () => {
    expect(normalizeBaseUrl('/api/datasources/proxy/uid/abc')).toEqual('/api/datasources/proxy/uid/abc')
    expect(normalizeBaseUrl('/api/datasources/proxy/uid/abc/')).toEqual('/api/datasources/proxy/uid/abc')
  })

  it('should strip trailing slashes so a relative path does not produce a double slash', () => {
    expect(normalizeBaseUrl('http://localhost:8980/opennms/')).toEqual('http://localhost:8980/opennms')
    expect(normalizeBaseUrl('http://localhost:8980/opennms///')).toEqual('http://localhost:8980/opennms')
  })
})

describe('ExternalLinks :: isAbsoluteHttpUrl', () => {
  it('should accept http and https urls', () => {
    expect(isAbsoluteHttpUrl('http://localhost:8980/opennms')).toBe(true)
    expect(isAbsoluteHttpUrl('https://onms.example.com/opennms')).toBe(true)
    expect(isAbsoluteHttpUrl('  HTTP://localhost:8980/opennms  ')).toBe(true)
  })

  it('should reject a value with no scheme, which the browser cannot resolve to OpenNMS', () => {
    // 'localhost:8980/...' parses as the unknown scheme 'localhost:', and
    // 'onms.example.com/...' as a path relative to the Grafana page
    expect(isAbsoluteHttpUrl('localhost:8980/opennms')).toBe(false)
    expect(isAbsoluteHttpUrl('onms.example.com/opennms')).toBe(false)
    expect(isAbsoluteHttpUrl('/opennms')).toBe(false)
  })

  it('should reject other schemes', () => {
    expect(isAbsoluteHttpUrl('ftp://onms.example.com/opennms')).toBe(false)
    expect(isAbsoluteHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isAbsoluteHttpUrl(undefined)).toBe(false)
    expect(isAbsoluteHttpUrl('')).toBe(false)
  })
})

describe('ExternalLinks :: toOpenNMSRelativeUrl', () => {
  it('should strip the Grafana datasource proxy prefix', () => {
    expect(toOpenNMSRelativeUrl(DETAILS_PAGE, PROXY_URL)).toEqual('/alarm/detail.htm?id=9849')
  })

  it('should strip the datasource url even when it has a trailing slash', () => {
    expect(toOpenNMSRelativeUrl(DETAILS_PAGE, `${PROXY_URL}/`)).toEqual('/alarm/detail.htm?id=9849')
  })

  it('should strip an absolute datasource url, as used in direct/browser access mode', () => {
    const url = 'http://host.docker.internal:8980/opennms/alarm/detail.htm?id=1'
    expect(toOpenNMSRelativeUrl(url, 'http://host.docker.internal:8980/opennms')).toEqual('/alarm/detail.htm?id=1')
  })

  it('should keep the url, with a leading slash, when it does not start with the datasource url', () => {
    expect(toOpenNMSRelativeUrl('alarm/detail.htm?id=7', PROXY_URL)).toEqual('/alarm/detail.htm?id=7')
    expect(toOpenNMSRelativeUrl('/alarm/detail.htm?id=7', '/some/other/base')).toEqual('/alarm/detail.htm?id=7')
  })

  it('should keep the url when there is no datasource url to strip', () => {
    expect(toOpenNMSRelativeUrl('/alarm/detail.htm?id=7', undefined)).toEqual('/alarm/detail.htm?id=7')
  })

  it('should only strip the datasource url at a path boundary', () => {
    // A provisioned datasource can set a human-readable uid, so one uid can be a prefix of
    // another. Matching on the raw string would leave '/-entity/alarm/detail.htm?id=1'.
    const url = '/api/datasources/proxy/uid/opennms-entity/alarm/detail.htm?id=1'

    expect(toOpenNMSRelativeUrl(url, '/api/datasources/proxy/uid/opennms')).toEqual(url)
  })

  it('should still strip a datasource url that ends exactly at the path boundary', () => {
    expect(toOpenNMSRelativeUrl(DETAILS_PAGE, PROXY_URL)).toEqual('/alarm/detail.htm?id=9849')
    expect(toOpenNMSRelativeUrl(`${PROXY_URL}/alarm/detail.htm`, PROXY_URL)).toEqual('/alarm/detail.htm')
  })

  it('should leave an absolute url untouched when it does not match the datasource url', () => {
    // Reachable while the panel's datasource is switched: useOpenNMSClient resolves the new
    // client asynchronously while useAlarm still holds the alarm fetched from the old one.
    // Prepending '/' here would yield '/http://other.example.com/...'.
    const url = 'http://other.example.com/opennms/alarm/detail.htm?id=1'

    expect(toOpenNMSRelativeUrl(url, PROXY_URL)).toEqual(url)
    expect(toOpenNMSRelativeUrl(url, undefined)).toEqual(url)
  })
})

describe('ExternalLinks :: resolveOpenNMSLink', () => {
  it('should return undefined when there is no url to resolve', () => {
    const options = { datasourceUrl: PROXY_URL, baseUrl: 'http://localhost:8980/opennms', enabled: true }

    expect(resolveOpenNMSLink(undefined, options)).toBeUndefined()
    expect(resolveOpenNMSLink('', options)).toBeUndefined()
    expect(resolveOpenNMSLink('   ', options)).toBeUndefined()
  })

  it('should build an absolute url when enabled with a base url', () => {
    const link = resolveOpenNMSLink(DETAILS_PAGE, {
      datasourceUrl: PROXY_URL,
      baseUrl: 'http://localhost:8980/opennms',
      enabled: true
    })

    expect(link).toEqual({ href: 'http://localhost:8980/opennms/alarm/detail.htm?id=9849', isAbsolute: true })
  })

  it('should not produce a double slash when the base url has a trailing slash', () => {
    const link = resolveOpenNMSLink(DETAILS_PAGE, {
      datasourceUrl: PROXY_URL,
      baseUrl: 'http://localhost:8980/opennms/',
      enabled: true
    })

    expect(link?.href).toEqual('http://localhost:8980/opennms/alarm/detail.htm?id=9849')
  })

  it('should fall back to the relative url when disabled, even if a base url is saved', () => {
    const link = resolveOpenNMSLink(DETAILS_PAGE, {
      datasourceUrl: PROXY_URL,
      baseUrl: 'http://localhost:8980/opennms',
      enabled: false
    })

    expect(link).toEqual({ href: '/alarm/detail.htm?id=9849', isAbsolute: false })
  })

  it('should fall back to the relative url when enabled but the base url is blank', () => {
    const link = resolveOpenNMSLink(DETAILS_PAGE, {
      datasourceUrl: PROXY_URL,
      baseUrl: '   ',
      enabled: true
    })

    expect(link).toEqual({ href: '/alarm/detail.htm?id=9849', isAbsolute: false })
  })

  it('should pass the url through, with a leading slash, when there is no datasource url to strip', () => {
    const link = resolveOpenNMSLink('alarm/detail.htm?id=7', {})

    expect(link).toEqual({ href: '/alarm/detail.htm?id=7', isAbsolute: false })
  })

  it('should keep a direct-access datasource link absolute when no base url is configured', () => {
    // In direct (browser) access mode the datasource url is one the browser reaches itself, so
    // opennms-js already produced a working link. Reducing it to a path would break it.
    const link = resolveOpenNMSLink(`${DIRECT_URL}/alarm/detail.htm?id=9849`, { datasourceUrl: DIRECT_URL })

    expect(link).toEqual({ href: `${DIRECT_URL}/alarm/detail.htm?id=9849`, isAbsolute: true })
  })

  it('should keep a direct-access datasource link absolute when the setting is explicitly off', () => {
    const link = resolveOpenNMSLink(`${DIRECT_URL}/alarm/detail.htm?id=9849`, {
      datasourceUrl: DIRECT_URL,
      baseUrl: 'http://elsewhere.example.com/opennms',
      enabled: false
    })

    expect(link).toEqual({ href: `${DIRECT_URL}/alarm/detail.htm?id=9849`, isAbsolute: true })
  })

  it('should let a configured base url re-root a direct-access link', () => {
    const link = resolveOpenNMSLink(`${DIRECT_URL}/alarm/detail.htm?id=9849`, {
      datasourceUrl: DIRECT_URL,
      baseUrl: 'http://elsewhere.example.com/opennms',
      enabled: true
    })

    expect(link).toEqual({ href: 'http://elsewhere.example.com/opennms/alarm/detail.htm?id=9849', isAbsolute: true })
  })

  it('should build a usable link from a base url copied out of the hash-routed OpenNMS UI', () => {
    const link = resolveOpenNMSLink(DETAILS_PAGE, {
      datasourceUrl: PROXY_URL,
      baseUrl: 'http://localhost:8980/opennms/#/',
      enabled: true
    })

    expect(link).toEqual({ href: 'http://localhost:8980/opennms/alarm/detail.htm?id=9849', isAbsolute: true })
  })

  it('should ignore a base url with no scheme rather than build a link that leads nowhere', () => {
    for (const baseUrl of ['localhost:8980/opennms', 'onms.example.com/opennms', 'ftp://onms.example.com/opennms']) {
      const link = resolveOpenNMSLink(DETAILS_PAGE, { datasourceUrl: PROXY_URL, baseUrl, enabled: true })

      expect(link).toEqual({ href: '/alarm/detail.htm?id=9849', isAbsolute: false })
    }
  })

  it('should not re-root a stale url still carrying another datasource proxy prefix', () => {
    // Same datasource-switch window as the absolute case below, but in proxy mode - the mode
    // this feature exists for - the stale url is relative, so a scheme check alone misses it.
    const stale = '/api/datasources/proxy/uid/bbbbbbbbbbbbbb/alarm/detail.htm?id=1'

    expect(resolveOpenNMSLink(stale, {
      datasourceUrl: PROXY_URL,
      baseUrl: 'http://localhost:8980/opennms',
      enabled: true
    })).toBeUndefined()
  })

  it('should not present a stale proxy url as a relative path when no base url is configured', () => {
    const stale = '/api/datasources/proxy/uid/bbbbbbbbbbbbbb/alarm/detail.htm?id=1'

    expect(resolveOpenNMSLink(stale, { datasourceUrl: PROXY_URL })).toBeUndefined()
  })

  it('should still resolve an OpenNMS-relative url that is not a proxy path', () => {
    const link = resolveOpenNMSLink('/alarm/detail.htm?id=1', {
      datasourceUrl: PROXY_URL,
      baseUrl: 'http://localhost:8980/opennms',
      enabled: true
    })

    expect(link).toEqual({ href: 'http://localhost:8980/opennms/alarm/detail.htm?id=1', isAbsolute: true })
  })

  it('should never concatenate the base url onto an absolute url from another datasource', () => {
    const url = 'http://other.example.com/opennms/alarm/detail.htm?id=1'
    const link = resolveOpenNMSLink(url, {
      datasourceUrl: PROXY_URL,
      baseUrl: 'http://localhost:8980/opennms',
      enabled: true
    })

    expect(link).toEqual({ href: url, isAbsolute: true })
  })
})

describe('ClientDelegate :: getOpenNMSLink', () => {
  const settingsFor = (jsonData: object) => ({
    url: PROXY_URL,
    type: 'opennms-entity-datasource',
    name: 'opennms-entity-datasource',
    jsonData
  })

  it('should build an absolute link when the OpenNMS Base URL is enabled', () => {
    const client = new ClientDelegate(settingsFor({
      useOpenNMSBaseUrl: true,
      opennmsBaseUrl: 'http://localhost:8980/opennms'
    }), undefined)

    expect(client.getOpenNMSLink(DETAILS_PAGE)).toEqual({
      href: 'http://localhost:8980/opennms/alarm/detail.htm?id=9849',
      isAbsolute: true
    })
  })

  it('should build a relative link when the OpenNMS Base URL is not enabled', () => {
    const client = new ClientDelegate(settingsFor({
      useOpenNMSBaseUrl: false,
      opennmsBaseUrl: 'http://localhost:8980/opennms'
    }), undefined)

    expect(client.getOpenNMSLink(DETAILS_PAGE)).toEqual({
      href: '/alarm/detail.htm?id=9849',
      isAbsolute: false
    })
  })

  it('should build a relative link for a datasource saved before this setting existed', () => {
    const client = new ClientDelegate(settingsFor({}), undefined)

    expect(client.getOpenNMSLink(DETAILS_PAGE)).toEqual({
      href: '/alarm/detail.htm?id=9849',
      isAbsolute: false
    })
  })

  it('should return undefined when the alarm has no details page', () => {
    const client = new ClientDelegate(settingsFor({ useOpenNMSBaseUrl: true, opennmsBaseUrl: 'http://x/opennms' }), undefined)

    expect(client.getOpenNMSLink(undefined)).toBeUndefined()
  })
})
