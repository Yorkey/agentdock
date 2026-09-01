import { useMemo, useState } from 'react'
import { SessionPane } from '../../components/SessionPane'
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar'
import { useIndexedChats } from '../../hooks/useIndexedChats'
import { formatCount } from '../../lib/format'
import { buildSourceTree, sourceLabelOf } from '../../lib/tree'
import { PaneError, PaneSkeleton } from '../../workbench/Feedback'
import type { ModuleProps } from '../../workbench/types'

export function ChatsModule({ hidden }: ModuleProps) {
  const { sources, conversations, loading, error, scanning, progress, startScan, retry } =
    useIndexedChats()
  const [activeId, setActiveId] = useState<string | null>(null)

  const tree = useMemo(() => buildSourceTree(sources, conversations), [sources, conversations])
  const active = useMemo(
    () => conversations.find((row) => row.id === activeId) ?? null,
    [conversations, activeId]
  )

  const scanLabel = scanning
    ? progress
      ? progress.total > 0
        ? `扫描中 ${formatCount(progress.done)} / ${formatCount(progress.total)}`
        : `扫描中 ${formatCount(progress.done)}`
      : '扫描中…'
    : '扫描会话'
  const scanRatio =
    scanning && progress && progress.total > 0
      ? Math.min(1, progress.done / progress.total)
      : null

  const booting = loading && conversations.length === 0

  return (
    <div className={`module-root${hidden ? ' is-hidden' : ''}`} aria-hidden={hidden}>
      {error ? <PaneError message={error} onRetry={() => void retry()} /> : null}
      <div className="module-body">
        <WorkspaceSidebar
          tree={tree}
          conversations={conversations}
          selectedId={activeId}
          loading={loading}
          scanning={scanning}
          scanLabel={scanLabel}
          scanRatio={scanRatio}
          onSelect={setActiveId}
          onScan={() => void startScan()}
        />
        {booting ? (
          <section className="session-pane">
            <PaneSkeleton label="正在读取索引" rows={5} />
          </section>
        ) : (
          <SessionPane
            conversation={active}
            sourceLabel={active ? sourceLabelOf(sources, active.sourceId) : ''}
          />
        )}
      </div>
    </div>
  )
}
