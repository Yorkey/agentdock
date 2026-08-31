import type { Part } from '@chats/core'
import { parseDiffLines } from '../lib/diff'
import { prettyJson } from '../lib/format'
import { Collapsible } from './Collapsible'

export function PartView({ part }: { part: Part }) {
  switch (part.kind) {
    case 'text':
      return <div className="part-text">{part.text}</div>
    case 'reasoning':
      return (
        <Collapsible title="推理" tone="muted">
          <pre className="block-pre">{part.text}</pre>
        </Collapsible>
      )
    case 'tool_call':
      return (
        <div className="part-tool-call">
          <div className="part-tool-head">
            <span className="part-kicker">工具调用</span>
            <span className="part-tool-name">{part.name}</span>
            {part.callId ? <span className="part-meta">{part.callId}</span> : null}
          </div>
          <pre className="block-pre">{prettyJson(part.input)}</pre>
        </div>
      )
    case 'tool_result':
      return (
        <Collapsible
          title="工具结果"
          tone={part.isError ? 'danger' : 'default'}
          badge={
            <>
              {part.isError ? <span className="badge badge-danger">失败</span> : null}
              {part.callId ? <span className="part-meta">{part.callId}</span> : null}
            </>
          }
        >
          <pre className="block-pre">{part.output}</pre>
        </Collapsible>
      )
    case 'diff':
      return <DiffPart path={part.path} patch={part.patch} />
    case 'attachment':
      return (
        <div className="part-attachment">
          <span className="part-kicker">附件</span>
          <code className="part-meta">{part.resourceId}</code>
        </div>
      )
    default: {
      const unexpected = part as { kind: string }
      return (
        <div className="part-unknown">
          <span className="part-kicker">未知片段</span>
          <span className="part-meta">{unexpected.kind}</span>
        </div>
      )
    }
  }
}

function DiffPart({ path, patch }: { path: string; patch: string }) {
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
