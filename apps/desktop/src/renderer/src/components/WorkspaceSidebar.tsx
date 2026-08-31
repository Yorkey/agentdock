import { useMemo, useState } from 'react'
import type { Conversation } from '@chats/core'
import { formatCount, formatRelativeTime } from '../lib/format'
import type { SourceNode } from '../lib/tree'

interface WorkspaceSidebarProps {
  tree: SourceNode[]
  conversations: Conversation[]
  selectedId: string | null
  scanning: boolean
  scanLabel: string
  onSelect: (id: string) => void
  onScan: () => void
}

export function WorkspaceSidebar({
  tree,
  conversations,
  selectedId,
  scanning,
  scanLabel,
  onSelect,
  onScan
}: WorkspaceSidebarProps) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return null
    return conversations.filter((row) => row.title.toLowerCase().includes(trimmed))
  }, [conversations, query])

  return (
    <aside className="sidebar" aria-label="工作区">
      <div className="sidebar-brand">
        <div className="brand-mark">对话归集</div>
      </div>
      <button type="button" className="btn-session" disabled={scanning} onClick={onScan}>
        {scanning ? scanLabel : '扫描会话'}
      </button>
      <div className="sidebar-section-head">
        <span>Workspaces</span>
        <input
          type="search"
          className="sidebar-search"
          placeholder="搜索"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="sidebar-scroll">
        {filtered ? (
          filtered.length === 0 ? (
            <div className="empty-inline">未找到会话</div>
          ) : (
            filtered.map((row) => (
              <SessionRow key={row.id} conversation={row} active={row.id === selectedId} onSelect={onSelect} />
            ))
          )
        ) : (
          tree.map((source) => {
            const sourceKey = `s:${source.id}`
            const sourceCollapsed = collapsed.has(sourceKey)
            return (
              <div key={source.id} className="ws-source">
                <button
                  type="button"
                  className="ws-folder"
                  onClick={() => setCollapsed((prev) => toggle(prev, sourceKey))}
                >
                  <span className="ws-twist">{sourceCollapsed ? '▸' : '▾'}</span>
                  <span className="dot" data-source={source.id} />
                  <span className="ws-label">{source.label}</span>
                  <span className="ws-count">{formatCount(source.count)}</span>
                </button>
                {sourceCollapsed
                  ? null
                  : source.workspaces.map((workspace) => {
                      const wsKey = `w:${source.id}:${workspace.workspace}`
                      const wsCollapsed = collapsed.has(wsKey)
                      return (
                        <div key={wsKey}>
                          <button
                            type="button"
                            className="ws-folder ws-folder-nested"
                            title={workspace.workspace || workspace.label}
                            onClick={() => setCollapsed((prev) => toggle(prev, wsKey))}
                          >
                            <span className="ws-twist">{wsCollapsed ? '▸' : '▾'}</span>
                            <span className="ws-label">{workspace.label}</span>
                            <span className="ws-count">{formatCount(workspace.count)}</span>
                          </button>
                          {wsCollapsed
                            ? null
                            : workspace.conversations.map((row) => (
                                <SessionRow
                                  key={row.id}
                                  conversation={row}
                                  active={row.id === selectedId}
                                  nested
                                  onSelect={onSelect}
                                />
                              ))}
                        </div>
                      )
                    })}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}

function SessionRow({
  conversation,
  active,
  nested,
  onSelect
}: {
  conversation: Conversation
  active: boolean
  nested?: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      className={`ws-session${active ? ' is-active' : ''}${nested ? ' is-nested' : ''}`}
      onClick={() => onSelect(conversation.id)}
    >
      <span className="ws-session-title" title={conversation.title}>
        {conversation.title || '未命名会话'}
      </span>
      <span className="ws-session-time">{formatRelativeTime(conversation.updatedAt)}</span>
    </button>
  )
}

function toggle(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}
