import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatDuration } from '../lib/format'
import {
  KIND_LABEL,
  deriveTrajectoryTimeline,
  hitTestLane,
  laneTimelineSpans,
  projectTrajectory,
  timelineMode,
  type TimelineModel,
  type TimelineSpan,
  type TrajKind,
  type TrajLane,
  type TrajRecord,
  type TrajTurn
} from '../lib/trajectory'
import { looksLikeFsPath } from '../lib/local-path'
import { FileActions } from './FileActions'
import { useTipControl, useTipFor } from './HoverTip'
import type { Message } from '@agentdock/core'

const LANES: TrajLane[] = ['input', 'model', 'tools']
const LANE_LABEL: Record<TrajLane, string> = {
  input: '输入',
  model: '模型',
  tools: '工具'
}
const LEGEND_KINDS: TrajKind[] = ['system', 'user', 'context', 'assistant', 'tool']

export function TrajectoryView({ messages, resetKey }: { messages: Message[]; resetKey: string }) {
  const projection = useMemo(() => projectTrajectory(messages), [messages])
  const [actualDuration, setActualDuration] = useState(true)
  const [actualTime, setActualTime] = useState(false)
  const [collapsedTurns, setCollapsedTurns] = useState<Set<number | 'none'>>(new Set())
  const [hideCalls, setHideCalls] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filteredTurns = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return projection.turns
      .map((turn) => {
        const records = turn.records.filter((record) => {
          if (hideCalls && record.kind === 'tool') return false
          if (collapsedTurns.has(turn.turn ?? 'none') && record.kind !== 'user') return false
          if (q && !record.searchHaystack.includes(q)) return false
          return true
        })
        return { ...turn, records }
      })
      .filter((turn) => turn.records.length > 0)
  }, [projection.turns, deferredQuery, hideCalls, collapsedTurns])

  const rows = useMemo(() => flattenRows(filteredTurns), [filteredTurns])
  const visibleCount = useMemo(
    () => filteredTurns.reduce((sum, turn) => sum + turn.records.length, 0),
    [filteredTurns]
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    // 详情默认收起，一行只有徽标 + 两行内预览
    estimateSize: () => 36,
    overscan: 10,
    getItemKey: (index) => rows[index]?.key ?? index
  })

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
    setFocusId(null)
    setExpandedIds(new Set())
  }, [resetKey])

  useEffect(() => {
    if (!focusId) return
    const index = rows.findIndex((row) => row.kind === 'record' && row.record.id === focusId)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'center' })
  }, [focusId, rows, virtualizer])

  const allTurnsCollapsed =
    projection.stats.turnCount > 0 &&
    projection.turns.every((turn) => collapsedTurns.has(turn.turn ?? 'none'))

  const toggleAllTurns = () => {
    if (allTurnsCollapsed) setCollapsedTurns(new Set())
    else {
      setCollapsedTurns(new Set(projection.turns.map((turn) => turn.turn ?? 'none')))
    }
  }

  const selectRecord = useCallback((id: string) => {
    setFocusId(id)
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const trimmedQuery = deferredQuery.trim()

  return (
    <div className="traj">
      <div className="traj-toolbar">
        <span className="traj-stat">
          <span className="traj-stat-lab">时长</span>
          <span className="traj-stat-val">{formatDuration(projection.stats.durationMs)}</span>
        </span>
        <ScaleToggle actualDuration={actualDuration} onToggle={() => setActualDuration((value) => !value)} />
        <IdleToggle actualTime={actualTime} onToggle={() => setActualTime((value) => !value)} />
        <button
          type="button"
          className={allTurnsCollapsed ? 'traj-tool is-on' : 'traj-tool'}
          aria-label={allTurnsCollapsed ? '展开所有轮次' : '折叠所有轮次'}
          aria-pressed={allTurnsCollapsed}
          onClick={toggleAllTurns}
        >
          轮次
          <span className="traj-tool-meta">{projection.stats.turnCount}</span>
        </button>
        <button
          type="button"
          className={hideCalls ? 'traj-tool is-on' : 'traj-tool'}
          aria-label={hideCalls ? '显示工具调用' : '隐藏工具调用'}
          aria-pressed={hideCalls}
          onClick={() => setHideCalls((value) => !value)}
        >
          调用
          <span className="traj-tool-meta">{projection.stats.callCount}</span>
        </button>
        <div className="traj-search-wrap">
          <input
            ref={searchRef}
            type="search"
            className="traj-search"
            data-search-input
            placeholder="搜索轨迹"
            aria-label="搜索轨迹"
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.preventDefault()
                setQuery('')
              }
            }}
          />
          {trimmedQuery ? (
            <span className="traj-search-count" aria-live="polite">
              {visibleCount ? `${visibleCount} 条` : '无结果'}
            </span>
          ) : null}
          {query ? (
            <button
              type="button"
              className="traj-search-clear"
              aria-label="清除搜索"
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
      <Timeline
        records={projection.records}
        actualDuration={actualDuration}
        actualTime={actualTime}
        focusId={focusId}
        onFocus={setFocusId}
      />
      <div className="traj-list" ref={listRef}>
        <div className="virtual-inner" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => {
            const item = rows[row.index]
            if (!item) return null
            return (
              <div
                key={item.key}
                data-index={row.index}
                ref={virtualizer.measureElement}
                className="traj-virtual-row"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                {item.kind === 'head' ? (
                  <div className="traj-turn-lab">{item.turn == null ? '轮次之间' : `第 ${item.turn} 轮`}</div>
                ) : (
                  <LedgerRow
                    record={item.record}
                    focused={item.record.id === focusId}
                    expanded={expandedIds.has(item.record.id)}
                    query={trimmedQuery}
                    onSelect={selectRecord}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Timeline({
  records,
  actualDuration,
  actualTime,
  focusId,
  onFocus
}: {
  records: TrajRecord[]
  actualDuration: boolean
  actualTime: boolean
  focusId: string | null
  onFocus: (id: string) => void
}) {
  const model = useMemo(
    () => deriveTrajectoryTimeline(records, timelineMode(actualDuration, actualTime)),
    [records, actualDuration, actualTime]
  )

  const first = records[0]
  const last = records.at(-1)
  const startLabel = first ? clockLabel(first.startedAt) : ''
  const endLabel = last ? clockLabel(last.startedAt + last.durationMs) : ''

  return (
    <div className="traj-timeline" role="group" aria-label="时间线总览">
      <div className="traj-legend">
        {LEGEND_KINDS.map((kind) => (
          <span key={kind} className="traj-legend-item">
            <span className={`traj-legend-dot traj-span-${kind}`} aria-hidden="true" />
            {KIND_LABEL[kind]}
          </span>
        ))}
      </div>
      {LANES.map((lane) => (
        <Lane key={lane} lane={lane} model={model} focusId={focusId} onFocus={onFocus} />
      ))}
      {startLabel || endLabel ? (
        <div className="traj-ticks">
          <span className="traj-lane-lab" />
          <div className="traj-tick-row">
            <span>{startLabel}</span>
            <span>{endLabel}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const ROLE_VAR: Record<TrajKind, string> = {
  system: '--role-system',
  user: '--role-user',
  context: '--role-context',
  assistant: '--role-assistant',
  tool: '--role-tool'
}

const MIN_BAND_PX = 2
const BAND_TOP = 1
const BAND_HEIGHT = 12
const BAND_RADIUS = 3

function spanTipText(record: TrajRecord): string {
  const duration = record.durationMs > 0 ? ` · ${formatDuration(record.durationMs)}` : ''
  return `${KIND_LABEL[record.kind]} · ${record.preview}${duration}`
}

/**
 * 一条泳道 = 一个 Tab 停靠点。色带画在 canvas 上，不再为每条记录建 button。
 */
function Lane({
  lane,
  model,
  focusId,
  onFocus
}: {
  lane: TrajLane
  model: TimelineModel
  focusId: string | null
  onFocus: (id: string) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitIdRef = useRef<string | null>(null)
  const tip = useTipControl()
  const [activeIndex, setActiveIndex] = useState(0)
  const spans = useMemo(() => laneTimelineSpans(model, lane), [model, lane])

  const selected = spans.findIndex((span) => span.record.id === focusId)
  const tabStop = spans.length === 0 ? 0 : selected >= 0 ? selected : Math.min(activeIndex, spans.length - 1)
  const current = spans[tabStop]?.record

  useEffect(() => {
    const canvas = canvasRef.current
    const track = trackRef.current
    if (!canvas || !track) return

    const paint = (): void => {
      paintLaneCanvas(canvas, track, spans, model.start, model.end, focusId)
    }
    paint()
    const ro = new ResizeObserver(paint)
    ro.observe(track)
    const mo = new MutationObserver(paint)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', paint)
    return () => {
      ro.disconnect()
      mo.disconnect()
      mq.removeEventListener('change', paint)
    }
  }, [spans, model.start, model.end, focusId])

  const hitFromClientX = (clientX: number): TrajRecord | undefined => {
    const track = trackRef.current
    if (!track || spans.length === 0) return undefined
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return undefined
    return hitTestLane(spans, model.start, model.end, (clientX - rect.left) / rect.width)
  }

  const spanRect = (record: TrajRecord): { left: number; width: number; top: number; bottom: number } | null => {
    const track = trackRef.current
    const span = spans.find((item) => item.record.id === record.id)
    if (!track || !span) return null
    const rect = track.getBoundingClientRect()
    const domain = Math.max(1, model.end - model.start)
    const left = rect.left + ((span.start - model.start) / domain) * rect.width
    const width = Math.max(((span.end - span.start) / domain) * rect.width, MIN_BAND_PX)
    return { left, width, top: rect.top, bottom: rect.bottom }
  }

  const showTipFor = (record: TrajRecord): void => {
    const rect = spanRect(record)
    if (rect) tip.show(spanTipText(record), rect)
  }

  const selectAt = (index: number): void => {
    if (spans.length === 0) return
    const clamped = Math.min(Math.max(index, 0), spans.length - 1)
    const span = spans[clamped]
    if (!span) return
    setActiveIndex(clamped)
    onFocus(span.record.id)
    showTipFor(span.record)
    trackRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (delta !== 0) {
      event.preventDefault()
      selectAt(tabStop + delta)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      selectAt(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      selectAt(spans.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const span = spans[tabStop]
      if (span) onFocus(span.record.id)
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const record = hitFromClientX(event.clientX)
    if (!record) {
      hitIdRef.current = null
      tip.hide()
      return
    }
    if (hitIdRef.current === record.id) return
    hitIdRef.current = record.id
    showTipFor(record)
  }

  const onPointerLeave = (): void => {
    hitIdRef.current = null
    tip.hide()
  }

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const record = hitFromClientX(event.clientX)
    if (!record) return
    const index = spans.findIndex((span) => span.record.id === record.id)
    setActiveIndex(index >= 0 ? index : 0)
    onFocus(record.id)
  }

  const label = current
    ? `${LANE_LABEL[lane]}轨道，当前 ${KIND_LABEL[current.kind]} · ${current.preview}，左右方向键浏览`
    : `${LANE_LABEL[lane]}轨道，左右方向键浏览`

  return (
    <div className="traj-lane">
      <span className="traj-lane-lab">{LANE_LABEL[lane]}</span>
      <div
        ref={trackRef}
        className="traj-lane-track"
        role="toolbar"
        tabIndex={spans.length > 0 ? 0 : -1}
        aria-orientation="horizontal"
        aria-label={label}
        aria-current={current && current.id === focusId ? 'true' : undefined}
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      >
        <canvas ref={canvasRef} className="traj-lane-canvas" aria-hidden="true" />
      </div>
    </div>
  )
}

function paintLaneCanvas(
  canvas: HTMLCanvasElement,
  track: HTMLElement,
  spans: TimelineSpan[],
  domainStart: number,
  domainEnd: number,
  focusId: string | null
): void {
  const cssW = track.clientWidth
  const cssH = track.clientHeight
  if (cssW <= 0 || cssH <= 0) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(cssW * dpr))
  canvas.height = Math.max(1, Math.round(cssH * dpr))
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)

  const styles = getComputedStyle(track)
  const colors: Record<TrajKind, string> = {
    system: styles.getPropertyValue(ROLE_VAR.system).trim(),
    user: styles.getPropertyValue(ROLE_VAR.user).trim(),
    context: styles.getPropertyValue(ROLE_VAR.context).trim(),
    assistant: styles.getPropertyValue(ROLE_VAR.assistant).trim(),
    tool: styles.getPropertyValue(ROLE_VAR.tool).trim()
  }
  const focusRing = styles.getPropertyValue('--timeline-focus-ring').trim()
  const domain = Math.max(1, domainEnd - domainStart)

  for (const span of spans) {
    const x = ((span.start - domainStart) / domain) * cssW
    const w = ((span.end - span.start) / domain) * cssW
    ctx.fillStyle = colors[span.record.kind] || colors.context
    if (w < MIN_BAND_PX) {
      ctx.fillRect(Math.round(x), BAND_TOP, 1, BAND_HEIGHT)
    } else {
      fillRoundRect(ctx, x, BAND_TOP, w, BAND_HEIGHT, BAND_RADIUS)
    }
  }

  if (!focusId) return
  const focused = spans.find((span) => span.record.id === focusId)
  if (!focused || !focusRing) return
  const x = ((focused.start - domainStart) / domain) * cssW
  const w = Math.max(((focused.end - focused.start) / domain) * cssW, MIN_BAND_PX)
  ctx.strokeStyle = focusRing
  ctx.lineWidth = 2
  strokeRoundRect(ctx, x, 0.5, w, cssH - 1, BAND_RADIUS)
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.fill()
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.stroke()
}

function ScaleToggle({ actualDuration, onToggle }: { actualDuration: boolean; onToggle: () => void }) {
  const tip = useTipFor('色块按事件自身时长绘制，还是每条等宽')
  return (
    <button
      type="button"
      className={actualDuration ? 'traj-tool is-on' : 'traj-tool'}
      aria-label={actualDuration ? '比例：按时长，切换为等长' : '比例：按等长，切换为按时长'}
      aria-pressed={actualDuration}
      onClick={onToggle}
      {...tip}
    >
      比例
      <span className="traj-tool-meta">{actualDuration ? '按时长' : '等长'}</span>
    </button>
  )
}

function IdleToggle({ actualTime, onToggle }: { actualTime: boolean; onToggle: () => void }) {
  const tip = useTipFor('保留事件之间的空闲，还是从时间线上压掉')
  return (
    <button
      type="button"
      className={actualTime ? 'traj-tool is-on' : 'traj-tool'}
      aria-label={actualTime ? '实时：保留空闲，切换为压缩空闲' : '实时：压缩空闲，切换为保留空闲'}
      aria-pressed={actualTime}
      onClick={onToggle}
      {...tip}
    >
      实时
      <span className="traj-tool-meta">{actualTime ? '保留' : '压缩'}</span>
    </button>
  )
}

function LedgerRow({
  record,
  focused,
  expanded,
  query,
  onSelect
}: {
  record: TrajRecord
  focused: boolean
  expanded: boolean
  query: string
  onSelect: (id: string) => void
}) {
  const detail = record.detail && record.detail !== record.preview ? record.detail : ''
  const filePath = record.toolName === 'diff' || looksLikeFsPath(record.preview) ? record.preview : ''
  return (
    <div
      className={`traj-rec is-${record.kind}${focused ? ' is-focus' : ''}${record.isError ? ' is-error' : ''}`}
      data-record={record.id}
    >
      <div className="traj-rec-row">
        <button
          type="button"
          className="traj-rec-head"
          aria-expanded={detail ? expanded : undefined}
          onClick={() => onSelect(record.id)}
        >
          <span className={`traj-badge traj-badge-${record.kind}`}>{KIND_LABEL[record.kind]}</span>
          <span className="traj-preview">{highlight(record.preview, query)}</span>
          {detail ? (
            <span className="traj-caret" aria-hidden="true">
              {expanded ? '▾' : '▸'}
            </span>
          ) : null}
        </button>
        {filePath ? <FileActions path={filePath} className="is-overlay" /> : null}
      </div>
      {detail && expanded ? <pre className="traj-detail">{highlight(detail, query)}</pre> : null}
    </div>
  )
}

/** 把命中的片段包成 <mark>，query 已是 trim 过的原始大小写 */
function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const needle = query.toLowerCase()
  const haystack = text.toLowerCase()
  const out: ReactNode[] = []
  let cursor = 0
  let key = 0
  while (cursor < text.length) {
    const at = haystack.indexOf(needle, cursor)
    if (at < 0) break
    if (at > cursor) out.push(text.slice(cursor, at))
    out.push(
      <mark key={key++} className="traj-hit">
        {text.slice(at, at + needle.length)}
      </mark>
    )
    cursor = at + needle.length
  }
  if (out.length === 0) return text
  if (cursor < text.length) out.push(text.slice(cursor))
  return out
}

/** 只有拿到真实时间戳才画刻度，projectTrajectory 在缺时间时会退化成下标 */
function clockLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 946684800000) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(ms))
}

type FlatRow = { kind: 'head'; key: string; turn: number | null } | { kind: 'record'; key: string; record: TrajRecord }

function flattenRows(turns: TrajTurn[]): FlatRow[] {
  const rows: FlatRow[] = []
  turns.forEach((turn, index) => {
    rows.push({ kind: 'head', key: `head:${index}:${turn.turn ?? 'x'}`, turn: turn.turn })
    for (const record of turn.records) {
      rows.push({ kind: 'record', key: record.id, record })
    }
  })
  return rows
}
