import type { Message, Part } from '@agentdock/core'

export type PlanSource = 'tool' | 'disk' | 'heuristic'

export interface PlanTodo {
  id?: string
  content: string
  status?: string
}

export interface PlanDoc {
  id: string
  title: string
  overview: string
  body: string
  path?: string
  source: PlanSource
  todos: PlanTodo[]
  createdAt: number
}

const CODEX_MIN_CHARS = 400

const CURSOR_PLAN_RE = /(?:~|\/[^\s"'<>]*?)\/\.cursor\/plans\/[^\s"'<>]+\.plan\.md/g
const CLAUDE_PLAN_RE = /(?:~|\/[^\s"'<>]*?)\/\.claude\/plans\/[^\s"'<>]+\.md/g

const SOURCE_RANK: Record<PlanSource, number> = { disk: 2, tool: 1, heuristic: 0 }

export const PLAN_SOURCE_LABEL: Record<PlanSource, string> = {
  tool: '工具',
  disk: '磁盘',
  heuristic: '启发式'
}

export const TODO_STATUS_LABEL: Record<string, string> = {
  pending: '待办',
  in_progress: '进行中',
  completed: '完成',
  cancelled: '取消'
}

/** 同一磁盘路径的合并键：丢掉 home / `~` 前缀。 */
export function planPathKey(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const cursor = normalized.indexOf('/.cursor/plans/')
  if (cursor >= 0) return normalized.slice(cursor)
  const claude = normalized.indexOf('/.claude/plans/')
  if (claude >= 0) return normalized.slice(claude)
  return normalized
}

export function extractPlanFilePaths(text: string): string[] {
  const normalized = text.replace(/\\/g, '/')
  const found = new Set<string>()
  for (const re of [CURSOR_PLAN_RE, CLAUDE_PLAN_RE]) {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(normalized))) {
      const path = match[0]
      if (path) found.add(path)
    }
  }
  return [...found]
}

export function parsePlanMarkdown(raw: string): {
  name?: string
  overview?: string
  todos: PlanTodo[]
  body: string
} {
  const trimmed = raw.replace(/^\uFEFF/, '')
  if (!trimmed.startsWith('---')) return { todos: [], body: raw }
  const afterOpen = trimmed.slice(3)
  const rest = afterOpen.startsWith('\n') ? afterOpen.slice(1) : afterOpen
  const close = rest.search(/\n---[ \t]*(?:\n|$)/)
  if (close < 0) return { todos: [], body: raw }
  const fm = rest.slice(0, close)
  const body = rest.slice(close).replace(/^\n---[ \t]*/, '').replace(/^\n/, '')
  return { ...parseFrontmatter(fm), body }
}

export function projectPlans(messages: Message[]): PlanDoc[] {
  const plans: PlanDoc[] = []
  const byKey = new Map<string, number>()

  const add = (doc: PlanDoc): void => {
    if (doc.path) {
      const key = planPathKey(doc.path)
      const existing = byKey.get(key)
      if (existing !== undefined) {
        plans[existing] = mergePlans(plans[existing]!, doc)
        return
      }
      byKey.set(key, plans.length)
    }
    plans.push(doc)
  }

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.kind === 'tool_call') {
        const fromTool = planFromTool(part.name, part.input, part.callId, message.createdAt)
        if (fromTool) add(fromTool)
      }
      for (const blob of partBlobs(part)) {
        for (const path of extractPlanFilePaths(blob)) {
          add({
            id: `plan:${planPathKey(path)}`,
            title: titleFromPlanPath(path),
            overview: '',
            body: '',
            path,
            source: 'disk',
            todos: [],
            createdAt: message.createdAt
          })
        }
      }
    }
  }

  const hasStructured = plans.some((plan) => plan.source === 'tool' || plan.source === 'disk')
  if (!hasStructured) {
    for (const message of messages) {
      if (message.role !== 'assistant') continue
      for (const part of message.parts) {
        if (part.kind !== 'text') continue
        const heuristic = planFromCodexText(part.text, message.createdAt)
        if (heuristic && !plans.some((plan) => plan.body.trim() === heuristic.body.trim())) {
          add(heuristic)
        }
      }
    }
  }

  return attachOrphanDiskPaths(plans)
}

function planFromTool(name: string, input: unknown, callId: string | undefined, createdAt: number): PlanDoc | undefined {
  const key = name.toLowerCase()
  const rec = asRecord(input)
  if (key === 'createplan') {
    const body = rec ? stringField(rec, 'plan') ?? '' : typeof input === 'string' ? input : ''
    const title = rec ? stringField(rec, 'name') : undefined
    const overview = rec ? stringField(rec, 'overview') ?? '' : ''
    const path = rec ? planPathFromRecord(rec) : undefined
    if (!body.trim() && !title && !path) return undefined
    return {
      id: callId ? `plan:tool:${callId}` : `plan:create:${createdAt}`,
      title: title || headingTitle(body) || '未命名计划',
      overview,
      body,
      path,
      source: path ? 'disk' : 'tool',
      todos: rec ? todosFromUnknown(rec.todos) : [],
      createdAt
    }
  }
  if (key === 'exitplanmode') {
    const body = rec ? stringField(rec, 'plan') ?? '' : typeof input === 'string' ? input : ''
    const path = rec ? planPathFromRecord(rec) : undefined
    if (!body.trim() && !path) return undefined
    return {
      id: callId ? `plan:tool:${callId}` : `plan:exit:${createdAt}`,
      title: headingTitle(body) || titleFromPlanPath(path ?? '') || '计划',
      overview: '',
      body,
      path,
      source: path ? 'disk' : 'tool',
      todos: rec ? todosFromUnknown(rec.todos) : [],
      createdAt
    }
  }
  return undefined
}

function planFromCodexText(text: string, createdAt: number): PlanDoc | undefined {
  const trimmed = text.trim()
  if (trimmed.length < CODEX_MIN_CHARS) return undefined
  const first = firstNonEmptyLine(trimmed)
  if (!first || !/^#{1,6}\s+\S/.test(first)) return undefined
  const heading = first.replace(/^#{1,6}\s+/, '')
  if (!/计划|\bPlan\b/i.test(heading)) return undefined
  return {
    id: `plan:heuristic:${createdAt}:${heading.slice(0, 24)}`,
    title: heading,
    overview: '',
    body: trimmed,
    source: 'heuristic',
    todos: [],
    createdAt
  }
}

function mergePlans(a: PlanDoc, b: PlanDoc): PlanDoc {
  const preferred = SOURCE_RANK[a.source] >= SOURCE_RANK[b.source] ? a : b
  const other = preferred === a ? b : a
  const path = a.path || b.path
  const body = preferred.body.trim() ? preferred.body : other.body
  const todos = preferred.todos.length > 0 ? preferred.todos : other.todos
  const tool = a.source === 'tool' ? a : b.source === 'tool' ? b : undefined
  return {
    id: a.createdAt <= b.createdAt ? a.id : b.id,
    title: tool?.title || preferred.title || other.title,
    overview: tool?.overview || preferred.overview || other.overview,
    body,
    path,
    source: path ? (preferred.source === 'heuristic' ? other.source : preferred.source) : preferred.source,
    todos,
    createdAt: Math.min(a.createdAt, b.createdAt)
  }
}

function attachOrphanDiskPaths(plans: PlanDoc[]): PlanDoc[] {
  const tools = plans.filter((plan) => plan.source === 'tool' && !plan.path)
  const disks = plans.filter((plan) => plan.source === 'disk' && plan.path && !plan.body.trim())
  if (tools.length !== 1 || disks.length === 0) return plans
  const tool = tools[0]!
  const matched =
    disks.find((disk) => pathMatchesTitle(disk.path ?? '', tool.title)) ?? (disks.length === 1 ? disks[0] : undefined)
  if (!matched) return plans
  return [...plans.filter((plan) => plan !== tool && plan !== matched), mergePlans(tool, matched)].sort(
    (a, b) => a.createdAt - b.createdAt
  )
}

function pathMatchesTitle(path: string, title: string): boolean {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  if (!slug) return false
  return fileName(path).toLowerCase().replace(/[^a-z0-9]+/g, '_').startsWith(slug)
}

function planPathFromRecord(rec: Record<string, unknown>): string | undefined {
  const direct =
    stringField(rec, 'planFilePath') ??
    stringField(rec, 'plan_file_path') ??
    stringField(rec, 'file_path') ??
    stringField(rec, 'path')
  if (direct && extractPlanFilePaths(direct).length > 0) return extractPlanFilePaths(direct)[0] ?? direct
  const blobs = [stringifyUnknown(rec)]
  for (const blob of blobs) {
    const found = extractPlanFilePaths(blob)
    if (found[0]) return found[0]
  }
  return undefined
}

function titleFromPlanPath(path: string): string {
  if (!path) return '计划'
  const base = fileName(path)
  const stripped = base.replace(/\.plan\.md$/i, '').replace(/\.md$/i, '')
  const withoutHash = stripped.replace(/_[a-f0-9]{6,12}$/i, '')
  const spaced = withoutHash.replace(/_/g, ' ').trim()
  return spaced || base
}

function headingTitle(body: string): string | undefined {
  const first = firstNonEmptyLine(body)
  if (!first) return undefined
  if (!/^#{1,6}\s+\S/.test(first)) return undefined
  return first.replace(/^#{1,6}\s+/, '').trim() || undefined
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed) return trimmed
  }
  return ''
}

function parseFrontmatter(fm: string): { name?: string; overview?: string; todos: PlanTodo[] } {
  const name = yamlScalar(fm, 'name')
  const overview = yamlScalar(fm, 'overview')
  return { name, overview, todos: yamlTodos(fm) }
}

function yamlScalar(fm: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.*)$`, 'm')
  const match = re.exec(fm)
  if (!match) return undefined
  let value = (match[1] ?? '').trim()
  if (!value || value === '|' || value === '>') return undefined
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return value || undefined
}

function yamlTodos(fm: string): PlanTodo[] {
  const start = fm.search(/^todos:\s*$/m)
  if (start < 0) return []
  const block = fm.slice(start)
  const todos: PlanTodo[] = []
  let current: PlanTodo | undefined
  for (const rawLine of block.split(/\r?\n/).slice(1)) {
    if (/^\S/.test(rawLine) && !rawLine.startsWith(' ')) break
    const item = rawLine.match(/^\s*-\s+id:\s*(.+?)\s*$/)
    if (item) {
      if (current?.content) todos.push(current)
      current = { id: unquote(item[1] ?? ''), content: '' }
      continue
    }
    const itemContent = rawLine.match(/^\s*-\s+content:\s*(.*)$/)
    if (itemContent) {
      if (current?.content) todos.push(current)
      current = { content: unquote(itemContent[1] ?? '') }
      continue
    }
    if (!current) continue
    const content = rawLine.match(/^\s+content:\s*(.*)$/)
    if (content) {
      current.content = unquote(content[1] ?? '')
      continue
    }
    const status = rawLine.match(/^\s+status:\s*(.*)$/)
    if (status) current.status = unquote(status[1] ?? '')
  }
  if (current?.content) todos.push(current)
  return todos
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function todosFromUnknown(value: unknown): PlanTodo[] {
  if (!Array.isArray(value)) return []
  const todos: PlanTodo[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const content = stringField(item, 'content') ?? stringField(item, 'title') ?? stringField(item, 'text')
    if (!content) continue
    todos.push({
      id: stringField(item, 'id'),
      content,
      status: stringField(item, 'status')
    })
  }
  return todos
}

function partBlobs(part: Part): string[] {
  switch (part.kind) {
    case 'text':
    case 'reasoning':
      return [part.text]
    case 'tool_call':
      return [part.name, stringifyUnknown(part.input)]
    case 'tool_result':
      return [part.output]
    case 'diff':
      return [part.path, part.patch]
    default:
      return []
  }
}

function fileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts.at(-1) || path
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined
    try {
      const parsed: unknown = JSON.parse(trimmed)
      return isRecord(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return isRecord(value) ? value : undefined
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
