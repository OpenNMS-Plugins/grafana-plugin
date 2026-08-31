import { setLegend } from '../../panels/flow-histogram/FlowHistogramHelpers'

// Minimal stand-in for the panel options setLegend actually reads.
const optionsWith = (showLegend: boolean) =>
  ({ flowHistogramOptions: { showLegend } }) as any

// Mirrors the DOM flot produces: a `.legend` rendered inside the plot container.
const makePlot = (legendMarkup?: string) => {
  const plot = document.createElement('div')

  if (legendMarkup !== undefined) {
    const legend = document.createElement('div')
    legend.className = 'legend'
    legend.innerHTML = legendMarkup
    plot.appendChild(legend)
  }

  return plot
}

describe('FlowHistogramHelpers :: setLegend', () => {
  it('should move the flot legend out of the plot and into the legend element', () => {
    const plot = makePlot('<table><tbody><tr><td>in</td></tr></tbody></table>')
    const legendElement = document.createElement('div')

    setLegend(plot, legendElement, optionsWith(true))

    expect(legendElement.querySelector('table')).not.toBeNull()
    expect(legendElement.textContent).toEqual('in')
    // the now-empty flot legend wrapper is removed from the plot
    expect(plot.querySelector('.legend')).toBeNull()
  })

  it('should replace content from a previous render rather than appending to it', () => {
    const legendElement = document.createElement('div')
    legendElement.innerHTML = '<table><tbody><tr><td>stale</td></tr></tbody></table>'

    setLegend(makePlot('<table><tbody><tr><td>fresh</td></tr></tbody></table>'), legendElement, optionsWith(true))

    expect(legendElement.textContent).toEqual('fresh')
    expect(legendElement.querySelectorAll('table').length).toEqual(1)
  })

  it('should clear a previously moved legend when the legend is turned off', () => {
    const legendElement = document.createElement('div')
    legendElement.innerHTML = '<table><tbody><tr><td>stale</td></tr></tbody></table>'

    setLegend(makePlot(), legendElement, optionsWith(false))

    expect(legendElement.hasChildNodes()).toEqual(false)
  })

  it('should leave the legend element alone when flot rendered no legend', () => {
    const legendElement = document.createElement('div')

    setLegend(makePlot(), legendElement, optionsWith(true))
    setLegend(makePlot(''), legendElement, optionsWith(true))

    expect(legendElement.hasChildNodes()).toEqual(false)
  })

  it('should not throw before the refs are attached', () => {
    expect(() => setLegend(null, null, optionsWith(true))).not.toThrow()
    expect(() => setLegend(makePlot('<table></table>'), null, optionsWith(true))).not.toThrow()
  })

  it('should only touch the panel it was given, not other panels on the dashboard', () => {
    // the previous implementation used document-wide selectors, so a second panel
    // would steal the first panel's legend
    const plotA = makePlot('<table><tbody><tr><td>panel A</td></tr></tbody></table>')
    const plotB = makePlot('<table><tbody><tr><td>panel B</td></tr></tbody></table>')
    const legendA = document.createElement('div')
    const legendB = document.createElement('div')
    document.body.append(plotA, plotB, legendA, legendB)

    setLegend(plotA, legendA, optionsWith(true))
    setLegend(plotB, legendB, optionsWith(true))

    expect(legendA.textContent).toEqual('panel A')
    expect(legendB.textContent).toEqual('panel B')

    document.body.replaceChildren()
  })
})
