import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  collectIds,
  extractAnchorLinks,
  resolveTarget,
  findBrokenAnchors
} from '../../../scripts/docs/validateAnchors'

let siteDir: string

const writePage = (relativePath: string, body: string) => {
  const target = path.join(siteDir, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, '<!DOCTYPE html><html><body>' + body + '</body></html>')
}

/** A site tree shaped like Antora's output: versioned component, UI assets under _. */
const setUp = () => {
  siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opg-anchors-test-'))
  writePage('docs/1.0/a.html', '<h2 id="section-one">One</h2><a href="b.html#target">to b</a>')
  writePage('docs/1.0/b.html', '<h2 id="target">Target</h2>')
}

const tearDown = () => fs.rmSync(siteDir, { recursive: true, force: true })

beforeEach(setUp)
afterEach(tearDown)

describe('collectIds', () => {
  it('collects both id and name attributes', () => {
    expect(collectIds('<h2 id="one">x</h2><a name="two"></a>')).toEqual(new Set(['one', 'two']))
  })

  it('ignores empty values so href="#" cannot accidentally match', () => {
    expect(collectIds('<div id="">x</div>')).toEqual(new Set())
  })

  it('does not treat a substring of another attribute as an id', () => {
    expect(collectIds('<div data-id="nope">x</div>')).toEqual(new Set())
  })

  it('ignores meta name attributes, which are not anchors', () => {
    // Every Antora page carries these. Harvesting them made #description, #generator
    // and #viewport resolve on all 26 built pages -- #description being a plausible
    // typo for a section whose real id is _description.
    const html =
      '<meta name="description" content="x">' +
      '<meta name="generator" content="Antora">' +
      '<meta name="viewport" content="width=device-width">'

    expect(collectIds(html)).toEqual(new Set())
  })

  it('still honours a name attribute on an anchor element', () => {
    expect(collectIds('<a name="legacy"></a>')).toEqual(new Set(['legacy']))
  })
})

describe('extractAnchorLinks', () => {
  it('returns only hrefs carrying a fragment', () => {
    const html = '<a href="plain.html">a</a><a href="p.html#frag">b</a><a href="#local">c</a>'

    expect(extractAnchorLinks(html)).toEqual(['p.html#frag', '#local'])
  })
})

describe('resolveTarget', () => {
  const page = '/site/docs/1.0/a.html'

  it('resolves a fragment-only link against the page itself', () => {
    expect(resolveTarget(page, '#here')).toEqual({ file: page, fragment: 'here' })
  })

  it('resolves a relative page link', () => {
    expect(resolveTarget(page, '../2.0/b.html#here')).toEqual({
      file: '/site/docs/2.0/b.html',
      fragment: 'here'
    })
  })

  it('resolves a directory link to its index.html', () => {
    expect(resolveTarget(page, 'sub/#here')).toEqual({
      file: '/site/docs/1.0/sub/index.html',
      fragment: 'here'
    })
  })

  it('percent-decodes the fragment', () => {
    expect(resolveTarget(page, 'b.html#a%20b')).toEqual({
      file: '/site/docs/1.0/b.html',
      fragment: 'a b'
    })
  })

  it('keeps a malformed fragment as written rather than skipping the link', () => {
    expect(resolveTarget(page, 'b.html#100%')).toEqual({
      file: '/site/docs/1.0/b.html',
      fragment: '100%'
    })
  })

  it('skips a root-relative href, which cannot be mapped without site.url', () => {
    // Antora writes /grafana-plugin/_/css/site.css for a file at <siteDir>/_/css/site.css,
    // because site.url contributes the prefix. Resolving against the page escapes the
    // site dir; resolving against the site dir keeps a prefix that is not a directory.
    // Either way a correct link gets reported as broken.
    expect(resolveTarget(page, '/grafana-plugin/installation/upgrading.html#anchor')).toBeNull()
  })

  it.each([
    ['https://example.com/x#frag'],
    ['http://example.com/x#frag'],
    ['mailto:a@b.c#frag'],
    ['//example.com/x#frag'],
    ['#'],
    ['#_footnotedef_1'],
    ['#_footnoteref_2']
  ])('skips %s', (href) => {
    expect(resolveTarget(page, href)).toBeNull()
  })
})

describe('findBrokenAnchors', () => {
  it('passes a site whose anchors all resolve', () => {
    const result = findBrokenAnchors(siteDir)

    expect(result.problems).toEqual([])
    expect(result.checked).toBe(1)
    expect(result.pages).toBe(2)
  })

  it('catches a wrong anchor on a page that does exist', () => {
    // The whole reason this script exists: Antora resolves the page and says nothing.
    writePage('docs/1.0/a.html', '<a href="b.html#typo">to b</a>')

    const { problems } = findBrokenAnchors(siteDir)

    expect(problems).toHaveLength(1)
    expect(problems[0].href).toBe('b.html#typo')
    expect(problems[0].reason).toContain('no id="typo"')
    expect(problems[0].reason).toContain('b.html')
  })

  it('catches a dangling fragment-only link and names the page itself', () => {
    writePage('docs/1.0/a.html', '<a href="#nowhere">here</a>')

    const { problems } = findBrokenAnchors(siteDir)

    expect(problems).toHaveLength(1)
    expect(problems[0].reason).toBe('no id="nowhere" in this page')
  })

  it('reports a missing target page separately from a missing anchor', () => {
    writePage('docs/1.0/a.html', '<a href="gone.html#target">gone</a>')

    const { problems } = findBrokenAnchors(siteDir)

    expect(problems).toHaveLength(1)
    expect(problems[0].reason).toContain('target page not found')
  })

  it('ignores the UI bundle assets under _', () => {
    writePage('_/js/vendor.html', '<a href="#not-our-problem">x</a>')

    expect(findBrokenAnchors(siteDir).problems).toEqual([])
    expect(findBrokenAnchors(siteDir).pages).toBe(2)
  })

  it('tolerates a page with no article element, such as the redirect stub', () => {
    // Antora writes a bare redirect page at the site root; it has no <article>, which
    // is why this checks whole pages instead of scoping to one element.
    writePage('index.html', '<h1>Redirect Notice</h1><a href="docs/1.0/a.html">go</a>')

    expect(findBrokenAnchors(siteDir).problems).toEqual([])
  })

  it('does not report a root-relative link as broken', () => {
    writePage('docs/1.0/a.html', '<a href="/site/docs/1.0/b.html#target">to b</a>')

    expect(findBrokenAnchors(siteDir).problems).toEqual([])
  })

  it('explains itself when the site has not been built', () => {
    expect(() => findBrokenAnchors(path.join(siteDir, 'absent'))).toThrow(/npm run docs/)
  })
})
