import {
  DirectionOptions,
  DisplayOptions,
  ModeOptions,
  PositionOptions,
  UnitOptions
} from '../../../panels/flow-histogram/FlowHistogramConstants'
import { FlowHistogramOptionsProps } from '../../../panels/flow-histogram/FlowHistogramTypes'

export const isLegacyFlowHistogramPanel = (panel: any) => {
  return panel && panel.type && panel.type === 'opennms-helm-flow-histogram-panel'
}

export const convertLegacyFlowHistogramPanel = (source: any) => {
  const panel = {
    ...source,
    type: 'opennms-flow-histogram-panel',
    options: createOptions(source)
  }

  // remove legacy fields that are not in new data structure
  // targets should already have been converted
  delete panel.aliasColors
  delete panel.direction
  delete panel.display
  delete panel.legend
  delete panel.legendType
  delete panel.mode
  delete panel.units

  return panel
}

const getDirectionOptions = (source: any) => {
  const direction = (source.direction || 'horizontal').toLowerCase()
  return DirectionOptions.find(x => x.label.toLowerCase() === direction) || DirectionOptions[0]
}

const getDisplayOptions = (source: any) => {
  const display = (source.display || 'total').toLowerCase()
  return DisplayOptions.find(x => x.label.toLowerCase() === display) || DisplayOptions[0]
}

const getModeOptions = (source: any) => {
  const mode = (source.mode || 'separate').toLowerCase()
  return ModeOptions.find(x => x.label.toLowerCase() === mode) || ModeOptions[0]
}

const getPositionOptions = (source: any) => {
  const legendType = (source.legendType || 'right side').toLowerCase()
  return PositionOptions.find(x => x.label.toLowerCase() === legendType) || PositionOptions[0]
}

const getUnitOptions = (source: any) => {
  const units = (source.units || 'b').toLowerCase()
  return UnitOptions.find(x => x.label.toLowerCase() === units) || UnitOptions[0]
}

const createOptions = (source: any) => {
  const options = {
    flowHistogramOptions: {
      direction: getDirectionOptions(source),
      display: getDisplayOptions(source),
      height: source.legend?.bottomHeight || 42,
      mode: getModeOptions(source),
      position: getPositionOptions(source),
      showLegend: source.legend.show || true,
      units: getUnitOptions(source)
    } as FlowHistogramOptionsProps
  }

  return options
}
