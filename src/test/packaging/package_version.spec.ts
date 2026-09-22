import { resolveVersionAndRelease } from '../../../scripts/packageVersion'

describe('resolveVersionAndRelease', () => {
  it('should strip -SNAPSHOT and use release 0 for a snapshot version', () => {
    expect(resolveVersionAndRelease('12.0.2-SNAPSHOT')).toEqual({ version: '12.0.2', release: '0' })
  })

  it('should keep the version and use release 1 for a released version', () => {
    expect(resolveVersionAndRelease('12.0.2')).toEqual({ version: '12.0.2', release: '1' })
  })

  it('should not treat a version without -SNAPSHOT as a snapshot', () => {
    // make-deb.js used `if (version.indexOf('-SNAPSHOT'))`, which is truthy for -1,
    // so every non-snapshot build was also released as 0.
    expect(resolveVersionAndRelease('12.0.2').release).toEqual('1')
  })

  it('should reject a version that is not a string', () => {
    expect(() => resolveVersionAndRelease(undefined as unknown as string)).toThrow(/version/i)
  })
})
