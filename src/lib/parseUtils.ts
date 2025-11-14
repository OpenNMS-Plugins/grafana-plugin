export const isUndefined = (obj?: any) => {
  return obj === undefined
}

export const isDefined = (obj?: any) => {
  return obj !== undefined
}

export const isNonEmptyArray = (obj?: any) => {
  return isDefined(obj) && Array.isArray(obj) && obj.length > 0
}

// check if a value is a valid string or numeric value for a given enum
export const isEnumValueOfType = <T extends Record<string, string | number>>(
  enumObject: T, value: string | number
): boolean => {
  return Object.values(enumObject).includes(value)
}

export const convertToInt = (source?: any, defaultValue?: number) => {
  if (typeof source !== undefined) {
    let val: number = defaultValue ?? 0

    if (typeof source === 'string') {
      val = parseInt(source, 10)
    } else {
      val = Number(source)
    }

    if (!isNaN(val)) {
      return val
    }
  }

  return defaultValue ?? 0
}

export const convertToNumber = (source?: any, defaultValue?: number) => {
  if (typeof source !== undefined) {
    const val = Number(source)

    if (!isNaN(val)) {
      return val
    }
  }

  return defaultValue ?? 0
}

export const convertToBoolean = (source?: any, defaultValue?: boolean) => {
  if (source !== undefined) {
    if (typeof source === 'boolean') {
      return Boolean(source)
    }

    if (typeof source === 'string') {
      if (source === 'true') {
        return true
      } else if (source === 'false') {
        return false
      }
    }

    if (typeof source === 'number') {
      const num = Number(source)

      if (num === 0) {
        return false
      } else if (num === 1) {
        return true
      }
    }
  }

  return defaultValue ?? false
}

export const convertToString = (obj?: any, defaultValue?: string) => {
  if (isDefined(obj)) {
    if (typeof obj === 'string') {
      return String(obj)
    }

    if (typeof obj === 'number') {
      return String(obj)
    }
  }

  return defaultValue ?? ''
}
