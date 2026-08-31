import type { Message, Part } from '@chats/core'
import { isCompactMarker, summarizeTool } from './dialogue.ts'

export type TrajKind = 'system' | 'user' | 'context' | 'assistant' | 'tool'
export type TrajLane = 'input' | 'model' | 'tools'

export interface TrajRecord {
  id: string
  index: number
  turn: number | null
  lane: TrajLane
  kind: TrajKind
  startedAt: number
  durationMs: number
  preview: string
  detail: string
  toolName?: string
  callId?: string
  isError?: boolean
}

export interface TrajTurn {
  turn: number | null
  records: TrajRecord[]
}

export interface TrajProjection {
  turns: TrajTurn[]
  records: TrajRecord[]
  stats: { durationMs: number; turnCount: number; callCount: number }
}

const KIND_LANE: Record<TrajKind, TrajLane> = {
  system: 'input',
  user: 'input',
  context: 'input',
  assistant: 'model',
  tool: 'tools'
}

export const KIND_LABEL: Record<TrajKind, string> = {
  system: 'SYSTEM',
  user: 'USER',
  context: 'CONTEXT',
  assistant: 'ASSISTANT',
  tool: 'TOOL'
}

export function projectTrajectory(messages: Message[]): TrajProjection {
  const raw: Omit<TrajRecord, 'index' | 'durationMs'>[] = []
  let turn = 0

  for (const message of messages) {
    if (isCompactMarker(message)) {
      raw.push(makeRecord(message.id, turn || null, 'context', message.createdAt, '上下文压缩', '上下文压缩'))
      continue
    }

    const classified = classifyMessage(message, turn)
    if (!classified) continue
    if (classified.newTurn) turn += 1
    const assigned = turn || null
    for (const rec of classified.records) {
      raw.push({ ...rec, turn: rec.turn ?? assigned })
    }
  }

  const timed = assignDurations(mergeToolResults(raw))
  const turns = groupTurns(timed)
  const callCount = timed.filter((record) => record.kind === 'tool').length
  const numberedTurns = new Set(timed.map((record) => record.turn).filter((value): value is number => value != null))
  const first = timed[0]?.startedAt ?? 0
  const last = timed.at(-1)
  const durationMs = last ? Math.max(0, last.startedAt + last.durationMs - first) : 0

  return {
    turns,
    records: timed,
    stats: { durationMs, turnCount: numberedTurns.size, callCount }
  }
}

function classifyMessage(
  message: Message,
  currentTurn: number
): { newTurn: boolean; records: Omit<TrajRecord, 'index' | 'durationMs'>[] } | null {
  if (message.role === 'user') {
    if (message.parts.every((part) => part.kind === 'tool_result')) {
      return {
        newTurn: false,
        records: toolRecords(message, currentTurn || null)
      }
    }
    const text = collectText(message.parts)
    if (!text) return null
    return {
      newTurn: true,
      records: [makeRecord(message.id, currentTurn + 1, 'user', message.createdAt, firstLine(text), text)]
    }
  }

  if (message.role === 'assistant') {
    return { newTurn: false, records: splitAssistant(message, currentTurn || 1) }
  }

  if (message.role === 'tool') {
    return { newTurn: false, records: toolRecords(message, currentTurn || null) }
  }

  if (message.role === 'system') {
    const text = collectText(message.parts)
    if (!text) return null
    const kind = systemKind(text)
    const preview =
      kind === 'system' && (text.includes('<app-context>') || text.startsWith('You are '))
        ? 'Initial System Prompt'
        : firstLine(text)
    return {
      newTurn: false,
      records: [makeRecord(message.id, currentTurn || null, kind, message.createdAt, preview, text)]
    }
  }

  return null
}

function splitAssistant(
  message: Message,
  turn: number
): Omit<TrajRecord, 'index' | 'durationMs'>[] {
  const records: Omit<TrajRecord, 'index' | 'durationMs'>[] = []
  let textBuf: string[] = []
  let reasonBuf: string[] = []
  let partIndex = 0

  const flushText = () => {
    const reasoning = reasonBuf.join('\n').trim()
    const text = textBuf.join('\n').trim()
    reasonBuf = []
    textBuf = []
    if (!reasoning && !text) return
    const preview = firstLine(text) || (reasoning ? `Think · ${firstLine(reasoning)}` : 'ASSISTANT')
    const detail = [reasoning ? `Think\n${reasoning}` : '', text].filter(Boolean).join('\n\n')
    records.push(makeRecord(`${message.id}:a:${partIndex++}`, turn, 'assistant', message.createdAt, preview, detail))
  }

  for (const part of message.parts) {
    if (part.kind === 'reasoning') {
      if (part.text.trim()) reasonBuf.push(part.text.trim())
      continue
    }
    if (part.kind === 'text') {
      if (part.text.trim()) textBuf.push(part.text.trim())
      continue
    }
    flushText()
    if (part.kind === 'tool_call') {
      records.push(
        makeRecord(
          `${message.id}:t:${part.callId ?? partIndex++}`,
          turn,
          'tool',
          message.createdAt,
          `${part.name} · ${summarizeTool(part.name, part.input)}`,
          stringify(part.input),
          part.name
        )
      )
    } else if (part.kind === 'tool_result') {
      records.push(
        makeRecord(
          `${message.id}:r:${part.callId ?? partIndex++}`,
          turn,
          'tool',
          message.createdAt,
          firstLine(part.output) || 'tool result',
          part.output,
          undefined,
          part.isError
        )
      )
    } else if (part.kind === 'diff') {
      records.push(
        makeRecord(`${message.id}:d:${partIndex++}`, turn, 'tool', message.createdAt, part.path || 'diff', part.patch, 'diff')
      )
    }
  }
  flushText()
  return records
}

function toolRecords(
  message: Message,
  turn: number | null
): Omit<TrajRecord, 'index' | 'durationMs'>[] {
  const records: Omit<TrajRecord, 'index' | 'durationMs'>[] = []
  let i = 0
  for (const part of message.parts) {
    if (part.kind === 'tool_call') {
      records.push(
        makeRecord(
          `${message.id}:t:${part.callId ?? i++}`,
          turn,
          'tool',
          message.createdAt,
          `${part.name} · ${summarizeTool(part.name, part.input)}`,
          stringify(part.input),
          part.name
        )
      )
    } else if (part.kind === 'tool_result') {
      records.push(
        makeRecord(
          `${message.id}:r:${part.callId ?? i++}`,
          turn,
          'tool',
          message.createdAt,
          firstLine(part.output) || 'tool result',
          part.output,
          undefined,
          part.isError
        )
      )
    } else if (part.kind === 'diff') {
      records.push(
        makeRecord(`${message.id}:d:${i++}`, turn, 'tool', message.createdAt, part.path || 'diff', part.patch, 'diff')
      )
    } else if (part.kind === 'text' && part.text.trim()) {
      records.push(makeRecord(`${message.id}:x:${i++}`, turn, 'tool', message.createdAt, firstLine(part.text), part.text))
    }
  }
  return records
}

function systemKind(text: string): TrajKind {
  if (text.startsWith('token_count ')) return 'context'
  if (text.startsWith('[file]') || text.startsWith('[edited]')) return 'context'
  if (text.includes('<system-reminder>') || text.includes('skill-catalog')) return 'context'
  if (text.includes('<app-context>') || text.startsWith('You are ')) return 'system'
  return 'context'
}

function mergeToolResults(
  raw: Omit<TrajRecord, 'index' | 'durationMs'>[]
): Omit<TrajRecord, 'index' | 'durationMs'>[] {
  const out: Omit<TrajRecord, 'index' | 'durationMs'>[] = []
  const byCall = new Map<string, Omit<TrajRecord, 'index' | 'durationMs'>>()
  for (const record of raw) {
    const parsed = parseToolId(record.id)
    if (record.kind === 'tool' && parsed?.side === 't') {
      out.push(record)
      byCall.set(parsed.callId, record)
      continue
    }
    if (record.kind === 'tool' && parsed?.side === 'r') {
      const call = byCall.get(parsed.callId)
      if (call) {
        call.detail = [call.detail, record.detail].filter(Boolean).join('\n\n')
        if (record.isError) call.isError = true
        continue
      }
    }
    out.push(record)
  }
  return out
}

function parseToolId(id: string): { side: 't' | 'r'; callId: string } | undefined {
  const match = /:(t|r):(.+)$/.exec(id)
  if (match?.[1] !== 't' && match?.[1] !== 'r') return undefined
  if (!match[2]) return undefined
  return { side: match[1], callId: match[2] }
}

function makeRecord(
  id: string,
  turn: number | null,
  kind: TrajKind,
  startedAt: number,
  preview: string,
  detail: string,
  toolName?: string,
  isError?: boolean
): Omit<TrajRecord, 'index' | 'durationMs'> {
  return {
    id,
    turn,
    lane: KIND_LANE[kind],
    kind,
    startedAt,
    preview: preview.slice(0, 240),
    detail,
    ...(toolName ? { toolName } : {}),
    ...(isError ? { isError: true } : {})
  }
}

function assignDurations(raw: Omit<TrajRecord, 'index' | 'durationMs'>[]): TrajRecord[] {
  const times = raw.map((record, index) => record.startedAt || index)
  return raw.map((record, index) => {
    const start = times[index] ?? index
    const next = times[index + 1]
    const durationMs = next != null && next > start ? next - start : 400
    return { ...record, startedAt: start, index, durationMs }
  })
}

function groupTurns(records: TrajRecord[]): TrajTurn[] {
  const turns: TrajTurn[] = []
  for (const record of records) {
    const last = turns.at(-1)
    if (last && last.turn === record.turn) {
      last.records.push(record)
    } else {
      turns.push({ turn: record.turn, records: [record] })
    }
  }
  return turns
}

function collectText(parts: Part[]): string {
  return parts
    .filter((part): part is Extract<Part, { kind: 'text' }> => part.kind === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n')
}

function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed) return trimmed.slice(0, 180)
  }
  return ''
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? ''
  } catch {
    return String(value)
  }
}

export function recordSearchText(record: TrajRecord): string {
  return `${KIND_LABEL[record.kind]} ${record.preview} ${record.detail} ${record.toolName ?? ''}`.toLowerCase()
}
