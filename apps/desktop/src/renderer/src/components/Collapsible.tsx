import { useState, type ReactNode } from 'react'

interface CollapsibleProps {
  title: string
  defaultOpen?: boolean
  badge?: ReactNode
  tone?: 'default' | 'danger' | 'muted'
  children: ReactNode
}

export function Collapsible({
  title,
  defaultOpen = false,
  badge,
  tone = 'default',
  children
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details
      className={`collapse collapse-${tone}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="collapse-summary" aria-expanded={open}>
        <span className="collapse-title">{title}</span>
        {badge}
      </summary>
      <div className="collapse-body">{children}</div>
    </details>
  )
}
