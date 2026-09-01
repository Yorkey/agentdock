import { useState } from 'react'
import type { AssistantWork, DialogueTurn, ThreadItem, ToolProbe, DialogueTool } from '../lib/dialogue'
import { firstTextLine, hasAssistantWork, summarizeProbe, summarizeWork } from '../lib/dialogue'
import { formatDuration, prettyJson } from '../lib/format'
import { pathFromToolInput } from '../lib/local-path'
import { Collapsible } from './Collapsible'
import { CopyableMarkdown } from './CopyableMarkdown'
import { DiffView } from './DiffView'
import { FileActions } from './FileActions'
import { useTip } from './HoverTip'
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
      {item.user ? <UserTurn turn={item.user} /> : null}
      {hasAssistantWork(item.work) ? (
        <WorkFold work={item.work} startedAt={item.startedAt} endedAt={item.endedAt} defaultOpen={defaultOpen} />
      ) : null}
      {item.work.reply.map((text, index) => (
        <div key={`reply-${index}`} className="chat-assistant">
          <CopyableMarkdown text={text} />
        </div>
      ))}
    </div>
  )
}

type UserSegment =
  | { kind: 'bubble'; texts: string[] }
  | { kind: 'inject'; text: string; label: string }

/** 连续的真实输入合成一个气泡，注入类各自成行，保持原始先后顺序 */
function userSegments(turn: DialogueTurn): UserSegment[] {
  const out: UserSegment[] = []
  for (const block of turn.blocks) {
    if (block.kind === 'text') {
      const last = out.at(-1)
      if (last?.kind === 'bubble') last.texts.push(block.text)
      else out.push({ kind: 'bubble', texts: [block.text] })
    } else if (block.kind === 'injected') {
      out.push({ kind: 'inject', text: block.text, label: block.label })
    }
  }
  return out
}

function UserTurn({ turn }: { turn: DialogueTurn }) {
  return (
    <>
      {userSegments(turn).map((segment, index) =>
        segment.kind === 'bubble' ? (
          <div key={`bubble-${index}`} className="chat-user">
            <div className="chat-bubble">
              {segment.texts.map((text, textIndex) => (
                <MarkdownView key={textIndex} text={text} />
              ))}
            </div>
          </div>
        ) : (
          <InjectionRow key={`inject-${index}`} text={segment.text} label={segment.label} />
        )
      )}
    </>
  )
}

function InjectionRow({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="inject" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="inject-sum" aria-expanded={open}>
        <span className="inject-kicker">系统注入</span>
        {label ? <span className="inject-label">{label}</span> : null}
        <span className="inject-snip">{firstTextLine(text)}</span>
      </summary>
      <pre className="block-pre inject-body">{text}</pre>
    </details>
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
      <summary className="work-sum" aria-expanded={open}>
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
  const [open, setOpen] = useState(false)
  const headline = probe.title ? firstTextLine(probe.title) : summarizeProbe(probe.tools)
  const sub = probe.title ? summarizeProbe(probe.tools) : ''
  const failed = probe.tools.some((tool) => tool.isError)
  return (
    <details className="probe" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary aria-expanded={open}>
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
  const tip = useTip()
  return (
    <ul className="tool-trail" aria-label={`调用了 ${tools.length} 个工具`}>
      {tools.map((tool, index) => {
        const filePath = pathFromToolInput(tool.input)
        return (
          <li key={tool.callId ?? `${tool.name}:${index}`}>
          <details className="tool-chip">
            <summary>
              <span className="tool-chip-name">{tool.name}</span>
              <span className="tool-chip-summary" {...tip(tool.summary)}>
                {tool.summary}
              </span>
              {tool.isError ? <span className="badge badge-danger">失败</span> : null}
              {filePath ? <FileActions path={filePath} /> : null}
            </summary>
            <div className="tool-chip-body">
              {tool.input !== undefined ? <pre className="block-pre">{prettyJson(tool.input)}</pre> : null}
              {tool.output ? <pre className="block-pre tool-output">{tool.output}</pre> : null}
              {tool.diffs.map((diff) => (
                <DiffView key={diff.path} path={diff.path} patch={diff.patch} />
              ))}
            </div>
          </details>
        </li>
        )
      })}
    </ul>
  )
}
