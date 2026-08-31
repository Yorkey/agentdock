import { useEffect, useMemo, useState } from 'react'
import type { Conversation, Message } from '@chats/core'
import { getMessages } from '../api'
import { errorMessage, workspaceLabel } from '../lib/format'
import { loadViewMode, projectDialogue, saveViewMode, type ViewMode } from '../lib/dialogue'
import { ChatView } from './ChatView'
import { TrajectoryView } from './TrajectoryView'

interface SessionPaneProps {
  conversation: Conversation | null
  sourceLabel: string
}

export function SessionPane({ conversation, sourceLabel }: SessionPaneProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>(loadViewMode)

  const conversationId = conversation?.id ?? null
  const dialogue = useMemo(() => projectDialogue(messages), [messages])

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setMessages([])
    void getMessages(conversationId)
      .then((rows) => {
        if (!cancelled) setMessages(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMessages([])
          setError(errorMessage(err))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId])

  const selectView = (next: ViewMode) => {
    setView(next)
    saveViewMode(next)
  }

  if (!conversation) {
    return (
      <section className="session-pane">
        <div className="empty-hero">
          <p className="empty-title">选择一条会话</p>
          <p className="empty-copy">从左侧工作区打开 Cursor、Claude Code 或 Codex 的历史对话。</p>
        </div>
      </section>
    )
  }

  return (
    <section className="session-pane">
      <header className="session-head">
        <div className="session-head-top">
          <h1 className="session-title" title={conversation.title}>
            {conversation.title || '未命名会话'}
          </h1>
          <div className="session-mode" title={conversation.models.join(' · ')}>
            {sourceLabel}
            {conversation.models[0] ? ` · ${conversation.models[0]}` : ''}
          </div>
          <button
            type="button"
            className="session-log"
            title={conversation.sourcePath}
            onClick={() => void navigator.clipboard?.writeText(conversation.sourcePath)}
          >
            Session log
          </button>
        </div>
        <nav className="session-tabs" aria-label="视图">
          <button
            type="button"
            className={view === 'chat' ? 'session-tab is-active' : 'session-tab'}
            onClick={() => selectView('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            className={view === 'trajectory' ? 'session-tab is-active' : 'session-tab'}
            onClick={() => selectView('trajectory')}
          >
            Trajectory
          </button>
        </nav>
        <p className="session-sub">
          <span title={conversation.workspace}>{workspaceLabel(conversation.workspace)}</span>
          {conversation.gitBranch ? <span>{conversation.gitBranch}</span> : null}
        </p>
      </header>
      {loading ? <div className="pane-status">正在加载消息…</div> : null}
      {error ? <div className="pane-status is-error">{error}</div> : null}
      {!loading && !error && messages.length === 0 ? (
        <div className="empty-inline">此会话没有消息</div>
      ) : view === 'chat' ? (
        <ChatView key={`${conversation.id}:chat`} items={dialogue} />
      ) : (
        <TrajectoryView key={`${conversation.id}:traj`} messages={messages} resetKey={conversation.id} />
      )}
    </section>
  )
}
