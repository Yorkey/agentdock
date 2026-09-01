import { useEffect, useMemo, useState } from 'react'
import type { Message } from '@agentdock/core'
import { readPlanFile } from '../api'
import { errorMessage } from '../lib/format'
import {
  parsePlanMarkdown,
  PLAN_SOURCE_LABEL,
  projectPlans,
  TODO_STATUS_LABEL,
  type PlanDoc,
  type PlanTodo
} from '../lib/plans'
import { PaneError, PaneSkeleton } from '../workbench/Feedback'
import { FileActions } from './FileActions'
import { useTip } from './HoverTip'
import { MarkdownView } from './MarkdownView'

export function PlanView({ messages, conversationId }: { messages: Message[]; conversationId: string }) {
  const plans = useMemo(() => projectPlans(messages), [messages])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [diskById, setDiskById] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const tip = useTip()

  const selected = plans.find((plan) => plan.id === selectedId) ?? plans[0] ?? null
  const cached = selected ? diskById[selected.id] : undefined

  useEffect(() => {
    if (plans.length === 0) {
      setSelectedId(null)
      return
    }
    setSelectedId((current) => (current && plans.some((plan) => plan.id === current) ? current : (plans[0]?.id ?? null)))
  }, [plans])

  useEffect(() => {
    if (!selected?.path || cached !== undefined) {
      setLoading(false)
      if (cached !== undefined) setLoadError(null)
      return
    }
    const id = selected.id
    const fallback = selected.body
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void readPlanFile(conversationId, selected.path)
      .then((text) => {
        if (cancelled) return
        setDiskById((current) => ({ ...current, [id]: text }))
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (!fallback.trim()) setLoadError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId, selected?.id, selected?.path, selected?.body, cached, retryTick])

  if (plans.length === 0) {
    return (
      <div className="empty-hero">
        <p className="empty-title">此会话没有计划文档</p>
        <p className="empty-copy">没有 CreatePlan、ExitPlanMode 或可识别的磁盘计划路径</p>
      </div>
    )
  }

  const display = selected ? displayPlan(selected, diskById[selected.id]) : null

  return (
    <div className="doc-split">
      <div className="doc-list" role="listbox" aria-label="计划文档">
        {plans.map((plan) => {
          const active = plan.id === selected?.id
          return (
            <div key={plan.id} className={active ? 'doc-item-row is-active' : 'doc-item-row'}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={active ? 'doc-item is-active' : 'doc-item'}
                onClick={() => setSelectedId(plan.id)}
              >
                <span className="doc-item-title">{plan.title}</span>
                <span className="doc-item-meta">
                  <span className="badge">{PLAN_SOURCE_LABEL[plan.source]}</span>
                  {plan.overview ? (
                    <span className="doc-item-sub" {...tip(plan.overview)}>
                      {plan.overview}
                    </span>
                  ) : null}
                </span>
              </button>
              {plan.path ? <FileActions path={plan.path} className="is-overlay" /> : null}
            </div>
          )
        })}
      </div>
      <div className="doc-body">
        {loadError && !display?.body ? (
          <PaneError
            message={loadError}
            onRetry={() => {
              if (!selected) return
              setLoadError(null)
              setRetryTick((tick) => tick + 1)
            }}
          />
        ) : loading && !display?.body ? (
          <PaneSkeleton label="正在读取计划" />
        ) : display ? (
          <PlanBody plan={display} />
        ) : null}
      </div>
    </div>
  )
}

function PlanBody({ plan }: { plan: PlanDoc }) {
  return (
    <>
      {plan.path ? (
        <div className="doc-filebar">
          <span className="doc-filebar-path">{plan.path}</span>
          <FileActions path={plan.path} />
        </div>
      ) : null}
      {plan.todos.length > 0 ? <TodoList todos={plan.todos} /> : null}
      {plan.body.trim() ? <MarkdownView text={plan.body} /> : <p className="empty-copy">这份计划没有正文</p>}
    </>
  )
}

function TodoList({ todos }: { todos: PlanTodo[] }) {
  return (
    <ul className="doc-todos" aria-label="待办">
      {todos.map((todo, index) => (
        <li key={todo.id ?? `${todo.content}:${index}`} className="doc-todo">
          <span className="badge">{todoStatusLabel(todo.status)}</span>
          <span>{todo.content}</span>
        </li>
      ))}
    </ul>
  )
}

function displayPlan(plan: PlanDoc, diskText: string | undefined): PlanDoc {
  if (!diskText) return plan
  const parsed = parsePlanMarkdown(diskText)
  return {
    ...plan,
    title: parsed.name || plan.title,
    overview: parsed.overview || plan.overview,
    body: parsed.body.trim() ? parsed.body : plan.body,
    todos: parsed.todos.length > 0 ? parsed.todos : plan.todos,
    source: 'disk'
  }
}

function todoStatusLabel(status: string | undefined): string {
  if (!status) return '待办'
  return TODO_STATUS_LABEL[status] ?? status
}
