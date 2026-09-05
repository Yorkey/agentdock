import { stat, readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import type { LocalSkillPreview } from '@agentdock/core'
import { parseSkillContent } from './parse-frontmatter.ts'

export interface ZipEntry {
  fileName: string
  isDirectory: boolean
  compressedSize: number
  uncompressedSize: number
  getData: () => Buffer
}

/**
 * 零依赖纯 Node.js ZIP Central Directory 解析器
 * 支持 STORE (method 0) 与 DEFLATE (method 8)
 */
export function parseZipBuffer(buffer: Buffer): ZipEntry[] {
  // 从末尾寻找 EOCD 签名 0x06054b50
  let eocdOffset = -1
  const minEocdSize = 22
  const maxCommentSize = 65535
  const startSearch = Math.max(0, buffer.length - minEocdSize - maxCommentSize)

  for (let i = buffer.length - minEocdSize; i >= startSearch; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }

  if (eocdOffset === -1) {
    throw new Error('无效的 ZIP 文件格式：未找到 EOCD 标识')
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10)
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16)

  const entries: ZipEntry[] = []
  let offset = cdOffset

  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > buffer.length) break
    const sig = buffer.readUInt32LE(offset)
    if (sig !== 0x02014b50) break

    const flags = buffer.readUInt16LE(offset + 8)
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const fileNameLen = buffer.readUInt16LE(offset + 28)
    const extraLen = buffer.readUInt16LE(offset + 30)
    const commentLen = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)

    const isUtf8 = Boolean(flags & 0x0800)
    const rawFileName = buffer.toString(
      isUtf8 ? 'utf8' : 'latin1',
      offset + 46,
      offset + 46 + fileNameLen
    )
    const normalizedFileName = rawFileName.replace(/\\/g, '/')
    const externalAttr = buffer.readUInt32LE(offset + 38)
    const isDirectory =
      normalizedFileName.endsWith('/') || (externalAttr & 0x10) !== 0

    // 读取 Local Header 以精确定位数据起始位置
    if (localHeaderOffset + 30 > buffer.length) {
      throw new Error('ZIP 文件损坏：Local Header 偏移量超出文件大小')
    }
    const localSig = buffer.readUInt32LE(localHeaderOffset)
    if (localSig !== 0x04034b50) {
      throw new Error(`ZIP 文件损坏：在偏移 ${localHeaderOffset} 处缺少 Local Header`)
    }
    const localFileNameLen = buffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen

    const getData = () => {
      if (isDirectory || uncompressedSize === 0) {
        return Buffer.alloc(0)
      }
      if (dataStart + compressedSize > buffer.length) {
        throw new Error('ZIP 数据段超出文件末尾')
      }
      const rawData = buffer.subarray(dataStart, dataStart + compressedSize)
      if (method === 0) {
        return rawData
      }
      if (method === 8) {
        return inflateRawSync(rawData)
      }
      throw new Error(`不支持的 ZIP 压缩方式: ${method}`)
    }

    entries.push({
      fileName: normalizedFileName,
      isDirectory,
      compressedSize,
      uncompressedSize,
      getData
    })

    offset += 46 + fileNameLen + extraLen + commentLen
  }

  return entries
}

/**
 * 过滤垃圾文件（macOS __MACOSX、.DS_Store 等）
 */
function isIgnoredZipEntry(fileName: string): boolean {
  const parts = fileName.split('/')
  return (
    parts.some((p) => p === '__MACOSX' || p === '.DS_Store' || p === 'Thumbs.db')
  )
}

/**
 * 计算 ZIP 包中所有有效条目的公共顶级包装目录前缀
 * 例如：如果所有条目都在 "my-skill-master/..." 下，返回 "my-skill-master/"
 */
function findCommonRootPrefix(entries: ZipEntry[]): string {
  const validEntries = entries.filter(
    (e) => !isIgnoredZipEntry(e.fileName) && e.fileName !== ''
  )
  if (validEntries.length === 0) return ''

  const first = validEntries[0]
  if (!first) return ''
  const firstPath = first.fileName
  const firstSlash = firstPath.indexOf('/')
  if (firstSlash === -1) {
    // 根目录直接存在平铺文件，无需去除包装目录
    return ''
  }

  const candidate = firstPath.substring(0, firstSlash + 1)
  // 检查是否所有条目均以此前缀开头
  const allMatch = validEntries.every((e) => e.fileName.startsWith(candidate))
  return allMatch ? candidate : ''
}

/**
 * 安全路径校验，防御 Zip Slip 路径穿越
 */
function safeResolvePath(targetDir: string, relPath: string): string {
  const resolvedTarget = resolve(targetDir)
  const resolvedDest = resolve(targetDir, relPath)
  if (
    resolvedDest !== resolvedTarget &&
    !resolvedDest.startsWith(resolvedTarget + sep)
  ) {
    throw new Error(`非法路径穿越尝试 (Zip Slip): ${relPath}`)
  }
  return resolvedDest
}

/**
 * 将 ZIP 解压至目标目录
 */
export async function extractZipToDir(
  zipPath: string,
  targetDir: string
): Promise<{ extractedFiles: number }> {
  const buffer = await readFile(zipPath)
  const entries = parseZipBuffer(buffer)
  const commonPrefix = findCommonRootPrefix(entries)

  let extractedFiles = 0
  await mkdir(targetDir, { recursive: true })

  for (const entry of entries) {
    if (isIgnoredZipEntry(entry.fileName)) continue

    let rel = entry.fileName
    if (commonPrefix && rel.startsWith(commonPrefix)) {
      rel = rel.slice(commonPrefix.length)
    }
    if (!rel || rel === '/') continue

    const destPath = safeResolvePath(targetDir, rel)

    if (entry.isDirectory) {
      await mkdir(destPath, { recursive: true })
    } else {
      const parent = resolve(destPath, '..')
      await mkdir(parent, { recursive: true })
      const data = entry.getData()
      await writeFile(destPath, data)
      extractedFiles++
    }
  }

  return { extractedFiles }
}

/**
 * 递归计算文件夹内的文件数量与总大小
 */
async function inspectDirectory(dirPath: string): Promise<{
  fileCount: number
  totalSize: number
  skillMdContent?: string
  hasSkillMd: boolean
}> {
  let fileCount = 0
  let totalSize = 0
  let skillMdContent: string | undefined
  let hasSkillMd = false

  async function walk(current: string) {
    const items = await readdir(current, { withFileTypes: true })
    for (const item of items) {
      if (item.name === '.DS_Store' || item.name === 'Thumbs.db') continue
      const fullPath = join(current, item.name)
      if (item.isDirectory()) {
        await walk(fullPath)
      } else if (item.isFile()) {
        fileCount++
        const s = await stat(fullPath)
        totalSize += s.size
        const lowerName = item.name.toLowerCase()
        if (
          !hasSkillMd &&
          (lowerName === 'skill.md' || lowerName === 'readme.md')
        ) {
          try {
            skillMdContent = await readFile(fullPath, 'utf8')
            hasSkillMd = lowerName === 'skill.md'
          } catch {
            // ignore read error
          }
        }
      }
    }
  }

  await walk(dirPath)
  return { fileCount, totalSize, skillMdContent, hasSkillMd }
}

/**
 * 预览本地文件夹或 ZIP 文件，提取技能元数据
 */
export async function previewLocalSkill(
  sourcePath: string
): Promise<LocalSkillPreview> {
  const fileStat = await stat(sourcePath).catch(() => null)
  if (!fileStat) {
    throw new Error(`指定的路径不存在: ${sourcePath}`)
  }

  if (fileStat.isDirectory()) {
    const folderName = basename(sourcePath)
    const { fileCount, totalSize, skillMdContent, hasSkillMd } =
      await inspectDirectory(sourcePath)

    const parsed = skillMdContent
      ? parseSkillContent(skillMdContent, folderName)
      : { metadata: {}, markdownBody: '' }

    return {
      sourceType: 'folder',
      sourcePath,
      folderName,
      name: parsed.metadata.name || folderName,
      description: parsed.metadata.description || '',
      version: parsed.metadata.version,
      author: parsed.metadata.author,
      hasSkillMd,
      skillMdContent,
      fileCount,
      totalSize
    }
  }

  if (fileStat.isFile() && sourcePath.toLowerCase().endsWith('.zip')) {
    const rawZipName = basename(sourcePath, '.zip')
    const buffer = await readFile(sourcePath)
    const entries = parseZipBuffer(buffer)
    const commonPrefix = findCommonRootPrefix(entries)

    let fileCount = 0
    let totalSize = 0
    let skillMdContent: string | undefined
    let hasSkillMd = false

    for (const entry of entries) {
      if (isIgnoredZipEntry(entry.fileName)) continue
      if (entry.isDirectory) continue

      fileCount++
      totalSize += entry.uncompressedSize

      let rel = entry.fileName
      if (commonPrefix && rel.startsWith(commonPrefix)) {
        rel = rel.slice(commonPrefix.length)
      }
      const lower = rel.toLowerCase()
      if (!hasSkillMd && (lower === 'skill.md' || lower === 'readme.md')) {
        try {
          skillMdContent = entry.getData().toString('utf8')
          hasSkillMd = lower === 'skill.md'
        } catch {
          // ignore
        }
      }
    }

    const folderName = commonPrefix ? commonPrefix.replace(/\/$/, '') : rawZipName
    const parsed = skillMdContent
      ? parseSkillContent(skillMdContent, folderName)
      : { metadata: {}, markdownBody: '' }

    return {
      sourceType: 'zip',
      sourcePath,
      folderName,
      name: parsed.metadata.name || folderName,
      description: parsed.metadata.description || '',
      version: parsed.metadata.version,
      author: parsed.metadata.author,
      hasSkillMd,
      skillMdContent,
      fileCount,
      totalSize
    }
  }

  throw new Error('不支持的文件类型：请选择有效的技能文件夹或 .zip 压缩包')
}
