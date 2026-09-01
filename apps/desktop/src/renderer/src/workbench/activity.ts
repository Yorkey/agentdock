import type { WorkbenchContribution } from '@agentdock/core'

const ACTIVITY_KEY = 'agentdock.activityId'
const LEGACY_ACTIVITY_KEY = 'chats.activityId'

export const FALLBACK_ACTIVITIES: WorkbenchContribution[] = [
  { id: 'chats', title: '对话', icon: 'chats', order: 0 },
  { id: 'skills', title: 'Skills', icon: 'skills', order: 10 }
]

function migrateLegacyKey(nextKey: string, legacyKey: string): void {
  try {
    const legacy = localStorage.getItem(legacyKey)
    if (legacy && !localStorage.getItem(nextKey)) {
      localStorage.setItem(nextKey, legacy)
      localStorage.removeItem(legacyKey)
    }
  } catch {
    // ignore
  }
}

export function loadActivityId(): string {
  migrateLegacyKey(ACTIVITY_KEY, LEGACY_ACTIVITY_KEY)
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
