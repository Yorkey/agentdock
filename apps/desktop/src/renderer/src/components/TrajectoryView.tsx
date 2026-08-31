import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatDuration } from '../lib/format'
import {
  KIND_LABEL,
  projectTrajectory,
  recordSearchText,
  type TrajLane,
  type TrajRecord,
  type TrajTurn
} from '../lib/trajectory'
import type { Message } from '@chats/core'

const LANES: TrajLane[] = ['input', 'model', 'tools']
const LANE_LABEL: Record<TrajLane, string> = {
  input: 'Input',
  model: 'Model',
  tools: 'Tools'
}

export function TrajectoryView({ messages, resetKey }: { messages: Message[]; resetKey: string }) {
  const projection = useMemo(() => projectTrajectory(messages), [messages])
  const [actualDuration, setActualDuration] = useState(true)
  const [collapsedTurns, setCollapsedTurns] = useState<Set<number | 'none'>>(new Set())
  const [hideCalls, setHideCalls] = useState(false)
  const [query, setQuery] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filteredTurns = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projection.turns
      .map((turn) => {
        const records = turn.records.filter((record) => {
          if (hideCalls && record.kind === 'tool') return false
          if (collapsedTurns.has(turn.turn ?? 'none') && record.kind !== 'user') return false
          if (q && !recordSearchText(record).includes(q)) return false
          return true
        })
        return { ...turn, records }
      })
      .filter((turn) => turn.records.length > 0)
  }, [projection.turns, query, hideCalls, collapsedTurns])

  const rows = useMemo(() => flattenRows(filteredTurns), [filteredTurns])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 52,
    overscan: 10,
    getItemKey: (index) => rows[index]?.key ?? index
  })

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
    setFocusId(null)
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

  return (
    <div className="traj">
      <div className="traj-toolbar">
        <button
          type="button"
          className={actualDuration ? 'traj-tool is-on' : 'traj-tool'}
          onClick={() => setActualDuration((value) => !value)}
          title="按真实时长绘制时间线"
        >
          Duration
          <span className="traj-tool-meta">{formatDuration(projection.stats.durationMs)}</span>
        </button>
        <button
          type="button"
          className={allTurnsCollapsed ? 'traj-tool is-on' : 'traj-tool'}
          onClick={toggleAllTurns}
        >
          Turns
          <span className="traj-tool-meta">{projection.stats.turnCount}</span>
        </button>
        <button
          type="button"
          className={hideCalls ? 'traj-tool is-on' : 'traj-tool'}
          onClick={() => setHideCalls((value) => !value)}
        >
          Calls
          <span className="traj-tool-meta">{projection.stats.callCount}</span>
        </button>
        <input
          type="search"
          className="traj-search"
          placeholder="Search"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <Timeline
        records={projection.records}
        actualDuration={actualDuration}
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
                  <div className="traj-turn-lab">{item.turn == null ? 'Between turns' : `Turn ${item.turn}`}</div>
                ) : (
                  <LedgerRow record={item.record} focused={item.record.id === focusId} onSelect={setFocusId} />
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
  focusId,
  onFocus
}: {
  records: TrajRecord[]
  actualDuration: boolean
  focusId: string | null
  onFocus: (id: string) => void
}) {
  const total = Math.max(
    1,
    actualDuration ? records.reduce((sum, record) => sum + Math.max(record.durationMs, 1), 0) : records.length
  )
  let cursor = 0
  const placed = records.map((record, index) => {
    const size = actualDuration ? Math.max(record.durationMs, 1) : 1
    const start = cursor
    cursor += size
    return { record, left: (start / total) * 100, width: (size / total) * 100, index }
  })

  return (
    <div className="traj-timeline" aria-label="时间线总览">
      {LANES.map((lane) => (
        <div key={lane} className="traj-lane">
          <span className="traj-lane-lab">{LANE_LABEL[lane]}</span>
          <div className="traj-lane-track">
            {placed
              .filter((item) => item.record.lane === lane)
              .map((item) => (
                <button
                  key={item.record.id}
                  type="button"
                  className={`traj-span traj-span-${item.record.kind}${item.record.id === focusId ? ' is-focus' : ''}`}
                  style={{ left: `${item.left}%`, width: `${Math.max(item.width, 0.4)}%` }}
                  title={`${KIND_LABEL[item.record.kind]} · ${item.record.preview}`}
                  onClick={() => onFocus(item.record.id)}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function LedgerRow({
  record,
  focused,
  onSelect
}: {
  record: TrajRecord
  focused: boolean
  onSelect: (id: string) => void
}) {
  const detail = record.detail && record.detail !== record.preview ? record.detail : ''
  return (
    <div
      className={`traj-rec is-${record.kind}${focused ? ' is-focus' : ''}${record.isError ? ' is-error' : ''}`}
      data-record={record.id}
      onClick={() => onSelect(record.id)}
    >
      <div className="traj-rec-head">
        <span className={`traj-badge traj-badge-${record.kind}`}>{KIND_LABEL[record.kind]}</span>
        <span className="traj-preview" title={record.preview}>
          {record.preview}
        </span>
      </div>
      {detail ? <pre className="traj-detail">{detail}</pre> : null}
    </div>
  )
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
