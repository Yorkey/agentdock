import { isAbsolute, join, normalize } from 'node:path'

const MAX_PATH = 4096

export function resolveLocalPath(rawPath: string, workspace: string | undefined, home: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed || trimmed.length > MAX_PATH || trimmed.includes('\0')) {
    throw new Error('路径无效')
  }
  const expanded = expandHome(trimmed, home)
  if (isAbsolute(expanded)) return normalize(expanded)
  const root = workspace?.trim()
  if (!root) throw new Error('相对路径需要工作区')
  return normalize(join(expandHome(root, home), expanded))
}

function expandHome(path: string, home: string): string {
  if (path === '~') return home
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2))
  return path
}
