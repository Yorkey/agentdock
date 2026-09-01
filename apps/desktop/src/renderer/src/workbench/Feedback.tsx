/** 模块通用的异步状态：列表骨架屏、内容区骨架屏、带重试的错误条。 */

function rowKeys(rows: number): number[] {
  return Array.from({ length: rows }, (_, index) => index)
}

/** 侧栏列表加载态，行宽由 CSS 的 nth-child 决定。 */
export function SidebarSkeleton({ rows = 7, label = '正在加载会话' }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton-list" role="status" aria-live="polite" aria-label={label}>
      {rowKeys(rows).map((key) => (
        <div className="skeleton-row" key={key}>
          <span className="skeleton-bar" />
        </div>
      ))}
    </div>
  )
}

/** 内容区加载态：一条标题占位 + 若干段落占位。 */
export function PaneSkeleton({ rows = 4, label = '正在加载' }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton-pane" role="status" aria-live="polite" aria-label={label}>
      <span className="skeleton-bar is-title" />
      {rowKeys(rows).map((key) => (
        <span className="skeleton-bar is-para" key={key} />
      ))}
    </div>
  )
}

export function PaneError({
  message,
  onRetry,
  retryLabel = '重试'
}: {
  message: string
  onRetry: () => void
  retryLabel?: string
}) {
  return (
    <div className="pane-status is-error" role="alert">
      <span className="pane-status-text">{message}</span>
      <button type="button" className="btn-inline" onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  )
}
