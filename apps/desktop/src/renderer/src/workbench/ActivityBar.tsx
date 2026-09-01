import type { ReactNode } from 'react'
import type { WorkbenchContribution, WorkbenchIcon } from '@agentdock/core'
import { THEME_LABEL, nextThemePref, type ThemePref } from '../lib/theme'
import { IS_MAC } from './platform'

const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl+'

export function ActivityBar({
  activities,
  activeId,
  theme,
  onSelect,
  onCycleTheme
}: {
  activities: WorkbenchContribution[]
  activeId: string
  theme: ThemePref
  onSelect: (id: string) => void
  onCycleTheme: () => void
}) {
  return (
    <nav className="activity-bar" aria-label="功能区">
      {activities.map((item, index) => {
        const active = item.id === activeId
        const shortcut = index < 9 ? `${MOD_LABEL}${index + 1}` : ''
        return (
          <button
            key={item.id}
            type="button"
            className={active ? 'activity-btn is-active' : 'activity-btn'}
            aria-label={item.title}
            aria-current={active ? 'page' : undefined}
            aria-keyshortcuts={shortcut ? `${IS_MAC ? 'Meta' : 'Control'}+${index + 1}` : undefined}
            title={shortcut ? `${item.title} · ${shortcut}` : item.title}
            onClick={() => onSelect(item.id)}
          >
            <ActivityIcon name={item.icon} />
          </button>
        )
      })}
      <div className="activity-spacer" />
      <button
        type="button"
        className="activity-btn"
        aria-label={`主题：${THEME_LABEL[theme]}，点击切换到${THEME_LABEL[nextThemePref(theme)]}`}
        title={`主题：${THEME_LABEL[theme]}`}
        onClick={onCycleTheme}
      >
        <ThemeIcon pref={theme} />
      </button>
    </nav>
  )
}

function ActivityIcon({ name }: { name: WorkbenchIcon | string }) {
  if (name === 'skills') {
    return (
      <ActivitySvg>
        <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
        <path d="m9 15 6-6" />
      </ActivitySvg>
    )
  }
  if (name === 'chats') {
    return (
      <ActivitySvg>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </ActivitySvg>
    )
  }
  return (
    <ActivitySvg>
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </ActivitySvg>
  )
}

function ActivitySvg({ children }: { children: ReactNode }) {
  return (
    <svg
      className="activity-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function ThemeIcon({ pref }: { pref: ThemePref }) {
  if (pref === 'light') {
    return (
      <svg className="activity-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" fill="currentColor" />
        <path
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"
        />
      </svg>
    )
  }
  if (pref === 'dark') {
    return (
      <svg className="activity-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
        />
      </svg>
    )
  }
  return (
    <svg className="activity-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path fill="currentColor" d="M12 4.4a7.6 7.6 0 0 1 0 15.2V4.4Z" />
    </svg>
  )
}
