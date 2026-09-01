import type { Message } from '@agentdock/core'
import {
  MESSAGE_CACHE_CAPACITY,
  readCachedMessages,
  writeCachedMessages
} from '../src/renderer/src/lib/message-cache.ts'

function rows(id: string): Message[] {
  return [{ id, conversationId: id, seq: 0, role: 'user', createdAt: 1, parts: [] }]
}

writeCachedMessages('a', rows('a'))
writeCachedMessages('b', rows('b'))
writeCachedMessages('c', rows('c'))
writeCachedMessages('d', rows('d'))
if (readCachedMessages('a')?.[0]?.id !== 'a') throw new Error('cache hit a')

writeCachedMessages('e', rows('e'))
if (readCachedMessages('b')) throw new Error('b should be evicted after touching a')
if (!readCachedMessages('a')) throw new Error('a was touched and should remain')
if (!readCachedMessages('e')) throw new Error('e should be cached')
if (MESSAGE_CACHE_CAPACITY !== 4) throw new Error('capacity')

console.log('ok: message cache LRU')
