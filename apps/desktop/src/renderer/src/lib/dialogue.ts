import type { Message, Part } from '@chats/core'

export const COMPACT_MARKER = '上下文压缩'

export type ViewMode = 'chat' | 'trajectory'

export interface DialogueTool {
  name: string
  summary: string
  callId?: string
  input: unknown
  output?: string
  isError?: boolean
  diffs: { path: string; patch: string }[]
}

export type DialogueBlock =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'tool'; tool: DialogueTool }

export type DialogueTurn = {
  kind: 'turn'
  id: string
  role: 'user' | 'assistant'
  createdAt: number
  blocks: DialogueBlock[]
}

export type DialogueItem = DialogueTurn | { kind: 'compact'; id: string; createdAt: number }

export function textsOf(turn: DialogueTurn): string[] {
  return turn.blocks.filter((block): block is { kind: 'text'; text: string } => block.kind === 'text').map((block) => block.text)
}

export function toolsOf(turn: DialogueTurn): DialogueTool[] {
  return turn.blocks.filter((block): block is { kind: 'tool'; tool: DialogueTool } => block.kind === 'tool').map((block) => block.tool)
}

export interface ToolProbe {
  id: string
  title: string
  tools: DialogueTool[]
}

export interface AssistantWork {
  reasoning: string[]
  probes: ToolProbe[]
  reply: string[]
}

export type ThreadItem =
  | { kind: 'compact'; id: string; createdAt: number }
  | {
      kind: 'exchange'
      id: string
      startedAt: number
      endedAt: number
      user?: DialogueTurn
      assistant?: DialogueTurn
      work: AssistantWork
    }

export function groupAssistantWork(blocks: DialogueBlock[]): AssistantWork {
  const reasoning: string[] = []
  const probes: ToolProbe[] = []
  let pendingTitle = ''
  let pendingTools: DialogueTool[] = []
  let probeIndex = 0

  const flushProbe = (): void => {
    if (pendingTools.length === 0) return
    probes.push({
      id: `probe-${probeIndex++}`,
      title: pendingTitle,
      tools: pendingTools
    })
    pendingTitle = ''
    pendingTools = []
  }

  for (const block of blocks) {
    if (block.kind === 'reasoning') {
      if (block.text.trim()) reasoning.push(block.text)
      continue
    }
    if (block.kind === 'text') {
      const text = block.text.trim()
      if (!text) continue
      if (pendingTools.length > 0) {
        flushProbe()
        pendingTitle = text
      } else {
        pendingTitle = pendingTitle ? `${pendingTitle}\n\n${text}` : text
      }
      continue
    }
    pendingTools.push(block.tool)
  }

  const reply: string[] = []
  if (pendingTools.length > 0) flushProbe()
  else if (pendingTitle) reply.push(pendingTitle)

  return { reasoning, probes, reply }
}

export function projectExchanges(items: DialogueItem[]): ThreadItem[] {
  const out: ThreadItem[] = []
  let user: DialogueTurn | undefined

  const flushUserOnly = (): void => {
    if (!user) return
    out.push({
      kind: 'exchange',
      id: user.id,
      startedAt: user.createdAt,
      endedAt: user.createdAt,
      user,
      work: { reasoning: [], probes: [], reply: [] }
    })
    user = undefined
  }

  for (const item of items) {
    if (item.kind === 'compact') {
      flushUserOnly()
      out.push(item)
      continue
    }
    if (item.role === 'user') {
      flushUserOnly()
      user = item
      continue
    }
    out.push({
      kind: 'exchange',
      id: user?.id ?? item.id,
      startedAt: user?.createdAt || item.createdAt,
      endedAt: item.createdAt,
      user,
      assistant: item,
      work: groupAssistantWork(item.blocks)
    })
    user = undefined
  }
  flushUserOnly()
  return out
}

export function summarizeProbe(tools: DialogueTool[]): string {
  return summarizeToolNames(tools.map((tool) => tool.name))
}

export function hasAssistantWork(work: AssistantWork): boolean {
  return work.reasoning.length > 0 || work.probes.length > 0
}

export function summarizeWork(work: AssistantWork): string {
  const names = work.probes.flatMap((probe) => probe.tools.map((tool) => tool.name))
  const bits: string[] = []
  if (work.reasoning.length) bits.push(work.reasoning.length === 1 ? '思考' : `思考 ${work.reasoning.length} 段`)
  if (names.length) bits.push(summarizeToolNames(names))
  return bits.join(' · ')
}

export function summarizeToolNames(names: string[]): string {
  let files = 0
  let edits = 0
  let commands = 0
  let searches = 0
  let other = 0
  for (const name of names) {
    const key = name.toLowerCase()
    if (key.includes('read') || key === 'glob') files += 1
    else if (key.includes('edit') || key.includes('write') || key.includes('strreplace')) edits += 1
    else if (key.includes('bash') || key.includes('shell') || key === 'execute') commands += 1
    else if (key.includes('grep') || key.includes('search')) searches += 1
    else other += 1
  }
  const bits: string[] = []
  if (files) bits.push(files === 1 ? '读取 1 个文件' : `读取 ${files} 个文件`)
  if (searches) bits.push(`搜索 ${searches} 次`)
  if (edits) bits.push(edits === 1 ? '编辑 1 个文件' : `编辑 ${edits} 个文件`)
  if (commands) bits.push(commands === 1 ? '执行 1 条命令' : `执行 ${commands} 条命令`)
  if (other) bits.push(other === 1 ? '调用 1 个工具' : `调用 ${other} 个工具`)
  return bits.join('，') || `${names.length} 次工具`
}

export function firstTextLine(text: string): string {
  return firstLine(text)
}

const MODE_KEY = 'chats.viewMode'

export function loadViewMode(): ViewMode {
  try {
    const value = localStorage.getItem(MODE_KEY)
    if (value === 'trajectory' || value === 'chat') return value
    if (value === 'raw') return 'trajectory'
    if (value === 'dialogue') return 'chat'
  } catch {
    // ignore
  }
  return 'chat'
}

export function saveViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // ignore
  }
}

export function isCompactMarker(message: Message): boolean {
  if (message.role !== 'system' || message.parts.length !== 1) return false
  const part = message.parts[0]
  return part?.kind === 'text' && part.text === COMPACT_MARKER
}

export function projectDialogue(messages: Message[]): DialogueItem[] {
  const items: DialogueItem[] = []
  let current: Extract<DialogueItem, { kind: 'turn' }> | null = null
  let seq = 0

  const flush = (): void => {
    if (!current) return
    if (turnIsVisible(current)) items.push(current)
    current = null
  }

  for (const message of messages) {
    if (isCompactMarker(message)) {
      flush()
      items.push({ kind: 'compact', id: `compact:${message.id}`, createdAt: message.createdAt })
      continue
    }

    if (isNoiseMessage(message)) continue

    if (message.role === 'user') {
      const blocks = userBlocks(message)
      if (blocks.length === 0) continue
      flush()
      items.push({
        kind: 'turn',
        id: `turn:${seq++}:${message.id}`,
        role: 'user',
        createdAt: message.createdAt,
        blocks
      })
      continue
    }

    if (message.role === 'assistant') {
      const blocks = sliceBlocks(message)
      if (blocks.length === 0) continue
      if (current?.role === 'assistant') {
        current.blocks.push(...blocks)
        if (message.createdAt > 0) current.createdAt = message.createdAt
      } else {
        flush()
        current = {
          kind: 'turn',
          id: `turn:${seq++}:${message.id}`,
          role: 'assistant',
          createdAt: message.createdAt,
          blocks
        }
      }
      continue
    }

    if (message.role === 'tool') {
      const target = current?.role === 'assistant' ? current : lastAssistant(items)
      if (!target) continue
      attachToolParts(target, message.parts)
      continue
    }
  }

  flush()
  return items
}

function turnIsVisible(turn: DialogueTurn): boolean {
  return turn.blocks.some((block) => block.kind === 'text' || block.kind === 'tool')
}

function lastAssistant(items: DialogueItem[]): DialogueTurn | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item?.kind === 'turn' && item.role === 'assistant') return item
  }
  return null
}

function sliceBlocks(message: Message): DialogueBlock[] {
  const blocks: DialogueBlock[] = []
  for (const part of message.parts) {
    if (part.kind === 'text') {
      const text = part.text.trim()
      if (text) blocks.push({ kind: 'text', text })
    } else if (part.kind === 'reasoning') {
      const text = part.text.trim()
      if (text) blocks.push({ kind: 'reasoning', text })
    } else if (part.kind === 'tool_call') {
      blocks.push({ kind: 'tool', tool: toolFromCall(part) })
    } else if (part.kind === 'tool_result' || part.kind === 'diff') {
      attachToolParts({ blocks }, [part])
    }
  }
  return blocks
}

function userBlocks(message: Message): DialogueBlock[] {
  const blocks: DialogueBlock[] = []
  for (const part of message.parts) {
    if (part.kind !== 'text') continue
    const text = displayUserText(part.text)
    if (text) blocks.push({ kind: 'text', text })
  }
  return blocks
}

function attachToolParts(turn: { blocks: DialogueBlock[] }, parts: Part[]): void {
  for (const part of parts) {
    if (part.kind === 'tool_result') {
      const match = part.callId
        ? [...turn.blocks].reverse().find((block) => block.kind === 'tool' && block.tool.callId === part.callId)
        : undefined
      if (match?.kind === 'tool') {
        match.tool.output = joinOutput(match.tool.output, part.output)
        if (part.isError) match.tool.isError = true
      } else {
        turn.blocks.push({
          kind: 'tool',
          tool: {
            name: '结果',
            summary: truncate(firstLine(part.output) || '工具结果', 80),
            callId: part.callId,
            input: undefined,
            output: part.output,
            isError: part.isError,
            diffs: []
          }
        })
      }
    } else if (part.kind === 'diff') {
      const last = [...turn.blocks].reverse().find((block) => block.kind === 'tool')
      if (last?.kind === 'tool') last.tool.diffs.push({ path: part.path, patch: part.patch })
      else {
        turn.blocks.push({
          kind: 'tool',
          tool: {
            name: '差异',
            summary: part.path || 'patch',
            input: undefined,
            diffs: [{ path: part.path, patch: part.patch }]
          }
        })
      }
    } else if (part.kind === 'tool_call') {
      turn.blocks.push({ kind: 'tool', tool: toolFromCall(part) })
    }
  }
}

function toolFromCall(part: Extract<Part, { kind: 'tool_call' }>): DialogueTool {
  return {
    name: part.name || 'tool',
    summary: summarizeTool(part.name, part.input),
    callId: part.callId,
    input: part.input,
    diffs: []
  }
}

function joinOutput(prev: string | undefined, next: string): string {
  if (!prev) return next
  if (!next) return prev
  return `${prev}\n${next}`
}

export function summarizeTool(name: string, input: unknown): string {
  const rec = asRecord(input)
  if (!rec) {
    if (typeof input === 'string' && input.trim()) return truncate(firstLine(input), 80)
    return name
  }

  const command = stringField(rec, 'command') ?? stringField(rec, 'cmd')
  const description = stringField(rec, 'description')
  const path =
    stringField(rec, 'file_path') ??
    stringField(rec, 'target_file') ??
    stringField(rec, 'path') ??
    stringField(rec, 'file') ??
    stringField(rec, 'glob')
  const pattern = stringField(rec, 'pattern') ?? stringField(rec, 'query') ?? stringField(rec, 'q')
  const url = stringField(rec, 'url')

  const key = name.toLowerCase()
  if (key.includes('bash') || key.includes('shell') || key === 'execute') {
    return truncate(command || description || name, 88)
  }
  if (key.includes('read') || key.includes('write') || key.includes('edit') || key.includes('strreplace')) {
    return truncate(shortPath(path) || description || name, 88)
  }
  if (key.includes('grep') || key.includes('glob') || key.includes('search')) {
    return truncate(pattern || path || name, 88)
  }
  if (key.includes('web') && url) return truncate(url, 88)

  return truncate(description || command || shortPath(path) || pattern || name, 88)
}

function displayUserText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const commandName = tagInner(trimmed, 'command-name')
  const commandMessage = tagInner(trimmed, 'command-message')
  const commandArgs = tagInner(trimmed, 'command-args')
  if (commandName && looksLikeMostlyTags(trimmed)) {
    const bits = [`命令 ${commandName.trim()}`]
    if (commandArgs?.trim()) bits.push(commandArgs.trim())
    else if (commandMessage?.trim() && commandMessage.trim() !== commandName.trim()) {
      bits.push(commandMessage.trim())
    }
    return bits.join('\n')
  }

  return trimmed
}

function looksLikeMostlyTags(text: string): boolean {
  const stripped = text
    .replace(/<\/?[a-z0-9_-]+[^>]*>/gi, '')
    .replace(/\s+/g, '')
  return stripped.length < 24
}

function tagInner(text: string, tag: string): string | undefined {
  const match = text.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i'))
  const inner = match?.[1]?.trim()
  return inner || undefined
}

export function isNoiseMessage(message: Message): boolean {
  if (message.role === 'system') {
    const text = collectText(message.parts)
    if (!text) return true
    if (text.startsWith('token_count ')) return true
    if (text.includes('<app-context>')) return true
    if (text.startsWith('You are Codex') || text.startsWith('You are Claude')) return true
    if (text.startsWith('[file]') || text.startsWith('[edited]')) return true
    if (text.startsWith('[') && text.length < 400 && message.parts.every((p) => p.kind === 'text')) {
      // hook / subtype leftovers
      if (/^\[(init|hook|stop|compact)/i.test(text)) return true
    }
    return true
  }
  if (message.role === 'tool') return false
  const parts = message.parts
  if (parts.length === 0) return true
  if (parts.every((part) => part.kind === 'reasoning')) return false
  if (message.role === 'user' && parts.every((part) => part.kind === 'tool_result')) return true
  return false
}

function collectText(parts: Part[]): string {
  return parts
    .filter((part): part is Extract<Part, { kind: 'text' }> => part.kind === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n')
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (isRecord(parsed)) return parsed
    } catch {
      return undefined
    }
    return undefined
  }
  if (isRecord(value)) return value
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function shortPath(path: string | undefined): string | undefined {
  if (!path) return undefined
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 2) return normalized
  return parts.slice(-2).join('/')
}

function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed) return trimmed
  }
  return ''
}

function truncate(text: string, max: number): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, Math.max(0, max - 1))}…`
}

