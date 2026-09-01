import type { Message } from '@agentdock/core'

/** 切回最近打开过的会话时跳过 getMessages IPC */
export const MESSAGE_CACHE_CAPACITY = 4

const cache = new Map<string, Message[]>()

export function readCachedMessages(conversationId: string): Message[] | undefined {
  const rows = cache.get(conversationId)
  if (!rows) return undefined
  cache.delete(conversationId)
  cache.set(conversationId, rows)
  return rows
}

export function writeCachedMessages(conversationId: string, rows: Message[]): void {
  if (cache.has(conversationId)) cache.delete(conversationId)
  cache.set(conversationId, rows)
  while (cache.size > MESSAGE_CACHE_CAPACITY) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}
