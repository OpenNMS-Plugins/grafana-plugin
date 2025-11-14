import { FlowSegments, FlowSegmentStringsLowercase } from '../../../datasources/flow-ds/constants'

export const updateFlowQuery = (source: any) => {
  // items that are the same:
  // N
  // interfaceId
  // nodeCriteria

  let target: any = {
    ...source,
    segment: convertSegment(source),
    functions: convertFunctions(source),
    functionParameters: convertFunctionParameters(source),
    parameterOptions: convertParameterOptions(source)
  }

  // metric is replaced by segment
  delete target.metric

  return target
}

const convertSegment = (target: any) => {
  if (target.metric) {
    const metric = target.metric.toLowerCase()

    if (metric === FlowSegmentStringsLowercase.Applications) {
      return {
        value: FlowSegments.Applications,
        label: FlowSegmentStringsLowercase.Applications
      }
    } else if (metric === FlowSegmentStringsLowercase.Conversations) {
      return {
        value: FlowSegments.Conversations,
        label: FlowSegmentStringsLowercase.Conversations
      }
    } else if (metric === FlowSegmentStringsLowercase.Dscps) {
      return {
        value: FlowSegments.Dscps,
        label: FlowSegmentStringsLowercase.Dscps
      }
    } else if (metric === FlowSegmentStringsLowercase.Hosts) {
      return {
        value: FlowSegments.Hosts,
        label: FlowSegmentStringsLowercase.Hosts
      }
    }
  }

  return {
    value: -1,
    label: ''
  }
}

const convertFunctions = (target: any) => {
  const functions = target.functions?.map(f => {
    return {
      label: f.name
    }
  })

  return functions || []
}

const convertFunctionParameters = (target: any) => {
  const params = target.functions?.map(f => {
    return f.parameters ? f.parameters[0] : null
  })

  return params || []
}

const convertParameterOptions = (target: any) => {
  // TODO
  const options = target.functions?.map(f => {
    return {}
  })

  return options || []
}
