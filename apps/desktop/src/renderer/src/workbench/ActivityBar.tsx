import type { WorkbenchContribution, WorkbenchIcon } from '@chats/core'

export function ActivityBar({
  activities,
  activeId,
  onSelect
}: {
  activities: WorkbenchContribution[]
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <nav className="activity-bar" aria-label="功能区">
      {activities.map((item) => {
        const active = item.id === activeId
        return (
          <button
            key={item.id}
            type="button"
            className={active ? 'activity-btn is-active' : 'activity-btn'}
            aria-label={item.title}
            aria-current={active ? 'page' : undefined}
            title={item.title}
            onClick={() => onSelect(item.id)}
          >
            <ActivityIcon name={item.icon} />
          </button>
        )
      })}
    </nav>
  )
}

function ActivityIcon({ name }: { name: WorkbenchIcon | string }) {
  if (name === 'skills') {
    return (
      <svg className="activity-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 3.2 13.7 8h5.1l-4.1 3 1.6 4.8L12 13.7 7.7 15.8 9.3 11 5.2 8h5.1L12 3.2Z"
        />
      </svg>
    )
  }
  if (name === 'chats') {
    return (
      <svg className="activity-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M4.5 5.5h15A1.5 1.5 0 0 1 21 7v8.5a1.5 1.5 0 0 1-1.5 1.5H9.2L5 20.2V17H4.5A1.5 1.5 0 0 1 3 15.5V7A1.5 1.5 0 0 1 4.5 5.5Z"
        />
      </svg>
    )
  }
  return (
    <svg className="activity-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
    </svg>
  )
}
