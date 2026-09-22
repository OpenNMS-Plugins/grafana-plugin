import fs from 'fs'
import os from 'os'
import path from 'path'
import { copyToArtifacts } from '../../../scripts/artifacts'

let workDir: string

describe('copyToArtifacts', () => {
  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opg-artifacts-test-'))
  })

  afterEach(() => fs.rmSync(workDir, { recursive: true, force: true }))

  const writePackage = (contents: string) => {
    const packagePath = path.join(workDir, 'plugin-1.0.0-1.noarch.rpm')
    fs.writeFileSync(packagePath, contents)
    return packagePath
  }

  it('should copy the package into the artifacts directory, creating it if needed', () => {
    const artifactsDir = path.join(workDir, 'artifacts')

    const target = copyToArtifacts(writePackage('one'), artifactsDir)

    expect(target).toEqual(path.join(artifactsDir, 'plugin-1.0.0-1.noarch.rpm'))
    expect(fs.readFileSync(target, 'utf-8')).toEqual('one')
  })

  it('should replace a package left over from an earlier build', () => {
    const artifactsDir = path.join(workDir, 'artifacts')
    fs.mkdirSync(artifactsDir)
    fs.writeFileSync(path.join(artifactsDir, 'plugin-1.0.0-1.noarch.rpm'), 'stale')

    const target = copyToArtifacts(writePackage('fresh'), artifactsDir)

    expect(fs.readFileSync(target, 'utf-8')).toEqual('fresh')
  })
})
