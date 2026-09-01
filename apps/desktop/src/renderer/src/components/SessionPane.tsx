import { useEffect, useMemo, useRef, useState } from 'react'
import type { Conversation, Message } from '@agentdock/core'
import { getMessages } from '../api'
import { errorMessage, workspaceLabel } from '../lib/format'
import { loadViewMode, projectDialogue, saveViewMode, type ViewMode } from '../lib/dialogue'
import { readCachedMessages, writeCachedMessages } from '../lib/message-cache'
import { PaneError, PaneSkeleton } from '../workbench/Feedback'
import { ChatView } from './ChatView'
import { ChangesView } from './ChangesView'
import { FileActions, FileWorkspaceProvider } from './FileActions'
import { FilePreviewProvider } from './FilePreview'
import { useTip } from './HoverTip'
import { PlanView } from './PlanView'
import { TrajectoryView } from './TrajectoryView'

interface SessionPaneProps {
  conversation: Conversation | null
  sourceLabel: string
}

const TABS: { id: ViewMode; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'trajectory', label: 'Trajectory' },
  { id: 'plan', label: 'Plan' },
  { id: 'changes', label: 'Changes' }
]

export function SessionPane({ conversation, sourceLabel }: SessionPaneProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>(loadViewMode)
  const [reloadKey, setReloadKey] = useState(0)
  const skipCacheRef = useRef<string | null>(null)
  const tip = useTip()
  const conversationId = conversation?.id ?? null
  const dialogue = useMemo(
    () => (view === 'chat' ? projectDialogue(messages) : []),
    [view, messages]
  )

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setError(null)
      setLoading(false)
      return
    }
    const skipCache = skipCacheRef.current === conversationId
    skipCacheRef.current = null
    if (!skipCache) {
      const cached = readCachedMessages(conversationId)
      if (cached) {
        setMessages(cached)
        setError(null)
        setLoading(false)
        return
      }
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setMessages([])
    void getMessages(conversationId)
      .then((rows) => {
        writeCachedMessages(conversationId, rows)
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
  }, [conversationId, reloadKey])

  const selectView = (next: ViewMode) => {
    setView(next)
    saveViewMode(next)
  }

  if (!conversation) {
    return (
      <section className="session-pane">
        <div className="empty-hero">
          <p className="empty-title">选择一条会话</p>
          <p className="empty-copy">从左侧工作区打开 Cursor、Claude Code 或 Codex 的历史对话</p>
        </div>
      </section>
    )
  }

  return (
    <FileWorkspaceProvider workspace={conversation.workspace}>
      <section className="session-pane">
      <header className="session-head">
        <div className="session-head-top">
          <h1 className="session-title" {...tip(conversation.title)}>
            {conversation.title || '未命名会话'}
          </h1>
          <div className="session-mode" {...tip(conversation.models.join(' · '))}>
            {sourceLabel}
            {conversation.models[0] ? ` · ${conversation.models[0]}` : ''}
          </div>
          <span className="session-file">
            <span className="session-file-lab">Session log</span>
            <FileActions path={conversation.sourcePath} />
          </span>
        </div>
        <nav className="session-tabs" aria-label="视图">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={view === tab.id ? 'session-tab is-active' : 'session-tab'}
              aria-current={view === tab.id ? 'true' : undefined}
              onClick={() => selectView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <p className="session-sub">
          <span className="session-file-lab" {...tip(conversation.workspace ?? '')}>
            {workspaceLabel(conversation.workspace)}
          </span>
          {conversation.gitBranch ? (
            <span className="session-branch" {...tip(conversation.gitBranch)}>
              {conversation.gitBranch}
            </span>
          ) : null}
        </p>
      </header>
      <div className="session-body">
        <FilePreviewProvider key={conversation.id}>
          {loading ? (
            <PaneSkeleton label="正在加载消息" />
          ) : error ? (
            <PaneError
              message={error}
              onRetry={() => {
                skipCacheRef.current = conversationId
                setReloadKey((key) => key + 1)
              }}
            />
          ) : messages.length === 0 ? (
            <div className="empty-hero">
              <p className="empty-title">此会话没有消息</p>
              <p className="empty-copy">源文件里没有可展示的记录，可能是一条刚创建就中断的会话</p>
            </div>
          ) : view === 'chat' ? (
            <ChatView key={`${conversation.id}:chat`} items={dialogue} />
          ) : view === 'trajectory' ? (
            <TrajectoryView key={`${conversation.id}:traj`} messages={messages} resetKey={conversation.id} />
          ) : view === 'plan' ? (
            <PlanView key={`${conversation.id}:plan`} messages={messages} conversationId={conversation.id} />
          ) : (
            <ChangesView key={`${conversation.id}:changes`} messages={messages} />
          )}
        </FilePreviewProvider>
      </div>
    </section>
    </FileWorkspaceProvider>
  )
}
