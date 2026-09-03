import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Conversation } from '@agentdock/core'
import { searchConversations } from '../api'
import { errorMessage, formatConversationCite, formatRelativeTime } from '../lib/format'
import { stickySourcePin } from '../lib/sticky-source'
import {
  flattenSearchRows,
  flattenSidebarRows,
  sourceLabelOf,
  type SidebarRow,
  type SourceNode,
  type WorkspaceNode
} from '../lib/tree'
import { SidebarSkeleton } from '../workbench/Feedback'
import { copyText } from './CopyButton'
import { FileActions } from './FileActions'
import { useTip } from './HoverTip'

const SEARCH_DEBOUNCE_MS = 200
const SESSION_ROW_H = 32
const FOLDER_ROW_H = 32
const COPY_RESET_MS = 1500

type SearchView =
  | { kind: 'off' }
  | { kind: 'pending'; hits: Conversation[] | null }
  | { kind: 'ready'; hits: Conversation[] }
  | { kind: 'error'; message: string }

interface WorkspaceSidebarProps {
  tree: SourceNode[]
  conversations: Conversation[]
  selectedId: string | null
  loading: boolean
  scanning: boolean
  scanLabel: string
  /** 扫描进度 0..1，未知总量时为 null（进度条走不确定态）。 */
  scanRatio: number | null
  onSelect: (id: string) => void
  onScan: () => void
}

export function WorkspaceSidebar({
  tree,
  conversations,
  selectedId,
  loading,
  scanning,
  scanLabel,
  scanRatio,
  onSelect,
  onScan
}: WorkspaceSidebarProps) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [search, setSearch] = useState<SearchView>({ kind: 'off' })
  const parentRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const trimmedQuery = query.trim()

  useEffect(() => {
    if (!trimmedQuery) {
      setSearch((prev) => (prev.kind === 'off' ? prev : { kind: 'off' }))
      return
    }
    setSearch((prev) => ({
      kind: 'pending',
      hits: prev.kind === 'ready' || prev.kind === 'pending' ? prev.hits : null
    }))
    let cancelled = false
    const timer = window.setTimeout(() => {
      void searchConversations(trimmedQuery)
        .then((hits) => {
          if (!cancelled) setSearch({ kind: 'ready', hits })
        })
        .catch((err: unknown) => {
          if (!cancelled) setSearch({ kind: 'error', message: errorMessage(err) })
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [trimmedQuery])

  const searching = search.kind !== 'off'
  const searchHits = search.kind === 'ready' || search.kind === 'pending' ? search.hits : null
  const rows = useMemo((): SidebarRow[] => {
    if (!searching) return flattenSidebarRows(tree, collapsed)
    return flattenSearchRows(searchHits ?? [])
  }, [searching, searchHits, tree, collapsed])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.kind === 'session' ? SESSION_ROW_H : FOLDER_ROW_H),
    overscan: 10,
    getItemKey: (index) => rows[index]?.key ?? index
  })

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [trimmedQuery])

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const showSkeleton =
    (loading && conversations.length === 0 && !searching) ||
    (search.kind === 'pending' && (search.hits == null || search.hits.length === 0))
  const emptyText = showSkeleton
    ? null
    : search.kind === 'error'
      ? search.message
      : search.kind === 'ready' && search.hits.length === 0
        ? '未找到会话'
        : !searching && tree.length === 0
          ? '还没有索引，先扫描一次'
          : null

  let pin: { source: SourceNode; key: string; translateY: number } | null = null
  if (!searching && !showSkeleton && !emptyText) {
    const sourceIndexes: number[] = []
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]?.kind === 'source') sourceIndexes.push(i)
    }
    const offsets = sourceIndexes.map(
      (index) => virtualizer.getOffsetForIndex(index, 'start')?.[0] ?? index * FOLDER_ROW_H
    )
    const state = stickySourcePin(offsets, scrollTop, FOLDER_ROW_H)
    const rowIndex = state ? sourceIndexes[state.sourceIndex] : undefined
    const item = rowIndex != null ? rows[rowIndex] : undefined
    if (state && item?.kind === 'source') {
      pin = { source: item.source, key: item.key, translateY: state.translateY }
    }
  }

  return (
    <aside className="sidebar" aria-label="工作区">
      <div className="sidebar-toolbar">
        <div className="search-field">
          <svg className="search-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              d="M10.6 10.6 14 14M11.8 7.2a4.6 4.6 0 1 1-9.2 0 4.6 4.6 0 0 1 9.2 0Z"
            />
          </svg>
          <input
            type="search"
            className="sidebar-search"
            data-search-input
            placeholder="搜索会话"
            aria-label="搜索会话"
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
          {query ? (
            <button
              type="button"
              className="search-clear"
              aria-label="清除搜索"
              onClick={() => setQuery('')}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  d="M4.8 4.8l6.4 6.4M11.2 4.8l-6.4 6.4"
                />
              </svg>
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="扫描会话"
          title={scanLabel}
          aria-busy={scanning}
          disabled={scanning}
          onClick={onScan}
        >
          <svg className="icon-16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              d="M13.4 8a5.4 5.4 0 1 1-1.8-4.02M13.6 2.2v2.9h-2.9"
            />
          </svg>
        </button>
      </div>

      {scanning ? (
        <div className="scan-progress" role="status" aria-live="polite">
          <span className="scan-progress-text">{scanLabel}</span>
          <span
            className={scanRatio == null ? 'scan-track is-indeterminate' : 'scan-track'}
            aria-hidden="true"
          >
            <span
              className="scan-fill"
              style={scanRatio == null ? undefined : { width: `${Math.round(scanRatio * 100)}%` }}
            />
          </span>
        </div>
      ) : null}

      <div className="sidebar-section-head">
        <span>{searching ? '搜索结果' : 'Workspaces'}</span>
      </div>

      <div className="sidebar-scroll-host">
        <div
          className="sidebar-scroll"
          ref={parentRef}
          aria-busy={search.kind === 'pending' || undefined}
        >
          {showSkeleton ? (
            <SidebarSkeleton />
          ) : emptyText ? (
            <div className="empty-inline">{emptyText}</div>
          ) : (
            <div className="virtual-inner" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((row) => {
                const item = rows[row.index]
                if (!item) return null
                return (
                  <div
                    key={item.key}
                    data-index={row.index}
                    ref={virtualizer.measureElement}
                    className="sidebar-virtual-row"
                    style={{ transform: `translateY(${row.start}px)` }}
                  >
                    <SidebarItem
                      item={item}
                      sources={tree}
                      selectedId={selectedId}
                      collapsed={collapsed}
                      onToggle={(key) => setCollapsed((prev) => toggle(prev, key))}
                      onSelect={onSelect}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {pin ? (
          <div
            className="sidebar-source-pin"
            style={{ transform: `translateY(${pin.translateY}px)` }}
            onWheel={(event) => {
              parentRef.current?.scrollBy({ top: event.deltaY })
            }}
          >
            <SourceRow
              source={pin.source}
              rowKey={pin.key}
              collapsed={collapsed.has(pin.key)}
              onToggle={(key) => setCollapsed((prev) => toggle(prev, key))}
            />
          </div>
        ) : null}
      </div>
    </aside>
  )
}

function SidebarItem({
  item,
  sources,
  selectedId,
  collapsed,
  onToggle,
  onSelect
}: {
  item: SidebarRow
  sources: SourceNode[]
  selectedId: string | null
  collapsed: ReadonlySet<string>
  onToggle: (key: string) => void
  onSelect: (id: string) => void
}) {
  switch (item.kind) {
    case 'source':
      return (
        <SourceRow
          source={item.source}
          rowKey={item.key}
          collapsed={collapsed.has(item.key)}
          onToggle={onToggle}
        />
      )
    case 'workspace':
      return (
        <WorkspaceRow
          workspace={item.workspace}
          rowKey={item.key}
          collapsed={collapsed.has(item.key)}
          onToggle={onToggle}
        />
      )
    case 'session':
      return (
        <SessionRow
          conversation={item.conversation}
          sourceLabel={sourceLabelOf(sources, item.conversation.sourceId)}
          active={item.conversation.id === selectedId}
          nested={item.nested}
          onSelect={onSelect}
        />
      )
    default: {
      const _exhaustive: never = item
      return _exhaustive
    }
  }
}

function SourceRow({
  source,
  rowKey,
  collapsed,
  onToggle
}: {
  source: SourceNode
  rowKey: string
  collapsed: boolean
  onToggle: (key: string) => void
}) {
  return (
    <button
      type="button"
      className="ws-folder"
      data-source={source.id}
      aria-expanded={!collapsed}
      onClick={() => onToggle(rowKey)}
    >
      <span className="ws-twist" aria-hidden="true">
        <FolderGlyph open={!collapsed} />
      </span>
      <span className="ws-label">{source.label}</span>
    </button>
  )
}

function WorkspaceRow({
  workspace,
  rowKey,
  collapsed,
  onToggle
}: {
  workspace: WorkspaceNode
  rowKey: string
  collapsed: boolean
  onToggle: (key: string) => void
}) {
  const tip = useTip()
  return (
    <div className="ws-folder-row">
      <button
        type="button"
        className="ws-folder ws-folder-nested"
        aria-expanded={!collapsed}
        {...tip(workspace.workspace || workspace.label)}
        onClick={() => onToggle(rowKey)}
      >
        <span className="ws-twist" aria-hidden="true">
          <FolderGlyph open={!collapsed} />
        </span>
        <span className="ws-label">{workspace.label}</span>
      </button>
      {workspace.workspace ? (
        <FileActions path={workspace.workspace} className="is-overlay" />
      ) : null}
    </div>
  )
}

function SessionRow({
  conversation,
  sourceLabel,
  active,
  nested,
  onSelect
}: {
  conversation: Conversation
  sourceLabel: string
  active: boolean
  nested?: boolean
  onSelect: (id: string) => void
}) {
  const tip = useTip()
  return (
    <div className={`ws-session-row${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className={`ws-session${active ? ' is-active' : ''}${nested ? ' is-nested' : ''}`}
        aria-current={active ? 'true' : undefined}
        onClick={() => onSelect(conversation.id)}
      >
        <span className="ws-session-title" {...tip(conversation.title)}>
          {conversation.title || '未命名会话'}
        </span>
        <span className="ws-session-time">{formatRelativeTime(conversation.updatedAt)}</span>
      </button>
      <SessionCite conversation={conversation} sourceLabel={sourceLabel} />
    </div>
  )
}

function SessionCite({
  conversation,
  sourceLabel
}: {
  conversation: Conversation
  sourceLabel: string
}) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'fail'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const copyTitle = copyState === 'done' ? '已复制' : copyState === 'fail' ? '复制失败' : '复制引用'
  return (
    <span className="file-actions is-overlay" onClick={stop} onPointerDown={stop}>
      <button
        type="button"
        className="icon-btn"
        data-state={copyState}
        aria-label={copyTitle}
        title={copyTitle}
        onClick={() => {
          void copyText(formatConversationCite(conversation, sourceLabel)).then((ok) => {
            if (timer.current) clearTimeout(timer.current)
            setCopyState(ok ? 'done' : 'fail')
            timer.current = setTimeout(() => setCopyState('idle'), COPY_RESET_MS)
          })
        }}
      >
        {copyState === 'idle' ? <CiteIcon /> : <CheckIcon />}
      </button>
    </span>
  )
}

function stop(event: { stopPropagation: () => void }): void {
  event.stopPropagation()
}

function CiteIcon() {
  return (
    <svg className="icon-16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        d="M2.5 4.5h5v5.2H5.2C4 12 3 13 2.5 14.2V4.5Zm6 0h5v5.2h-2.3C10 12 9 13 8.5 14.2V4.5Z"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="icon-16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function toggle(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function FolderGlyph({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" width="16" height="16">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        d="M2.5 4.5h4l1.15 1.4H13.5v7.6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V4.5Z"
      />
    </svg>
  )
}
