import type { Message, Part } from '@agentdock/core'

export const COMPACT_MARKER = '上下文压缩'

export type ViewMode = 'chat' | 'trajectory' | 'plan' | 'changes'

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
  | { kind: 'injected'; text: string; label: string }
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

export function injectionsOf(turn: DialogueTurn): { text: string; label: string }[] {
  return turn.blocks
    .filter((block): block is { kind: 'injected'; text: string; label: string } => block.kind === 'injected')
    .map((block) => ({ text: block.text, label: block.label }))
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
    if (block.kind !== 'tool') continue
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

const MODE_KEY = 'agentdock.viewMode'
const LEGACY_MODE_KEY = 'chats.viewMode'

function migrateLegacyKey(nextKey: string, legacyKey: string): void {
  try {
    const legacy = localStorage.getItem(legacyKey)
    if (legacy && !localStorage.getItem(nextKey)) {
      localStorage.setItem(nextKey, legacy)
      localStorage.removeItem(legacyKey)
    }
  } catch {
    // ignore
  }
}

export function loadViewMode(): ViewMode {
  migrateLegacyKey(MODE_KEY, LEGACY_MODE_KEY)
  try {
    const value = localStorage.getItem(MODE_KEY)
    if (value === 'trajectory' || value === 'chat' || value === 'plan' || value === 'changes') return value
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
  return turn.blocks.some((block) => block.kind === 'text' || block.kind === 'tool' || block.kind === 'injected')
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
    const classified = classifyUserText(part.text)
    if (!classified.text) continue
    if (classified.kind === 'injected') {
      blocks.push({ kind: 'injected', text: classified.text, label: classified.label })
    } else {
      blocks.push({ kind: 'text', text: classified.text })
    }
  }
  return blocks
}

function attachToolParts(turn: { blocks: DialogueBlock[] }, parts: Part[]): void {
  const byCallId = new Map<string, DialogueTool>()
  for (const block of turn.blocks) {
    if (block.kind === 'tool' && block.tool.callId) byCallId.set(block.tool.callId, block.tool)
  }
  let lastTool = lastToolBlock(turn.blocks)

  const pushTool = (tool: DialogueTool): void => {
    turn.blocks.push({ kind: 'tool', tool })
    if (tool.callId) byCallId.set(tool.callId, tool)
    lastTool = tool
  }

  for (const part of parts) {
    if (part.kind === 'tool_result') {
      const match = part.callId ? byCallId.get(part.callId) : undefined
      if (match) {
        match.output = joinOutput(match.output, part.output)
        if (part.isError) match.isError = true
      } else {
        pushTool({
          name: '结果',
          summary: truncate(firstLine(part.output) || '工具结果', 80),
          callId: part.callId,
          input: undefined,
          output: part.output,
          isError: part.isError,
          diffs: []
        })
      }
    } else if (part.kind === 'diff') {
      if (lastTool) lastTool.diffs.push({ path: part.path, patch: part.patch })
      else {
        pushTool({
          name: '差异',
          summary: part.path || 'patch',
          input: undefined,
          diffs: [{ path: part.path, patch: part.patch }]
        })
      }
    } else if (part.kind === 'tool_call') {
      pushTool(toolFromCall(part))
    }
  }
}

function lastToolBlock(blocks: DialogueBlock[]): DialogueTool | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    if (block?.kind === 'tool') return block.tool
  }
  return undefined
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

export interface InjectedTextRule {
  /** 稳定标识，便于回归时定位是哪条规则命中 */
  id: string
  /** 折叠行上展示的中文说明 */
  label: string
  pattern: RegExp
}

/** 整条文本就是一对 XML 风格标签时才算注入，避免吃掉夹带标签的真实输入 */
function wrappedIn(tag: string): RegExp {
  return new RegExp(`^<${tag}(?:\\s[^>]*)?>[\\s\\S]*</${tag}>$`, 'i')
}

/**
 * harness 注入文本的识别规则，集中在这里便于后续增补。
 *
 * 判定必须保守：宁可把注入当成用户输入展示，也不能把真实用户输入折叠掉。
 * 因此每条 pattern 都从文本开头锚定，匹配的是各家 harness 的固定话术或完整标签包裹，
 * 不做「包含某关键词」这种宽松匹配。
 */
export const INJECTED_TEXT_RULES: readonly InjectedTextRule[] = [
  { id: 'follow-up', label: '后续动作提示', pattern: /^perform any necessary follow-up actions?\b/i },
  {
    id: 'caveat',
    label: '本地命令说明',
    pattern: /^caveat: the messages below were generated by the user while running local commands/i
  },
  { id: 'local-command', label: '本地命令输出', pattern: /^<local-command-(?:stdout|stderr)>/i },
  { id: 'command-output', label: '命令输出', pattern: wrappedIn('command-output') },
  { id: 'system-reminder', label: '系统提醒', pattern: wrappedIn('system-reminder') },
  { id: 'environment-details', label: '环境信息', pattern: wrappedIn('environment_details') },
  { id: 'user-instructions', label: '仓库指令', pattern: wrappedIn('user_instructions') },
  { id: 'attached-files', label: '附加文件', pattern: wrappedIn('attached_files') },
  { id: 'interrupted', label: '中断标记', pattern: /^\[request interrupted by user(?: for tool use)?\]$/i },
  {
    id: 'compact-continue',
    label: '压缩后续写',
    pattern: /^this session is being continued from a previous conversation/i
  },
  {
    id: 'compact-request',
    label: '压缩摘要指令',
    pattern: /^your task is to create a detailed summary of the conversation so far/i
  }
] as const

export interface ClassifiedUserText {
  kind: 'user' | 'injected'
  /** 归一化后的展示文本，空串表示这段没有可展示内容 */
  text: string
  /** 注入类文本的中文说明，用户输入为空串 */
  label: string
  ruleId?: string
}

/**
 * 判断一段用户消息文本是真实输入还是 harness 注入。
 * 注入类只渲染成一行可展开的「系统注入」，不占用户气泡。
 */
export function classifyUserText(raw: string): ClassifiedUserText {
  const text = displayUserText(raw)
  if (!text) return { kind: 'user', text: '', label: '' }
  for (const rule of INJECTED_TEXT_RULES) {
    if (rule.pattern.test(text)) return { kind: 'injected', text, label: rule.label, ruleId: rule.id }
  }
  return { kind: 'user', text, label: '' }
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

