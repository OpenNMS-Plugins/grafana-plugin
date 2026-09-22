/**
 * Helpers for building links out to a running OpenNMS instance.
 *
 * opennms-js builds urls such as Alarm.detailsPage from the datasource url, and whether that is
 * usable as a link target depends on the datasource's access mode:
 *
 * - Proxy access: the frontend url is Grafana's own '/api/datasources/proxy/uid/<uid>', and the
 *   configured url is one only the Grafana server need reach - typically a Docker
 *   'host.docker.internal' address. Neither reaches OpenNMS from the browser, so such links have
 *   to be re-rooted onto the base URL the user supplies via the "OpenNMS Base URL" setting.
 * - Direct (browser) access: the browser makes the API calls itself, so the datasource url is
 *   already browser-reachable and opennms-js produced a working link. It is left alone.
 */

export interface OpenNMSLink {
  href: string

  /**
   * True when href resolves to an OpenNMS instance on its own and can be presented as a link.
   * False when it is only an OpenNMS-relative path, which callers must not make clickable.
   */
  isAbsolute: boolean
}

export interface OpenNMSLinkOptions {
  /** The datasource url as seen by the frontend, used as the prefix to strip. */
  datasourceUrl?: string

  /** User-configured base URL of the OpenNMS instance, as reachable from the browser. */
  baseUrl?: string

  /** Whether the user has enabled the OpenNMS Base URL setting. */
  enabled?: boolean
}

/**
 * Reduce a url to the part a path can be appended to: origin and pathname, no trailing slash.
 *
 * A query or fragment has to go. The OpenNMS UI is hash-routed, so copying its address out of
 * the browser yields a trailing '#/', and appending to that gives '/opennms/#/alarm/detail.htm',
 * which lands on the root with a bogus route. Values that are not parseable as absolute urls -
 * a relative datasource url used as a prefix to strip, or a base url the user has not finished
 * typing - keep the plain trailing-slash trim.
 */
export const normalizeBaseUrl = (baseUrl: string | undefined): string => {
  const trimmed = (baseUrl ?? '').trim()

  try {
    const { origin, pathname } = new URL(trimmed)

    return `${origin}${pathname}`.replace(/\/+$/, '')
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

/**
 * Whether a url is one the browser can resolve on its own.
 *
 * A scheme is required: the browser reads 'localhost:8980/opennms' as the unknown scheme
 * 'localhost:', and 'onms.example.com/opennms' as a path relative to the Grafana page, so
 * neither reaches OpenNMS. sanitizeUrl passes both through unchanged.
 */
export const isAbsoluteHttpUrl = (url: string | undefined): boolean => {
  return /^https?:\/\//i.test((url ?? '').trim())
}

/** Grafana's own datasource proxy path. No OpenNMS instance serves anything under it. */
const GRAFANA_PROXY_PATH = /^\/api\/datasources\/proxy\//i

/**
 * Reduce a url built against the datasource url to a path relative to an OpenNMS instance,
 * e.g. '/alarm/detail.htm?id=9849'. The OpenNMS-relative portion comes from opennms-js, so the
 * page path never needs to be hardcoded here.
 */
export const toOpenNMSRelativeUrl = (url: string, datasourceUrl: string | undefined): string => {
  const prefix = normalizeBaseUrl(datasourceUrl)
  const relative = prefix && url.startsWith(prefix) ? url.slice(prefix.length) : undefined

  // The match has to land on a path boundary. Datasource uids are free text when provisioned,
  // so one can be a prefix of another: uid 'opennms' against a url from uid 'opennms-entity'
  // would otherwise leave '-entity/alarm/detail.htm' and build a plausible-looking dead link.
  if (relative !== undefined && (relative === '' || relative.startsWith('/'))) {
    return relative === '' ? '/' : relative
  }

  // The url did not come from this datasource, so there is no prefix of ours to remove. If it
  // already carries a scheme it stands on its own and must be left alone; prepending '/' would
  // turn it into '/http://host/...'.
  if (isAbsoluteHttpUrl(url)) {
    return url.trim()
  }

  return url.startsWith('/') ? url : `/${url}`
}

/**
 * Resolve a url built against the datasource url into a link for display.
 *
 * Returns an absolute link when the user has enabled and entered an OpenNMS Base URL, and
 * otherwise an OpenNMS-relative one, which callers should not present as clickable.
 * Returns undefined when there is no url to resolve.
 */
export const resolveOpenNMSLink = (url: string | undefined, options: OpenNMSLinkOptions): OpenNMSLink | undefined => {
  const trimmed = url?.trim()

  if (!trimmed) {
    return undefined
  }

  const relative = toOpenNMSRelativeUrl(trimmed, options.datasourceUrl)

  // A url that could not be reduced to a path did not come from this datasource; it already
  // resolves on its own, so it is returned as it stands rather than appended to the base url.
  if (isAbsoluteHttpUrl(relative)) {
    return { href: relative, isAbsolute: true }
  }

  // A leftover proxy path means the url was built against a different datasource than this
  // client: the panel's datasource was switched while useAlarm still held the cached alarm.
  // It cannot be mapped onto this instance, and re-rooting it would yield a confident-looking
  // dead link, so nothing is shown until the next render resolves the new client.
  if (GRAFANA_PROXY_PATH.test(relative)) {
    return undefined
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl)

  // A base url without a scheme cannot resolve, so it is ignored rather than used to build a
  // link that leads nowhere. The config editor reports it, but a datasource can also be
  // provisioned from YAML without ever passing through that editor.
  if (options.enabled && isAbsoluteHttpUrl(baseUrl)) {
    return { href: `${baseUrl}${relative}`, isAbsolute: true }
  }

  // Direct (browser) access mode: the datasource url is browser-reachable, so opennms-js
  // already built a working link and there is nothing to re-root.
  if (isAbsoluteHttpUrl(trimmed)) {
    return { href: trimmed, isAbsolute: true }
  }

  return { href: relative, isAbsolute: false }
}
