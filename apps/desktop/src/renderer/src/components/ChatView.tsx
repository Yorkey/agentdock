import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { projectExchanges, type DialogueItem } from '../lib/dialogue'
import { ChatExchange } from './ChatTurn'

export function ChatView({ items }: { items: DialogueItem[] }) {
  const thread = useMemo(() => projectExchanges(items), [items])
  const parentRef = useRef<HTMLDivElement>(null)
  const lastId = thread.at(-1)?.id
  const virtualizer = useVirtualizer({
    count: thread.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220,
    overscan: 6,
    paddingStart: 16,
    paddingEnd: 32,
    getItemKey: (index) => thread[index]?.id ?? index
  })

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 })
  }, [items])

  if (thread.length === 0) {
    return (
      <div className="empty-hero">
        <p className="empty-title">没有可还原的对话</p>
        <p className="empty-copy">这条会话只剩系统与工具记录，可切换到 Trajectory 查看完整轨迹</p>
      </div>
    )
  }

  return (
    <div className="chat-scroll" ref={parentRef}>
      <div className="virtual-inner chat-inner" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = thread[row.index]
          if (!item) return null
          return (
            <div
              key={item.id}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="chat-row"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <ChatExchange item={item} defaultOpen={item.id === lastId} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
