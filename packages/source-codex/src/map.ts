import type { Part, Role } from '@agentdock/core'
import { asString, isEnvironmentContext, isRecord, parseJsonValue, stringifyOutput } from './util.ts'

export const COMPACT_MARKER = '上下文压缩'

export type MappedRecord =
  | { kind: 'skip' }
  | {
      kind: 'meta'
      workspace?: string
      gitBranch?: string
      model?: string
    }
  | { kind: 'message'; role: Role; parts: Part[] }

export function mapCodexRecord(record: unknown): MappedRecord {
  if (!isRecord(record)) return { kind: 'skip' }
  const type = asString(record.type)
  const payload = isRecord(record.payload) ? record.payload : {}
  const payloadType = asString(payload.type)

  if (type === 'session_meta') return mapSessionMeta(payload)
  if (type === 'turn_context') return mapTurnContext(payload)
  if (type === 'compacted') {
    return { kind: 'message', role: 'system', parts: [{ kind: 'text', text: COMPACT_MARKER }] }
  }
  if (type === 'response_item') return mapResponseItem(payload, payloadType)
  if (type === 'event_msg') return mapEventMsg(payload, payloadType)
  return { kind: 'skip' }
}

function mapSessionMeta(payload: Record<string, unknown>): MappedRecord {
  const git = isRecord(payload.git) ? payload.git : undefined
  return {
    kind: 'meta',
    workspace: asString(payload.cwd),
    gitBranch: git ? asString(git.branch) : undefined,
    model: asString(payload.model_provider)
  }
}

function mapTurnContext(payload: Record<string, unknown>): MappedRecord {
  return {
    kind: 'meta',
    workspace: asString(payload.cwd),
    model: asString(payload.model)
  }
}

function mapResponseItem(payload: Record<string, unknown>, payloadType: string | undefined): MappedRecord {
  switch (payloadType) {
    case 'message':
      return mapMessageItem(payload)
    case 'reasoning':
      return mapReasoningItem(payload)
    case 'function_call':
    case 'custom_tool_call':
    case 'web_search_call':
    case 'image_generation_call':
      return mapToolCallItem(payload, payloadType)
    case 'function_call_output':
    case 'custom_tool_call_output':
      return mapToolResultItem(payload)
    default:
      return { kind: 'skip' }
  }
}

function mapEventMsg(payload: Record<string, unknown>, payloadType: string | undefined): MappedRecord {
  // Dual-stream: user_message / agent_message / agent_reasoning duplicate response_item.
  // Keep only token_count, patch_apply_end, and context_compacted.
  if (payloadType === 'token_count') {
    const text = formatTokenCount(payload)
    if (!text) return { kind: 'skip' }
    return { kind: 'message', role: 'system', parts: [{ kind: 'text', text }] }
  }

  if (payloadType === 'patch_apply_end') {
    const parts = mapPatchApplyEnd(payload)
    if (parts.length === 0) return { kind: 'skip' }
    return { kind: 'message', role: 'tool', parts }
  }

  if (payloadType === 'context_compacted') {
    return { kind: 'message', role: 'system', parts: [{ kind: 'text', text: COMPACT_MARKER }] }
  }

  return { kind: 'skip' }
}

function mapMessageItem(payload: Record<string, unknown>): MappedRecord {
  const parts = mapContentParts(payload.content)
  if (parts.length === 0) return { kind: 'skip' }
  return { kind: 'message', role: mapRole(asString(payload.role)), parts }
}

function mapRole(role: string | undefined): Role {
  if (role === 'user') return 'user'
  if (role === 'assistant') return 'assistant'
  if (role === 'tool') return 'tool'
  // Codex system prompts use role: developer
  return 'system'
}

function mapContentParts(content: unknown): Part[] {
  if (typeof content === 'string') {
    return content ? [{ kind: 'text', text: content }] : []
  }
  if (!Array.isArray(content)) return []
  const parts: Part[] = []
  for (const item of content) {
    if (typeof item === 'string') {
      if (item) parts.push({ kind: 'text', text: item })
      continue
    }
    if (!isRecord(item)) continue
    const type = asString(item.type)
    const text = asString(item.text)
    if (type === 'input_text' || type === 'output_text' || type === 'text') {
      if (text) parts.push({ kind: 'text', text })
      continue
    }
    if (type === 'input_image' || type === 'output_image') {
      parts.push({ kind: 'text', text: '[image]' })
    }
  }
  return parts
}

function mapReasoningItem(payload: Record<string, unknown>): MappedRecord {
  const text = collectReasoningText(payload)
  if (!text) return { kind: 'skip' }
  return { kind: 'message', role: 'assistant', parts: [{ kind: 'reasoning', text }] }
}

function collectReasoningText(payload: Record<string, unknown>): string {
  const chunks: string[] = []
  pushTextChunks(payload.summary, chunks)
  pushTextChunks(payload.content, chunks)
  return chunks.join('\n').trim()
}

function pushTextChunks(value: unknown, chunks: string[]): void {
  if (typeof value === 'string') {
    if (value.trim()) chunks.push(value)
    return
  }
  if (!Array.isArray(value)) return
  for (const item of value) {
    if (typeof item === 'string') {
      if (item.trim()) chunks.push(item)
      continue
    }
    if (!isRecord(item)) continue
    const text = asString(item.text)
    if (text?.trim()) chunks.push(text)
  }
}

function mapToolCallItem(payload: Record<string, unknown>, payloadType: string): MappedRecord {
  const name =
    asString(payload.name) ??
    (payloadType === 'web_search_call'
      ? 'web_search'
      : payloadType === 'image_generation_call'
        ? 'image_generation'
        : 'tool')
  const callId = asString(payload.call_id) ?? asString(payload.id)
  const input = toolCallInput(payload, payloadType)
  const part: Part = callId
    ? { kind: 'tool_call', name, input, callId }
    : { kind: 'tool_call', name, input }
  return { kind: 'message', role: 'assistant', parts: [part] }
}

function toolCallInput(payload: Record<string, unknown>, payloadType: string): unknown {
  if (payloadType === 'web_search_call') return payload.action ?? payload
  if (payloadType === 'image_generation_call') {
    return {
      status: payload.status,
      revised_prompt: payload.revised_prompt
    }
  }
  if ('input' in payload) return parseJsonValue(payload.input)
  if ('arguments' in payload) return parseJsonValue(payload.arguments)
  return payload
}

function mapToolResultItem(payload: Record<string, unknown>): MappedRecord {
  const callId = asString(payload.call_id) ?? asString(payload.id)
  const output = stringifyOutput(payload.output)
  const isError = payload.success === false || payload.status === 'failed'
  const part: Part = {
    kind: 'tool_result',
    output,
    ...(callId ? { callId } : {}),
    ...(isError ? { isError } : {})
  }
  return { kind: 'message', role: 'tool', parts: [part] }
}

function formatTokenCount(payload: Record<string, unknown>): string | undefined {
  const info = isRecord(payload.info) ? payload.info : undefined
  if (!info) return undefined
  const last = isRecord(info.last_token_usage) ? info.last_token_usage : undefined
  const total = isRecord(info.total_token_usage) ? info.total_token_usage : undefined
  const usage = last ?? total
  if (!usage) return undefined
  const num = (key: string): number => {
    const value = usage[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  const bits = [
    `input=${num('input_tokens')}`,
    `cached=${num('cached_input_tokens')}`,
    `output=${num('output_tokens')}`,
    `reasoning=${num('reasoning_output_tokens')}`,
    `total=${num('total_tokens')}`
  ]
  const window = info.model_context_window
  const extra = typeof window === 'number' ? ` window=${window}` : ''
  return `token_count ${bits.join(' ')}${extra}`
}

function mapPatchApplyEnd(payload: Record<string, unknown>): Part[] {
  const parts: Part[] = []
  const topPath = asString(payload.path)
  const topPatch = asString(payload.patch)
  if (topPath && topPatch) {
    parts.push({ kind: 'diff', path: topPath, patch: topPatch })
  }

  const changes = payload.changes
  if (isRecord(changes)) {
    for (const [path, change] of Object.entries(changes)) {
      const diff = changeToDiff(path, change)
      if (diff) parts.push(diff)
    }
  }

  if (parts.length > 0) return parts

  const stdout = asString(payload.stdout)
  const stderr = asString(payload.stderr)
  const output = [stdout, stderr].filter(Boolean).join('\n')
  if (!output) return []
  const callId = asString(payload.call_id)
  const result: Part = {
    kind: 'tool_result',
    output,
    ...(callId ? { callId } : {}),
    ...(payload.success === false ? { isError: true } : {})
  }
  return [result]
}

function changeToDiff(path: string, change: unknown): Part | undefined {
  if (!isRecord(change)) return undefined
  const unified = asString(change.unified_diff) ?? asString(change.patch) ?? asString(change.diff)
  if (unified) return { kind: 'diff', path, patch: unified }
  const content = typeof change.content === 'string' ? change.content : ''
  const type = asString(change.type)
  if (type === 'add') return { kind: 'diff', path, patch: syntheticPatch(path, content, 'add') }
  if (type === 'delete') return { kind: 'diff', path, patch: syntheticPatch(path, content, 'delete') }
  return undefined
}

function syntheticPatch(path: string, content: string, mode: 'add' | 'delete'): string {
  const prefix = mode === 'add' ? '+' : '-'
  const header = mode === 'add' ? `--- /dev/null\n+++ ${path}\n` : `--- ${path}\n+++ /dev/null\n`
  const body = content.split('\n').map((line) => `${prefix}${line}`).join('\n')
  return `${header}${body}`
}

export function firstUserTitleText(parts: Part[]): string | undefined {
  for (const part of parts) {
    if (part.kind !== 'text' || !part.text.trim()) continue
    if (isEnvironmentContext(part.text)) continue
    return part.text
  }
  return undefined
}
