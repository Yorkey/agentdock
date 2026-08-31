import type { Message, Part, Role, SourceFileRef } from '@chats/core'
import { hashId, makeConversationId, truncateTitle } from '@chats/core'
import { createReadStream } from 'node:fs'
import { basename } from 'node:path'
import { createInterface } from 'node:readline'

/** UI-only rows. Harvest title from custom-title / ai-title, then drop them. */
const SKIP_TYPES = new Set([
  'queue-operation',
  'last-prompt',
  'mode',
  'permission-mode',
  'file-history-snapshot'
])

const TITLE_TYPES = new Set(['custom-title', 'ai-title'])

/** Hook/telemetry system rows: keep as tree nodes so children stay linked, do not emit. */
const SILENT_SYSTEM = new Set(['stop_hook_summary', 'turn_duration'])

export interface ClaudeFileMeta {
  conversationId: string
  sessionId?: string
  title?: string
  workspace?: string
  gitBranch?: string
  models: string[]
  createdAt: number
  updatedAt: number
}

export interface ParsedClaudeSession {
  meta: ClaudeFileMeta
  messages: Message[]
}

const metaCache = new Map<string, ClaudeFileMeta>()

export function getCachedFileMeta(path: string): ClaudeFileMeta | undefined {
  return metaCache.get(path)
}

interface ClaudeRecord {
  type?: string
  uuid?: string
  parentUuid?: string | null
  logicalParentUuid?: string | null
  isSidechain?: boolean
  timestamp?: string
  cwd?: string
  gitBranch?: string
  sessionId?: string
  customTitle?: string
  aiTitle?: string
  subtype?: string
  content?: unknown
  error?: unknown
  isMeta?: boolean
  message?: {
    role?: string
    model?: string
    content?: unknown
  }
  attachment?: {
    type?: string
    filename?: string
    displayPath?: string
    snippet?: string
  }
}

interface IndexedRecord {
  rec: ClaudeRecord
  index: number
  time: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): ClaudeRecord | undefined {
  if (!isObject(value)) return undefined
  return value as ClaudeRecord
}

function toMillis(timestamp: unknown): number {
  if (typeof timestamp !== 'string' || !timestamp) return 0
  const ms = Date.parse(timestamp)
  return Number.isFinite(ms) ? ms : 0
}

function conversationKey(path: string, sessionId: string | undefined): string {
  const normalized = path.replaceAll('\\', '/')
  if (normalized.includes('/subagents/')) return path
  if (sessionId) return sessionId
  const base = basename(path, '.jsonl')
  return base || path
}

async function readJsonl(path: string): Promise<unknown[]> {
  const rows: unknown[] = []
  const rl = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      rows.push(JSON.parse(trimmed))
    } catch {
      // skip malformed lines
    }
  }
  return rows
}

function stringifyUnknown(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function flattenToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return stringifyUnknown(content)
  const chunks: string[] = []
  for (const block of content) {
    if (typeof block === 'string') {
      chunks.push(block)
      continue
    }
    if (!isObject(block)) continue
    if (typeof block.text === 'string') {
      chunks.push(block.text)
      continue
    }
    if (block.type === 'image') {
      chunks.push('[image]')
      continue
    }
    chunks.push(stringifyUnknown(block))
  }
  return chunks.filter(Boolean).join('\n')
}

function pushText(parts: Part[], text: string): void {
  if (text) parts.push({ kind: 'text', text })
}

function partsFromContentBlocks(content: unknown): Part[] {
  if (typeof content === 'string') {
    const parts: Part[] = []
    pushText(parts, content)
    return parts
  }
  if (!Array.isArray(content)) return []

  const parts: Part[] = []
  for (const block of content) {
    if (typeof block === 'string') {
      pushText(parts, block)
      continue
    }
    if (!isObject(block)) continue
    const type = typeof block.type === 'string' ? block.type : ''
    switch (type) {
      case 'text':
        if (typeof block.text === 'string') pushText(parts, block.text)
        break
      case 'thinking': {
        const thinking = typeof block.thinking === 'string' ? block.thinking : ''
        if (thinking) parts.push({ kind: 'reasoning', text: thinking })
        break
      }
      case 'tool_use': {
        const name = typeof block.name === 'string' ? block.name : 'tool'
        const callId = typeof block.id === 'string' ? block.id : undefined
        parts.push({ kind: 'tool_call', name, input: block.input, callId })
        break
      }
      case 'tool_result': {
        const callId =
          typeof block.tool_use_id === 'string'
            ? block.tool_use_id
            : typeof block.toolUseId === 'string'
              ? block.toolUseId
              : undefined
        const output = flattenToolResultContent(block.content)
        const isError = block.is_error === true || block.isError === true
        parts.push({ kind: 'tool_result', callId, output, isError })
        break
      }
      case 'image':
        parts.push({ kind: 'text', text: '[image]' })
        break
      default:
        if (typeof block.text === 'string') pushText(parts, block.text)
        break
    }
  }
  return parts
}

function partsFromSystem(rec: ClaudeRecord): Part[] {
  const subtype = rec.subtype ?? ''
  if (SILENT_SYSTEM.has(subtype)) return []

  if (typeof rec.content === 'string' && rec.content) {
    return [{ kind: 'text', text: rec.content }]
  }
  const errorText = stringifyUnknown(rec.error)
  if (errorText) {
    const label = subtype ? `[${subtype}] ` : ''
    return [{ kind: 'text', text: `${label}${errorText}` }]
  }
  return []
}

function partsFromAttachment(rec: ClaudeRecord): Part[] {
  const att = rec.attachment
  if (!att) return []
  const kind = att.type ?? ''
  if (kind === 'file') {
    const name = att.displayPath || att.filename
    if (!name) return []
    return [{ kind: 'text', text: `[file] ${name}` }]
  }
  if (kind === 'edited_text_file') {
    const name = att.displayPath || att.filename || 'file'
    const snippet = att.snippet ? `\n${att.snippet.slice(0, 2000)}` : ''
    return [{ kind: 'text', text: `[edited] ${name}${snippet}` }]
  }
  return []
}

function emitParts(rec: ClaudeRecord): Part[] {
  const type = rec.type ?? ''
  if (type === 'system') return partsFromSystem(rec)
  if (type === 'attachment') return partsFromAttachment(rec)
  return partsFromContentBlocks(rec.message?.content)
}

function emitRole(rec: ClaudeRecord, parts: Part[]): Role | undefined {
  const type = rec.type ?? ''
  if (type === 'assistant') return 'assistant'
  if (type === 'system' || type === 'attachment') return 'system'
  if (type === 'user') {
    if (parts.length > 0 && parts.every((part) => part.kind === 'tool_result')) return 'tool'
    const role = rec.message?.role
    if (role === 'user' || role === 'assistant' || role === 'system' || role === 'tool') return role
    return 'user'
  }
  return undefined
}

function compareIndexed(a: IndexedRecord, b: IndexedRecord): number {
  if (a.time !== b.time) return a.time - b.time
  return a.index - b.index
}

function parentIdOf(rec: ClaudeRecord): string | undefined {
  if (typeof rec.parentUuid === 'string' && rec.parentUuid) return rec.parentUuid
  // compact_boundary uses this to stitch the post-compact trunk onto the old tail
  if (typeof rec.logicalParentUuid === 'string' && rec.logicalParentUuid) {
    return rec.logicalParentUuid
  }
  return undefined
}

/**
 * Walk parentUuid tree iteratively (explicit stack) so deep chains cannot overflow.
 * At each node emit trunk children (isSidechain != true) first, then sidechain
 * children. Siblings are ordered by timestamp / file order. Sidechain records
 * stay after their parent so the UI can fold them later.
 */
function walkTree(nodes: Map<string, IndexedRecord>): IndexedRecord[] {
  const children = new Map<string, IndexedRecord[]>()
  const roots: IndexedRecord[] = []

  for (const node of nodes.values()) {
    const parentId = parentIdOf(node.rec)
    if (parentId && nodes.has(parentId)) {
      const list = children.get(parentId)
      if (list) list.push(node)
      else children.set(parentId, [node])
    } else {
      roots.push(node)
    }
  }

  for (const list of children.values()) {
    list.sort(compareIndexed)
  }
  roots.sort(compareIndexed)

  const ordered: IndexedRecord[] = []
  const visited = new Set<string>()
  // LIFO: push roots last-first so the earliest root is visited first.
  const stack: IndexedRecord[] = []
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push(roots[i]!)
  }

  while (stack.length > 0) {
    const node = stack.pop()!
    const id = node.rec.uuid
    if (!id || visited.has(id)) continue
    visited.add(id)
    ordered.push(node)
    const kids = children.get(id)
    if (!kids) continue
    const trunk: IndexedRecord[] = []
    const side: IndexedRecord[] = []
    for (const child of kids) {
      if (child.rec.isSidechain === true) side.push(child)
      else trunk.push(child)
    }
    // Push side before trunk (and each group last-first) so pop order is
    // first trunk child → remaining trunk → first sidechain child → remaining side.
    for (let i = side.length - 1; i >= 0; i--) stack.push(side[i]!)
    for (let i = trunk.length - 1; i >= 0; i--) stack.push(trunk[i]!)
  }

  return ordered
}

export async function parseClaudeSession(
  ref: SourceFileRef,
  sourceId: string
): Promise<ParsedClaudeSession> {
  const rows = await readJsonl(ref.path)

  let sessionId: string | undefined
  let customTitle: string | undefined
  let aiTitle: string | undefined
  let workspace: string | undefined
  let gitBranch: string | undefined
  const models: string[] = []
  const modelSeen = new Set<string>()
  let createdAt = 0
  let updatedAt = 0

  const nodes = new Map<string, IndexedRecord>()

  for (let index = 0; index < rows.length; index++) {
    const rec = asRecord(rows[index])
    if (!rec) continue

    const type = rec.type ?? ''
    if (typeof rec.sessionId === 'string' && rec.sessionId) sessionId = rec.sessionId
    if (typeof rec.cwd === 'string' && rec.cwd) workspace = rec.cwd
    if (typeof rec.gitBranch === 'string' && rec.gitBranch) gitBranch = rec.gitBranch

    const time = toMillis(rec.timestamp)
    if (time) {
      if (!createdAt || time < createdAt) createdAt = time
      if (time > updatedAt) updatedAt = time
    }

    const model = rec.message?.model
    if (typeof model === 'string' && model && !modelSeen.has(model)) {
      modelSeen.add(model)
      models.push(model)
    }

    if (type === 'custom-title' && typeof rec.customTitle === 'string' && rec.customTitle) {
      customTitle = rec.customTitle
      continue
    }
    if (type === 'ai-title' && typeof rec.aiTitle === 'string' && rec.aiTitle) {
      aiTitle = rec.aiTitle
      continue
    }

    if (SKIP_TYPES.has(type) || TITLE_TYPES.has(type)) continue

    const uuid = rec.uuid
    if (typeof uuid !== 'string' || !uuid) continue
    if (type !== 'user' && type !== 'assistant' && type !== 'system' && type !== 'attachment') {
      continue
    }

    nodes.set(uuid, { rec, index, time })
  }

  const key = conversationKey(ref.path, sessionId)
  const conversationId = makeConversationId(sourceId, key)
  const title = truncateTitle(customTitle || aiTitle || '') || undefined

  const ordered = walkTree(nodes)
  const messages: Message[] = []
  let seq = 0

  for (const node of ordered) {
    const parts = emitParts(node.rec)
    const role = emitRole(node.rec, parts)
    if (!role || parts.length === 0) continue

    const uuid = node.rec.uuid ?? String(node.index)
    const side = node.rec.isSidechain === true ? '1' : '0'
    messages.push({
      id: hashId(conversationId, uuid, side),
      conversationId,
      seq,
      role,
      createdAt: node.time || createdAt,
      parts
    })
    seq += 1
  }

  const meta: ClaudeFileMeta = {
    conversationId,
    sessionId,
    title,
    workspace,
    gitBranch,
    models,
    createdAt,
    updatedAt
  }
  metaCache.set(ref.path, meta)
  return { meta, messages }
}
