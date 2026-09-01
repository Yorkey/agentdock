import { useEffect, useMemo, useState } from 'react'
import type { Message } from '@agentdock/core'
import { formatCount } from '../lib/format'
import { projectChanges, type FileChange } from '../lib/changes'
import { DiffView } from './DiffView'
import { FileActions } from './FileActions'
import { useTip } from './HoverTip'

export function ChangesView({ messages }: { messages: Message[] }) {
  const files = useMemo(() => projectChanges(messages), [messages])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const tip = useTip()
  const selected = files.find((file) => file.path === selectedPath) ?? files[0] ?? null

  useEffect(() => {
    if (files.length === 0) {
      setSelectedPath(null)
      return
    }
    setSelectedPath((current) =>
      current && files.some((file) => file.path === current) ? current : (files[0]?.path ?? null)
    )
  }, [files])

  if (files.length === 0) {
    return (
      <div className="empty-hero">
        <p className="empty-title">此会话没有文件改动</p>
        <p className="empty-copy">没有入库的 diff，也没有 Write / Edit 一类的编辑工具调用</p>
      </div>
    )
  }

  return (
    <div className="doc-split">
      <div className="doc-list" role="listbox" aria-label="文件改动">
        {files.map((file) => {
          const active = file.path === selected?.path
          return (
            <div key={file.path} className={active ? 'doc-item-row is-active' : 'doc-item-row'}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={active ? 'doc-item is-active' : 'doc-item'}
                onClick={() => setSelectedPath(file.path)}
              >
                <span className="doc-item-title" {...tip(file.path)}>
                  {file.fileName}
                </span>
                <span className="doc-item-meta">
                  <span className="doc-item-count">{formatCount(file.count)}</span>
                  <span className="badge">{file.origin === 'native' ? '原生' : '合成'}</span>
                  {file.intent ? <span className="badge">意图</span> : null}
                  {file.failed ? <span className="badge badge-danger">失败</span> : null}
                </span>
              </button>
              <FileActions path={file.path} className="is-overlay" />
            </div>
          )
        })}
      </div>
      <div className="doc-body">{selected ? <ChangeDetail file={selected} /> : null}</div>
    </div>
  )
}

function ChangeDetail({ file }: { file: FileChange }) {
  return (
    <div className="doc-changes">
      {file.entries.map((entry) => (
        <DiffView key={entry.id} path={entry.path} patch={entry.patch} />
      ))}
    </div>
  )
}
