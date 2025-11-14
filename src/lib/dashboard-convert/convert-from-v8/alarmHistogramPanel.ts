import { AlarmDirections, AlarmGroups } from '../../../panels/alarm-histogram/constants'

export const isLegacyAlarmHistogramPanel = (panel: any) => {
  return panel && panel.type && panel.type === 'opennms-helm-alarm-histogram-panel'
}

export const convertLegacyAlarmHistogramPanel = (source: any) => {
  const panel = {
    ...source,
    type: 'opennms-alarm-histogram-panel',
    options: createOptions(source)
  }

  // remove legacy fields that are not in new data structure
  // targets should already have been converted
  delete panel.direction
  delete panel.groupProperty

  return panel
}

const getAlarmDirection = (source: any) => {
  const legacyDirection: string = source.direction || 'horizontal'

  if (legacyDirection === 'horizontal') {
    return AlarmDirections.Horizontal.value
  } else if (legacyDirection === 'vertical') {
    return AlarmDirections.Vertical.value
  }

  return AlarmDirections.Horizontal.value
}

const getAlarmGroup = (source: any) => {
  const legacyGroup: string = source.groupProperty || 'acknowledged'

  if (legacyGroup === 'acknowledged') {
    return AlarmGroups.Acknowledged.value
  } else if (legacyGroup === 'severity') {
    return AlarmGroups.Severity.value
  }

  return AlarmDirections.Horizontal.value
}

const createOptions = (source: any) => {
  const options = {
    alarmDirection: getAlarmDirection(source),
    alarmGroup: getAlarmGroup(source)
  }

  return options
}
