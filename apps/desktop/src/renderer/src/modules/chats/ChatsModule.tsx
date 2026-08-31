import { useMemo, useState } from 'react'
import { SessionPane } from '../../components/SessionPane'
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar'
import { useIndexedChats } from '../../hooks/useIndexedChats'
import { formatCount } from '../../lib/format'
import { buildSourceTree, sourceLabelOf } from '../../lib/tree'
import type { ModuleProps } from '../../workbench/types'

export function ChatsModule({ hidden }: ModuleProps) {
  const { sources, conversations, loading, error, scanning, progress, startScan } = useIndexedChats()
  const [activeId, setActiveId] = useState<string | null>(null)

  const tree = useMemo(() => buildSourceTree(sources, conversations), [sources, conversations])
  const active = useMemo(
    () => conversations.find((row) => row.id === activeId) ?? null,
    [conversations, activeId]
  )

  const scanLabel = scanning
    ? progress
      ? `扫描中 ${formatCount(progress.processed)}`
      : '扫描中…'
    : '扫描会话'

  return (
    <div className={`module-root${hidden ? ' is-hidden' : ''}`} aria-hidden={hidden}>
      {error ? <div className="app-banner">{error}</div> : null}
      <div className="module-body">
        <WorkspaceSidebar
          tree={tree}
          conversations={conversations}
          selectedId={activeId}
          scanning={scanning}
          scanLabel={scanLabel}
          onSelect={setActiveId}
          onScan={() => void startScan()}
        />
        <SessionPane conversation={active} sourceLabel={active ? sourceLabelOf(sources, active.sourceId) : ''} />
      </div>
      {loading ? <div className="boot-mask">正在读取索引…</div> : null}
    </div>
  )
}
