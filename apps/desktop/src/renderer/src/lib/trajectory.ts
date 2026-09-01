import type { Message, Part } from '@agentdock/core'
import { isCompactMarker, summarizeTool } from './dialogue.ts'

export type TrajKind = 'system' | 'user' | 'context' | 'assistant' | 'tool'
export type TrajLane = 'input' | 'model' | 'tools'

/** 搜索 haystack 里 detail 最多保留这么多字，避免每次按键拼接完整 tool 输出 */
export const SEARCH_DETAIL_LIMIT = 400

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
  /** kind + preview + toolName + 截断后的 detail，投影时算好 */
  searchHaystack: string
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

/** DSH 四态：等宽顺序 / 自身时长+压缩空闲 / 等宽按墙钟 / 自身时长+保留空闲 */
export type TimelineMode = 'sequence' | 'duration' | 'time' | 'actual'

export interface TimelineSpan {
  record: TrajRecord
  start: number
  end: number
}

export interface TimelineModel {
  start: number
  end: number
  spans: TimelineSpan[]
}

type OpenRecord = Omit<TrajRecord, 'index' | 'durationMs' | 'searchHaystack'> & { endedAt?: number }

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
  const raw: OpenRecord[] = []
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

  const timed = assignOwnDurations(mergeToolResults(raw))
  const turns = groupTurns(timed)
  const callCount = timed.filter((record) => record.kind === 'tool').length
  const numberedTurns = new Set(timed.map((record) => record.turn).filter((value): value is number => value != null))
  const durationMs = wallDuration(timed)

  return {
    turns,
    records: timed,
    stats: { durationMs, turnCount: numberedTurns.size, callCount }
  }
}

function classifyMessage(
  message: Message,
  currentTurn: number
): { newTurn: boolean; records: OpenRecord[] } | null {
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
): OpenRecord[] {
  const records: OpenRecord[] = []
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
): OpenRecord[] {
  const records: OpenRecord[] = []
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

function mergeToolResults(raw: OpenRecord[]): OpenRecord[] {
  const out: OpenRecord[] = []
  const byCall = new Map<string, OpenRecord>()
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
        if (record.startedAt > call.startedAt) call.endedAt = record.startedAt
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
): OpenRecord {
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

/** 只用事件自己的时长。没有 result 时间就为 0，不要把空闲算进上一条。 */
function assignOwnDurations(raw: OpenRecord[]): TrajRecord[] {
  let previous = 0
  return raw.map((record, index) => {
    const start = record.startedAt > 0 ? record.startedAt : previous
    previous = start
    const durationMs = record.endedAt != null && record.endedAt > start ? record.endedAt - start : 0
    const timed = {
      id: record.id,
      turn: record.turn,
      lane: record.lane,
      kind: record.kind,
      startedAt: start,
      preview: record.preview,
      detail: record.detail,
      index,
      durationMs,
      ...(record.toolName ? { toolName: record.toolName } : {}),
      ...(record.isError ? { isError: true } : {}),
      ...(record.callId ? { callId: record.callId } : {})
    }
    return { ...timed, searchHaystack: recordSearchHaystack(timed) }
  })
}

function wallDuration(records: TrajRecord[]): number {
  if (records.length === 0) return 0
  let min = records[0]?.startedAt ?? 0
  let max = min
  for (const record of records) {
    if (record.startedAt < min) min = record.startedAt
    const end = record.startedAt + record.durationMs
    if (end > max) max = end
  }
  return Math.max(0, max - min)
}

export function timelineMode(actualDuration: boolean, actualTime: boolean): TimelineMode {
  if (actualDuration) return actualTime ? 'actual' : 'duration'
  return actualTime ? 'time' : 'sequence'
}

export function deriveTrajectoryTimeline(records: TrajRecord[], mode: TimelineMode): TimelineModel {
  if (records.length === 0) return { start: 0, end: 1, spans: [] }
  if (mode === 'sequence') return sequenceTimeline(records)
  return timedTimeline(records, mode === 'duration' || mode === 'actual', mode === 'duration')
}

function sequenceTimeline(records: TrajRecord[]): TimelineModel {
  const spans = records.map((record, index) => ({
    record,
    start: index,
    end: index + 1
  }))
  return { start: 0, end: records.length, spans }
}

function timedTimeline(records: TrajRecord[], actualDuration: boolean, compressIdle: boolean): TimelineModel {
  const raw: TimelineSpan[] = records.map((record) => {
    const start = record.startedAt
    const own = actualDuration ? record.durationMs : 0
    const occupied = compressIdle ? Math.max(own, 1) : own
    return { record, start, end: start + occupied }
  })

  const removedIdleBySpan = new Map<TimelineSpan, number>()
  let removedIdle = 0
  let coveredUntil: number | null = null
  for (const span of [...raw].sort((left, right) => left.start - right.start || left.end - right.end)) {
    if (compressIdle && coveredUntil !== null && span.start > coveredUntil) {
      removedIdle += span.start - coveredUntil
    }
    removedIdleBySpan.set(span, removedIdle)
    coveredUntil = coveredUntil === null ? span.end : Math.max(coveredUntil, span.end)
  }

  const spans = raw.map((span) => {
    const offset = removedIdleBySpan.get(span) ?? 0
    return { record: span.record, start: span.start - offset, end: span.end - offset }
  })
  let start = spans[0]?.start ?? 0
  let end = spans[0]?.end ?? 1
  for (const span of spans) {
    if (span.start < start) start = span.start
    if (span.end > end) end = span.end
  }
  return { start, end: Math.max(end, start + 1), spans }
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

export function recordSearchHaystack(
  record: Pick<TrajRecord, 'kind' | 'preview' | 'detail' | 'toolName'>
): string {
  return `${KIND_LABEL[record.kind]} ${record.preview} ${record.toolName ?? ''} ${record.detail.slice(0, SEARCH_DETAIL_LIMIT)}`.toLowerCase()
}

export function recordSearchText(record: TrajRecord): string {
  return record.searchHaystack
}

export function laneTimelineSpans(model: TimelineModel, lane: TrajLane): TimelineSpan[] {
  const out: TimelineSpan[] = []
  for (const span of model.spans) {
    if (span.record.lane === lane) out.push(span)
  }
  out.sort((left, right) => left.start - right.start || left.end - right.end || left.record.index - right.record.index)
  return out
}

/**
 * 指针在轨道上的比例 → 该 lane 上时间最近的一条。
 * `spans` 须已按 start 升序（见 `laneTimelineSpans`）。重叠时优先覆盖 t 且时长更短的。
 */
export function hitTestLane(
  spans: readonly TimelineSpan[],
  domainStart: number,
  domainEnd: number,
  xRatio: number
): TrajRecord | undefined {
  if (spans.length === 0) return undefined
  const domain = domainEnd - domainStart
  const t =
    domain > 0 && Number.isFinite(domain) ? domainStart + clamp01(xRatio) * domain : (spans[0]?.start ?? 0)

  let lo = 0
  let hi = spans.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const span = spans[mid]
    if (span && span.start <= t) lo = mid + 1
    else hi = mid
  }

  let best: TimelineSpan | undefined
  let bestDist = Infinity
  let bestDuration = Infinity
  let bestIndex = -1

  const consider = (index: number): void => {
    const span = spans[index]
    if (!span) return
    const dist = distanceToSpan(span, t)
    const duration = Math.max(0, span.end - span.start)
    if (
      dist < bestDist ||
      (dist === bestDist && duration < bestDuration) ||
      (dist === bestDist && duration === bestDuration && index > bestIndex)
    ) {
      best = span
      bestDist = dist
      bestDuration = duration
      bestIndex = index
    }
  }

  const right = lo
  const left = lo - 1
  if (left >= 0) consider(left)
  if (right < spans.length) consider(right)
  for (let i = left - 1; i >= 0; i--) {
    const span = spans[i]
    if (!span) continue
    if (span.end >= t) consider(i)
  }

  return best?.record
}

function distanceToSpan(span: TimelineSpan, t: number): number {
  if (t < span.start) return span.start - t
  if (t > span.end) return t - span.end
  return 0
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}
