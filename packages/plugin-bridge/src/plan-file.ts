import { isAbsolute, join, normalize, relative, sep } from 'node:path'
import type { Message, Part } from '@agentdock/core'

const CURSOR_MARKER = '/.cursor/plans/'
const CLAUDE_MARKER = '/.claude/plans/'

export interface PlanFileIo {
  home: string
  readFile: (path: string) => Promise<string>
  realpath: (path: string) => Promise<string>
}

export function allowedPlanRoots(home: string): string[] {
  return [join(home, '.cursor', 'plans'), join(home, '.claude', 'plans')]
}

export function expandHomePath(filePath: string, home: string): string {
  if (filePath === '~') return home
  if (filePath.startsWith('~/') || filePath.startsWith('~\\')) return join(home, filePath.slice(2))
  return filePath
}

export function looksLikePlanFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.includes(CURSOR_MARKER)) {
    return normalized.endsWith('.plan.md') && !normalized.endsWith('/.plan.md')
  }
  if (normalized.includes(CLAUDE_MARKER)) {
    return normalized.endsWith('.md') && !normalized.endsWith('/.md')
  }
  return false
}

export function planPathNeedle(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, '/')
  const cursor = normalized.indexOf(CURSOR_MARKER)
  if (cursor >= 0) return normalized.slice(cursor)
  const claude = normalized.indexOf(CLAUDE_MARKER)
  if (claude >= 0) return normalized.slice(claude)
  return undefined
}

export function conversationMentionsPlanPath(messages: Message[], filePath: string, home: string): boolean {
  const expanded = expandHomePath(filePath, home).replace(/\\/g, '/')
  const needle = planPathNeedle(expanded) ?? planPathNeedle(filePath.replace(/\\/g, '/'))
  if (!needle) return false
  const variants = new Set<string>([filePath, expanded, needle, `~${needle}`])
  for (const message of messages) {
    for (const part of message.parts) {
      const blob = serializePart(part).replace(/\\/g, '/')
      for (const variant of variants) {
        if (variant && blob.includes(variant)) return true
      }
    }
  }
  return false
}

export function isInsideAllowedPlanRoot(filePath: string, roots: readonly string[]): boolean {
  const file = normalize(filePath)
  for (const root of roots) {
    const base = normalize(root)
    const rel = relative(base, file)
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) continue
    return true
  }
  return false
}

export async function readWhitelistedPlanFile(
  filePath: string,
  messages: Message[],
  io: PlanFileIo
): Promise<string> {
  if (!filePath.trim()) throw new Error('path must be a string')
  const expanded = expandHomePath(filePath.trim(), io.home)
  if (!looksLikePlanFile(expanded) && !looksLikePlanFile(filePath)) {
    throw new Error('path is not allowed')
  }
  if (!conversationMentionsPlanPath(messages, filePath, io.home)) {
    throw new Error('plan file is not in this conversation')
  }

  const resolvedFile = await io.realpath(expanded)
  const roots = allowedPlanRoots(io.home)
  const resolvedRoots: string[] = []
  for (const root of roots) {
    try {
      resolvedRoots.push(await io.realpath(root))
    } catch {
      resolvedRoots.push(normalize(root))
    }
  }
  if (!isInsideAllowedPlanRoot(resolvedFile, resolvedRoots)) {
    throw new Error('path is not allowed')
  }
  if (!looksLikePlanFile(resolvedFile)) {
    throw new Error('path is not allowed')
  }
  return io.readFile(resolvedFile)
}

function serializePart(part: Part): string {
  switch (part.kind) {
    case 'text':
    case 'reasoning':
      return part.text
    case 'tool_call':
      return `${part.name}\n${stringifyUnknown(part.input)}`
    case 'tool_result':
      return part.output
    case 'diff':
      return `${part.path}\n${part.patch}`
    default:
      return ''
  }
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}
