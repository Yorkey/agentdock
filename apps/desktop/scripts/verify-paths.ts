import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveLocalPath } from '../../../packages/plugin-bridge/src/local-path.ts'
import { readPreviewFile, sniffImageMime } from '../../../packages/plugin-bridge/src/preview-file.ts'
import { nearestExisting } from '../../../packages/plugin-bridge/src/reveal.ts'
import { hrefToLocalPath } from '../src/renderer/src/lib/file-href.ts'
import { isAbsoluteFsPath, joinWorkspace, looksLikeFsPath, pathFromToolInput } from '../src/renderer/src/lib/local-path.ts'

if (!looksLikeFsPath('/tmp/a.ts')) throw new Error('abs path')
if (!looksLikeFsPath('~/plans/x.plan.md')) throw new Error('home path')
if (!looksLikeFsPath('src/foo.ts')) throw new Error('rel file')
if (looksLikeFsPath('echo hello')) throw new Error('command should miss')
if (looksLikeFsPath('Plan mode')) throw new Error('words should miss')
if (!isAbsoluteFsPath('/a/b') || isAbsoluteFsPath('src/a.ts')) throw new Error('absolute check')
if (joinWorkspace('src/a.ts', '/repo') !== '/repo/src/a.ts') throw new Error(`join: ${joinWorkspace('src/a.ts', '/repo')}`)
if (joinWorkspace('/abs/a.ts', '/repo') !== '/abs/a.ts') throw new Error('join abs')
if (pathFromToolInput({ file_path: 'apps/x.ts' }) !== 'apps/x.ts') throw new Error('file_path')
if (pathFromToolInput({ path: '/tmp/z.ts' }) !== '/tmp/z.ts') throw new Error('path field')

const home = '/Users/demo'
if (resolveLocalPath('~/plans/a.plan.md', undefined, home) !== '/Users/demo/plans/a.plan.md') {
  throw new Error('expand home')
}
if (resolveLocalPath('src/a.ts', '/Users/demo/proj', home) !== '/Users/demo/proj/src/a.ts') {
  throw new Error('join workspace')
}
let threw = false
try {
  resolveLocalPath('src/a.ts', undefined, home)
} catch {
  threw = true
}
if (!threw) throw new Error('relative without workspace should throw')

const existing = new Set(['/Users/demo/proj', '/Users/demo/proj/src'])
const found = await nearestExisting('/Users/demo/proj/src/missing.ts', async (path) => {
  if (!existing.has(path)) throw new Error('missing')
})
if (found !== '/Users/demo/proj/src') throw new Error(`nearest: ${found}`)

if (hrefToLocalPath('https://example.com/a.ts') !== undefined) throw new Error('http href')
if (hrefToLocalPath('javascript:alert(1)') !== undefined) throw new Error('script href')
if (hrefToLocalPath('mailto:a@b.c') !== undefined) throw new Error('mailto href')
if (hrefToLocalPath('#') !== undefined) throw new Error('hash href')
if (hrefToLocalPath('#section') !== undefined) throw new Error('anchor href')
if (hrefToLocalPath('/tmp/a.ts') !== '/tmp/a.ts') throw new Error('abs href')
if (hrefToLocalPath('src/foo.ts') !== 'src/foo.ts') throw new Error('rel href')
if (hrefToLocalPath('file:///Users/a/b.ts') !== '/Users/a/b.ts') throw new Error(`file url: ${hrefToLocalPath('file:///Users/a/b.ts')}`)
if (hrefToLocalPath('file:///C:/a.ts') !== 'C:/a.ts') throw new Error(`win file url: ${hrefToLocalPath('file:///C:/a.ts')}`)

const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
if (sniffImageMime(png) !== 'image/png') throw new Error('png sniff')
const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0)
if (sniffImageMime(jpeg) !== 'image/jpeg') throw new Error('jpeg sniff')
if (sniffImageMime(Uint8Array.of(0x00, 0x01)) !== undefined) throw new Error('binary sniff')

const dir = await mkdtemp(join(tmpdir(), 'agentdock-preview-'))
try {
  const textPath = join(dir, 'a.ts')
  await writeFile(textPath, 'export const x = 1\n')
  const text = await readPreviewFile(textPath)
  if (text.kind !== 'text' || !text.text.includes('export const x')) throw new Error('text preview')
  const pngPath = join(dir, 'shot.png')
  await writeFile(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))
  const image = await readPreviewFile('shot.png', dir)
  if (image.kind !== 'image' || !image.dataUrl.startsWith('data:image/png')) throw new Error('image preview')
  const binPath = join(dir, 'a.bin')
  await writeFile(binPath, Buffer.from([0, 1, 2, 3, 0, 4]))
  const bin = await readPreviewFile(binPath)
  if (bin.kind !== 'unsupported') throw new Error('nul binary')
} finally {
  await rm(dir, { recursive: true, force: true })
}

console.log('ok: file path helpers')
