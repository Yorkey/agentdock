import { useState } from 'react'
import type { AssistantWork, ThreadItem, ToolProbe, DialogueTool } from '../lib/dialogue'
import { firstTextLine, hasAssistantWork, summarizeProbe, summarizeWork, textsOf } from '../lib/dialogue'
import { formatDuration, prettyJson } from '../lib/format'
import { parseDiffLines } from '../lib/diff'
import { Collapsible } from './Collapsible'
import { MarkdownView } from './MarkdownView'

export function ChatExchange({ item, defaultOpen }: { item: ThreadItem; defaultOpen: boolean }) {
  if (item.kind === 'compact') {
    return <div className="chat-context">Context injection · 上下文压缩</div>
  }
  return <ExchangeCard item={item} defaultOpen={defaultOpen} />
}

function ExchangeCard({
  item,
  defaultOpen
}: {
  item: Extract<ThreadItem, { kind: 'exchange' }>
  defaultOpen: boolean
}) {
  return (
    <div className="chat-exchange">
      {item.user ? (
        <div className="chat-user">
          <div className="chat-bubble">
            {textsOf(item.user).map((text, index) => (
              <MarkdownView key={index} text={text} />
            ))}
          </div>
        </div>
      ) : null}
      {hasAssistantWork(item.work) ? (
        <WorkFold work={item.work} startedAt={item.startedAt} endedAt={item.endedAt} defaultOpen={defaultOpen} />
      ) : null}
      {item.work.reply.map((text, index) => (
        <div key={`reply-${index}`} className="chat-assistant">
          <MarkdownView text={text} />
        </div>
      ))}
    </div>
  )
}

function WorkFold({
  work,
  startedAt,
  endedAt,
  defaultOpen
}: {
  work: AssistantWork
  startedAt: number
  endedAt: number
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const duration = endedAt > startedAt ? formatDuration(endedAt - startedAt) : ''
  const title = duration ? `工作了 ${duration}` : '思考过程'
  const sub = summarizeWork(work)

  return (
    <details className="work" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="work-sum">
        <span className="work-title">{title}</span>
        {sub ? <span className="work-sub">{sub}</span> : null}
      </summary>
      <div className="work-body">
        {work.reasoning.map((text, index) => (
          <Collapsible
            key={`think-${index}`}
            title="思考"
            tone="muted"
            badge={<span className="think-snip">{firstTextLine(text)}</span>}
          >
            <pre className="block-pre">{text}</pre>
          </Collapsible>
        ))}
        {work.probes.map((probe) => (
          <ProbeBlock key={probe.id} probe={probe} />
        ))}
      </div>
    </details>
  )
}

function ProbeBlock({ probe }: { probe: ToolProbe }) {
  const headline = probe.title ? firstTextLine(probe.title) : summarizeProbe(probe.tools)
  const sub = probe.title ? summarizeProbe(probe.tools) : ''
  const failed = probe.tools.some((tool) => tool.isError)
  return (
    <details className="probe">
      <summary>
        <div className="probe-copy">
          <div className="probe-title">
            {headline}
            {failed ? <span className="badge badge-danger">失败</span> : null}
          </div>
          {sub ? <div className="probe-sub">{sub}</div> : null}
        </div>
      </summary>
      {probe.title && probe.title !== headline ? (
        <div className="probe-note">
          <MarkdownView text={probe.title} />
        </div>
      ) : null}
      <ToolTrail tools={probe.tools} />
    </details>
  )
}

function ToolTrail({ tools }: { tools: DialogueTool[] }) {
  return (
    <ul className="tool-trail" aria-label={`调用了 ${tools.length} 个工具`}>
      {tools.map((tool, index) => (
        <li key={tool.callId ?? `${tool.name}:${index}`}>
          <details className="tool-chip">
            <summary>
              <span className="tool-chip-name">{tool.name}</span>
              <span className="tool-chip-summary" title={tool.summary}>
                {tool.summary}
              </span>
              {tool.isError ? <span className="badge badge-danger">失败</span> : null}
            </summary>
            <div className="tool-chip-body">
              {tool.input !== undefined ? <pre className="block-pre">{prettyJson(tool.input)}</pre> : null}
              {tool.output ? <pre className="block-pre tool-output">{tool.output}</pre> : null}
              {tool.diffs.map((diff) => (
                <DiffBlock key={diff.path} path={diff.path} patch={diff.patch} />
              ))}
            </div>
          </details>
        </li>
      ))}
    </ul>
  )
}

function DiffBlock({ path, patch }: { path: string; patch: string }) {
  const lines = parseDiffLines(patch)
  return (
    <div className="part-diff">
      <div className="part-tool-head">
        <span className="part-kicker">差异</span>
        <span className="part-tool-name" title={path}>
          {path}
        </span>
      </div>
      <pre className="diff-block">
        {lines.map((line, index) => (
          <span key={index} className={`diff-line diff-${line.kind}`}>
            {line.text || ' '}
          </span>
        ))}
      </pre>
    </div>
  )
}
