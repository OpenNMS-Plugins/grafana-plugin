export const isUndefined = (obj?: any) => {
  return obj === undefined
}

export const isDefined = (obj?: any) => {
  return obj !== undefined
}

// A Json value may be null, which passes isDefined but cannot have properties read off it.
// Use this to guard a call that is going to dereference the object.
export const isDefinedObject = (obj?: any) => {
  return obj !== undefined && obj !== null && typeof obj === 'object'
}

export const isNonEmptyArray = (obj?: any) => {
  return isDefined(obj) && Array.isArray(obj) && obj.length > 0
}

// check if a value is a valid string or numeric value for a given enum
// Note that TypeScript numeric enums also have reverse mappings, so Object.values()
// yields both the names and the numbers (e.g. ['dontHide', ..., 0, 1, 2, 3]).
// Only the numbers are valid values, so exclude the names for numeric enums.
export const isEnumValueOfType = <T extends Record<string, string | number>>(
  enumObject: T, value: string | number
): boolean => {
  const values = Object.values(enumObject)
  const isNumericEnum = values.some(v => typeof v === 'number')

  return values
    .filter(v => !isNumericEnum || typeof v === 'number')
    .includes(value)
}

export const convertToInt = (source?: any, defaultValue?: number) => {
  const fallback: number = defaultValue ?? 0

  if (source !== undefined) {
    const val = typeof source === 'string' ? Number.parseInt(source, 10) : Number(source)

    if (!Number.isNaN(val)) {
      return val
    }
  }

  return fallback
}

export const convertToNumber = (source?: any, defaultValue?: number) => {
  if (source !== undefined) {
    const val = Number(source)

    if (!Number.isNaN(val)) {
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
