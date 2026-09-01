/** 渲染层路径判断与拼接。主进程的真实解析在 plugin-bridge `reveal.ts`。 */

export function looksLikeFsPath(value: string): boolean {
  const text = value.trim()
  if (!text || text.length > 1024 || /\s/.test(text)) return false
  if (text.startsWith('/') || text.startsWith('~/') || text.startsWith('~\\')) return true
  if (/^[A-Za-z]:[\\/]/.test(text)) return true
  if (/^[.]{1,2}[\\/]/.test(text)) return true
  return /[\\/]/.test(text) && /\.[A-Za-z0-9]{1,12}$/.test(text)
}

export function isAbsoluteFsPath(value: string): boolean {
  const text = value.trim()
  return text.startsWith('/') || text.startsWith('~/') || text.startsWith('~\\') || /^[A-Za-z]:[\\/]/.test(text)
}

/** 相对路径拼到工作区；已经是绝对/~ 路径则原样返回。 */
export function joinWorkspace(path: string, workspace: string | undefined): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  if (isAbsoluteFsPath(trimmed) || !workspace?.trim()) return trimmed
  const root = workspace.replace(/[/\\]+$/, '')
  const rel = trimmed.replace(/^[/\\]+/, '')
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/'
  return `${root}${sep}${rel}`
}

export function pathFromToolInput(input: unknown): string | undefined {
  const rec = asRecord(input)
  if (!rec) return undefined
  const raw =
    stringField(rec, 'file_path') ??
    stringField(rec, 'target_file') ??
    stringField(rec, 'path') ??
    stringField(rec, 'file')
  const trimmed = raw?.trim()
  return trimmed || undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.startsWith('{')) return undefined
    try {
      const parsed: unknown = JSON.parse(trimmed)
      return isRecord(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return isRecord(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}
