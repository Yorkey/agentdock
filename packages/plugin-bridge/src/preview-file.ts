import { basename, extname } from 'node:path'
import { homedir } from 'node:os'
import { open, readFile, realpath, stat } from 'node:fs/promises'
import type { FilePreviewResult } from './ipc.ts'
import { resolveLocalPath } from './local-path.ts'

export const MAX_TEXT_BYTES = 512 * 1024
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const IMAGE_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif'
}

export async function readPreviewFile(rawPath: string, workspace?: string): Promise<FilePreviewResult> {
  try {
    return await readPreview(rawPath, workspace)
  } catch (err) {
    const code = errorCode(err)
    if (code === 'ENOENT' || code === 'ENOTDIR') throw new Error('文件不存在')
    if (code === 'EACCES' || code === 'EPERM') throw new Error('没有读取权限')
    throw err
  }
}

async function readPreview(rawPath: string, workspace?: string): Promise<FilePreviewResult> {
  const target = resolveLocalPath(rawPath, workspace, homedir())
  const real = await realpath(target)
  const info = await stat(real)
  if (!info.isFile()) throw new Error('不是文件')
  const name = basename(real)
  const ext = extname(real).toLowerCase().replace(/^\./, '')
  const extMime = IMAGE_EXT[ext]

  if (extMime) {
    if (info.size > MAX_IMAGE_BYTES) {
      return { kind: 'unsupported', path: real, name, reason: '图片过大，超过 8 MB' }
    }
    const buf = await readFile(real)
    return toImage(real, name, extMime, buf)
  }

  const head = await readPrefix(real, 16)
  const sniffed = sniffImageMime(head)
  if (sniffed) {
    if (info.size > MAX_IMAGE_BYTES) {
      return { kind: 'unsupported', path: real, name, reason: '图片过大，超过 8 MB' }
    }
    const buf = await readFile(real)
    return toImage(real, name, sniffed, buf)
  }

  const slice = await readPrefix(real, MAX_TEXT_BYTES)
  if (hasNul(slice)) {
    return { kind: 'unsupported', path: real, name, reason: '暂不支持预览该类型' }
  }
  return {
    kind: 'text',
    path: real,
    name,
    text: slice.toString('utf8'),
    truncated: info.size > slice.length
  }
}

export function sniffImageMime(head: Uint8Array): string | undefined {
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
    return 'image/png'
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'image/jpeg'
  }
  if (head.length >= 6 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38) {
    return 'image/gif'
  }
  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return 'image/webp'
  }
  return undefined
}

function toImage(path: string, name: string, mime: string, buf: Buffer): FilePreviewResult {
  return { kind: 'image', path, name, mime, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
}

async function readPrefix(path: string, length: number): Promise<Buffer> {
  const fh = await open(path, 'r')
  try {
    const buf = Buffer.alloc(length)
    const { bytesRead } = await fh.read(buf, 0, length, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

function hasNul(buf: Uint8Array): boolean {
  return buf.includes(0)
}

function errorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined
  const code = err.code
  return typeof code === 'string' ? code : undefined
}
