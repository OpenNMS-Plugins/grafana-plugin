import { VariableHide } from '@grafana/schema'
import { convertToInt, isEnumValueOfType } from '../../lib/parseUtils'

describe('parseUtils :: convertToInt', () => {
  it('should parse integer strings and numbers', () => {
    expect(convertToInt('42')).toEqual(42)
    expect(convertToInt(42)).toEqual(42)
    expect(convertToInt('42.9')).toEqual(42)
  })

  it('should return the default when the source is undefined', () => {
    expect(convertToInt(undefined, 7)).toEqual(7)
    expect(convertToInt(undefined)).toEqual(0)
  })

  it('should return the default when the source cannot be parsed to a number', () => {
    expect(convertToInt('abc', 1)).toEqual(1)
    expect(convertToInt('abc')).toEqual(0)
  })

  it('should return the default when the source is a non-numeric object', () => {
    expect(convertToInt({}, 5)).toEqual(5)
    expect(convertToInt([1, 2], 5)).toEqual(5)
  })

  it('should never return NaN', () => {
    for (const source of ['abc', '', {}, [1, 2], NaN, () => 1]) {
      expect(Number.isNaN(convertToInt(source, 3))).toEqual(false)
    }
  })
})

describe('parseUtils :: isEnumValueOfType', () => {
  it('should accept the numeric values of a numeric enum', () => {
    expect(isEnumValueOfType(VariableHide, 0)).toEqual(true)
    expect(isEnumValueOfType(VariableHide, 2)).toEqual(true)
  })

  it('should reject values outside a numeric enum', () => {
    expect(isEnumValueOfType(VariableHide, 99)).toEqual(false)
  })

  it('should reject the reverse-mapped key names of a numeric enum', () => {
    // TypeScript numeric enums have reverse mappings, so Object.values() also
    // contains 'dontHide', 'hideVariable', etc. Those are not valid dashboard values.
    expect(isEnumValueOfType(VariableHide, 'hideVariable')).toEqual(false)
    expect(isEnumValueOfType(VariableHide, 'dontHide')).toEqual(false)
  })

  it('should still accept the string values of a string enum', () => {
    const StringEnum = { A: 'a', B: 'b' } as const
    expect(isEnumValueOfType(StringEnum, 'a')).toEqual(true)
    expect(isEnumValueOfType(StringEnum, 'c')).toEqual(false)
  })
})
