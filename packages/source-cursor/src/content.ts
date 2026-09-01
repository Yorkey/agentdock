import type { Part, Role } from '@agentdock/core'

const TIMESTAMP_RE = /<timestamp>\s*([\s\S]*?)\s*<\/timestamp>/i
const USER_QUERY_RE = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/i

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isEnoent(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}

export function mapRole(value: unknown): Role | undefined {
  if (value === 'user' || value === 'assistant' || value === 'system' || value === 'tool') {
    return value
  }
  return undefined
}

export function extractTimestampMs(text: string): number | undefined {
  const match = TIMESTAMP_RE.exec(text)
  if (!match?.[1]) return undefined
  return parseCursorTimestamp(match[1].trim())
}

export function extractUserQuery(text: string): string | undefined {
  const match = USER_QUERY_RE.exec(text)
  if (!match?.[1]) return undefined
  const inner = match[1].trim()
  return inner || undefined
}

/** Drop `<timestamp>` and unwrap `<user_query>` so the displayed part is the query text. */
export function stripWrappers(text: string): string {
  const withoutTs = text.replace(TIMESTAMP_RE, '')
  const unwrapped = withoutTs.replace(USER_QUERY_RE, (_, inner: string) => inner.trim())
  return unwrapped.trim()
}

/**
 * Cursor embeds timestamps like `Thursday, Jul 16, 2026, 3:27 PM (UTC+8)`.
 * `Date.parse` accepts that form on current Node; normalize UTC offsets as fallback.
 */
export function parseCursorTimestamp(raw: string): number | undefined {
  const direct = Date.parse(raw)
  if (!Number.isNaN(direct)) return direct
  const normalized = raw.replace(
    /\(UTC\s*([+-]\d{1,2})(?::?(\d{2}))?\)/i,
    (_all, hourToken: string, minuteToken?: string) => {
      const hour = Number(hourToken)
      const sign = hour < 0 || hourToken.trim().startsWith('-') ? '-' : '+'
      const hh = String(Math.abs(hour)).padStart(2, '0')
      const mm = (minuteToken ?? '00').padStart(2, '0')
      return `GMT${sign}${hh}${mm}`
    }
  )
  const parsed = Date.parse(normalized)
  return Number.isNaN(parsed) ? undefined : parsed
}

export function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed) return trimmed
  }
  return ''
}

export function mapMessageParts(content: unknown): Part[] {
  if (typeof content === 'string') {
    const text = stripWrappers(content)
    return text ? [{ kind: 'text', text }] : []
  }
  if (!Array.isArray(content)) return []
  const parts: Part[] = []
  for (const block of content) {
    const part = mapBlock(block)
    if (part) parts.push(part)
  }
  return parts
}

function mapBlock(block: unknown): Part | undefined {
  if (!isRecord(block)) return undefined
  const type = block.type
  if (type === 'text') {
    const raw = typeof block.text === 'string' ? block.text : ''
    const text = stripWrappers(raw)
    return text ? { kind: 'text', text } : undefined
  }
  if (type === 'thinking' || type === 'reasoning') {
    const text =
      typeof block.thinking === 'string'
        ? block.thinking
        : typeof block.text === 'string'
          ? block.text
          : ''
    return text ? { kind: 'reasoning', text } : undefined
  }
  if (type === 'tool_use' || type === 'tool_call') {
    const name = typeof block.name === 'string' ? block.name : 'unknown'
    const callId = stringField(block, 'id') ?? stringField(block, 'tool_use_id')
    return callId
      ? { kind: 'tool_call', name, input: block.input ?? null, callId }
      : { kind: 'tool_call', name, input: block.input ?? null }
  }
  if (type === 'tool_result') {
    const callId =
      stringField(block, 'tool_use_id') ??
      stringField(block, 'tool_call_id') ??
      stringField(block, 'callId')
    const isError = block.is_error === true || block.isError === true
    const output = stringifyOutput(block.content ?? block.output ?? block.text)
    if (callId && isError) return { kind: 'tool_result', output, callId, isError }
    if (callId) return { kind: 'tool_result', output, callId }
    if (isError) return { kind: 'tool_result', output, isError }
    return { kind: 'tool_result', output }
  }
  if (type === 'diff') {
    const diffPath = stringField(block, 'path') ?? stringField(block, 'file') ?? ''
    const patch = typeof block.patch === 'string' ? block.patch : stringifyOutput(block.diff ?? block.text)
    if (!diffPath && !patch) return undefined
    return { kind: 'diff', path: diffPath, patch }
  }
  return undefined
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value ? value : undefined
}

function stringifyOutput(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (isRecord(item) && typeof item.text === 'string') return item.text
        return safeJson(item)
      })
      .filter(Boolean)
      .join('\n')
  }
  return safeJson(value)
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function rawTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const chunks: string[] = []
  for (const block of content) {
    if (!isRecord(block)) continue
    if (typeof block.text === 'string') chunks.push(block.text)
  }
  return chunks.join('\n')
}
