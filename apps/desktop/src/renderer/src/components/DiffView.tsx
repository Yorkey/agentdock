import { memo, useEffect, useMemo, useState } from 'react'
import { parseDiffLines } from '../lib/diff'
import { formatCount } from '../lib/format'
import { FileActions } from './FileActions'
import { useTipFor } from './HoverTip'

const COLLAPSE_LINES = 400

export const DiffView = memo(function DiffView({ path, patch }: { path: string; patch: string }) {
  const lines = useMemo(() => parseDiffLines(patch), [patch])
  const [expanded, setExpanded] = useState(false)
  const tip = useTipFor(path)
  const overLimit = lines.length > COLLAPSE_LINES
  const visible = overLimit && !expanded ? lines.slice(0, COLLAPSE_LINES) : lines

  useEffect(() => {
    setExpanded(false)
  }, [patch])

  return (
    <div className="part-diff">
      <div className="part-tool-head">
        <span className="part-kicker">差异</span>
        <span className="part-tool-name" {...tip}>
          {path}
        </span>
        <FileActions path={path} />
      </div>
      <pre className="diff-block">
        {visible.map((line, index) => (
          <span key={index} className={`diff-line diff-${line.kind}`}>
            {line.text || ' '}
          </span>
        ))}
      </pre>
      {overLimit ? (
        <button
          type="button"
          className="diff-more"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '收起' : '展开全部'}
          {expanded ? null : <span className="diff-more-meta">{formatCount(lines.length)} 行</span>}
        </button>
      ) : null}
    </div>
  )
})
