import fs from 'fs'
import os from 'os'
import path from 'path'
import { createSourceArchive } from '../../../scripts/rpm/archive'

const tar = require('tar-fs')
const zlib = require('zlib')

let workDir: string
let distDir: string

const writeFile = (relativePath: string, contents = 'x') => {
  const target = path.join(distDir, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents)
}

const walk = (dir: string, prefix = ''): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory() ? walk(path.join(dir, entry.name), relativePath) : [relativePath]
  })

const listArchive = async (archivePath: string): Promise<string[]> => {
  const extractDir = fs.mkdtempSync(path.join(workDir, 'extract-'))

  await new Promise((resolve, reject) => {
    const extract = tar.extract(extractDir)
    extract.on('finish', resolve)
    extract.on('error', reject)
    fs.createReadStream(archivePath).pipe(zlib.createGunzip()).pipe(extract)
  })

  return walk(extractDir).sort()
}

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opg-archive-test-'))
  distDir = path.join(workDir, 'dist')
  fs.mkdirSync(distDir)
})

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true })
})

describe('createSourceArchive', () => {
  it('should package the dist contents at the archive root', async () => {
    writeFile('module.js')
    writeFile('plugin.json')
    writeFile('img/logo.svg')
    const archivePath = path.join(workDir, 'plugin.tar.gz')

    await createSourceArchive(distDir, archivePath)

    expect(await listArchive(archivePath)).toEqual(['img/logo.svg', 'module.js', 'plugin.json'])
  })

  it('should create the target directory if it does not exist', async () => {
    writeFile('module.js')
    const archivePath = path.join(workDir, 'SOURCES', 'plugin.tar.gz')

    await createSourceArchive(distDir, archivePath)

    expect(fs.existsSync(archivePath)).toEqual(true)
  })

  it('should exclude the rpmbuild working directories', async () => {
    writeFile('module.js')
    writeFile('SPECS/plugin.spec')
    writeFile('SOURCES/plugin.tar.gz')
    writeFile('RPMS/noarch/plugin.rpm')
    writeFile('SRPMS/plugin.src.rpm')
    const archivePath = path.join(workDir, 'plugin.tar.gz')

    await createSourceArchive(distDir, archivePath)

    expect(await listArchive(archivePath)).toEqual(['module.js'])
  })

  /**
   * webpack copies `src/**\/*.json` into dist with no ignore list, so dist/test holds
   * the jest fixtures. makedeb.js filters `test` out of the .deb for the same reason.
   */
  it('should exclude the test fixtures webpack copies into dist', async () => {
    writeFile('module.js')
    writeFile('test/react/support/fixtures/helm-v8-dashboard.json')
    const archivePath = path.join(workDir, 'plugin.tar.gz')

    await createSourceArchive(distDir, archivePath)

    expect(await listArchive(archivePath)).toEqual(['module.js'])
  })

  it('should not package a file whose name merely starts with an excluded name', async () => {
    writeFile('testing.js')
    writeFile('SPECS-notes.txt')
    const archivePath = path.join(workDir, 'plugin.tar.gz')

    await createSourceArchive(distDir, archivePath)

    expect(await listArchive(archivePath)).toEqual(['SPECS-notes.txt', 'testing.js'])
  })

  it('should reject when the source directory does not exist', async () => {
    await expect(
      createSourceArchive(path.join(workDir, 'missing'), path.join(workDir, 'plugin.tar.gz'))
    ).rejects.toThrow()
  })
})

describe('createSourceArchive :: reproducibility', () => {
  const headersOf = async (archivePath: string) => {
    const headers: any[] = []
    const extractDir = fs.mkdtempSync(path.join(workDir, 'headers-'))

    await new Promise((resolve, reject) => {
      const extract = tar.extract(extractDir, {
        map: (header: any) => {
          headers.push(header)
          return header
        }
      })
      extract.on('finish', resolve)
      extract.on('error', reject)
      fs.createReadStream(archivePath).pipe(zlib.createGunzip()).pipe(extract)
    })

    return headers
  }

  it('should record every entry as owned by root', async () => {
    // rpm assigns ownership via %defattr, so whoever ran the build must not leak
    // their uid into the archive.
    writeFile('module.js')
    writeFile('img/logo.svg')
    const archivePath = path.join(workDir, 'plugin.tar.gz')

    await createSourceArchive(distDir, archivePath)

    const headers = await headersOf(archivePath)
    expect(headers.length).toBeGreaterThan(0)
    headers.forEach((header) => {
      expect(header.uid).toEqual(0)
      expect(header.gid).toEqual(0)
      expect(header.uname).toEqual('root')
      expect(header.gname).toEqual('root')
    })
  })
})

describe('createSourceArchive :: failure handling', () => {
  // root bypasses the permission bits, so this can only be provoked as a normal
  // user. We do not want the packaging build running as root anyway.
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0
  const itUnlessRoot = isRoot ? it.skip : it

  itUnlessRoot('should reject rather than write a truncated archive when a file cannot be read', async () => {
    // .pipe() does not forward errors, so a mid-stream read failure could otherwise
    // let the write stream close normally and resolve with a partial tarball.
    writeFile('readable.js', 'x'.repeat(1024))
    const unreadable = path.join(distDir, 'unreadable.js')
    fs.writeFileSync(unreadable, 'y'.repeat(1024))
    fs.chmodSync(unreadable, 0o000)
    const archivePath = path.join(workDir, 'plugin.tar.gz')

    try {
      await expect(createSourceArchive(distDir, archivePath)).rejects.toThrow()
    } finally {
      fs.chmodSync(unreadable, 0o644)
    }
  })

  itUnlessRoot('should not leave a partial archive behind when packing fails', async () => {
    // Rejecting the promise is not enough: nothing downstream destroys the gzip and
    // write streams, so a truncated .tar.gz would survive on disk for a caller to
    // pick up.
    writeFile('readable.js', 'x'.repeat(1024))
    const unreadable = path.join(distDir, 'unreadable.js')
    fs.writeFileSync(unreadable, 'y'.repeat(1024))
    fs.chmodSync(unreadable, 0o000)
    const archivePath = path.join(workDir, 'plugin.tar.gz')

    try {
      await createSourceArchive(distDir, archivePath).catch(() => undefined)
    } finally {
      fs.chmodSync(unreadable, 0o644)
    }

    expect(fs.existsSync(archivePath)).toEqual(false)
  })
})
