import type { WorkbenchContribution } from '@chats/core'

const ACTIVITY_KEY = 'chats.activityId'

export const FALLBACK_ACTIVITIES: WorkbenchContribution[] = [
  { id: 'chats', title: '对话', icon: 'chats', order: 0 },
  { id: 'skills', title: 'Skills', icon: 'skills', order: 10 }
]

export function loadActivityId(): string {
  try {
    const value = localStorage.getItem(ACTIVITY_KEY)
    if (value) return value
  } catch {
    // ignore
  }
  return 'chats'
}

export function saveActivityId(id: string): void {
  try {
    localStorage.setItem(ACTIVITY_KEY, id)
  } catch {
    // ignore
  }
}
