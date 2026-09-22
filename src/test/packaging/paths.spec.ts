import fs from 'fs'
import path from 'path'
import { DEBIAN_DIR, PROJECT_DIR } from '../../../scripts/paths'

/**
 * These constants are relative offsets from scripts/paths.js, so moving scripts/ or
 * scripts/deb/debian/ breaks them silently: nothing fails at require time, and the
 * packaging scripts instead fail deep in a build with a confusing "not found". These
 * assertions turn that into a test failure at the point of the move.
 */
describe('packaging paths', () => {
  it('should resolve PROJECT_DIR to the repository root', () => {
    const pkgInfo = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'package.json'), 'utf-8'))

    expect(pkgInfo.name).toEqual('opennms-grafana-plugin')
  })

  it('should resolve PROJECT_DIR so the spec template configured in package.json exists', () => {
    // package.json's spec.specTemplate is project-root relative, and renderSpec resolves
    // it against PROJECT_DIR. The two have to agree.
    const pkgInfo = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'package.json'), 'utf-8'))

    expect(fs.existsSync(path.resolve(PROJECT_DIR, pkgInfo.spec.specTemplate))).toBe(true)
  })

  it('should resolve DEBIAN_DIR to the debian tree that ships in the deb', () => {
    // make-deb.js copies this whole directory into the build tree and metadata.js
    // renders the control template out of it.
    expect(fs.existsSync(path.join(DEBIAN_DIR, 'control.mustache'))).toBe(true)
    expect(fs.existsSync(path.join(DEBIAN_DIR, 'rules'))).toBe(true)
  })
})
