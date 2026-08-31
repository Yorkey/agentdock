import type { Conversation, Message, SourceFileRef } from '@chats/core'

export function isUnchanged(
  fingerprint: { mtimeMs: number; size: number } | undefined,
  ref: SourceFileRef
): boolean {
  return Boolean(
    fingerprint && fingerprint.mtimeMs === ref.mtimeMs && fingerprint.size === ref.size
  )
}

export const MESSAGE_BATCH_SIZE = 50

export interface DiscoveredFile {
  sourceId: string
  ref: SourceFileRef
}

export type ParentToWorker =
  | { type: 'start'; sourceIds: string[] }
  | {
      type: 'parse'
      files: DiscoveredFile[]
      total: number
      completed: number
    }
  | { type: 'ack' }
  | { type: 'abort' }

export type WorkerToParent =
  | { type: 'ready' }
  | { type: 'discovered'; files: DiscoveredFile[] }
  | { type: 'batch'; sourceId: string; path: string; messages: Message[] }
  | {
      type: 'file'
      sourceId: string
      ref: SourceFileRef
      conversation: Conversation
    }
  | { type: 'progress'; sourceId: string; path: string; done: number; total: number }
  | { type: 'file-error'; sourceId: string; path: string; error: string }
  | { type: 'done' }
  | { type: 'error'; error: string }

export function isParentMessage(value: unknown): value is ParentToWorker {
  if (value == null || typeof value !== 'object' || !('type' in value)) return false
  const type = (value as { type: unknown }).type
  return type === 'start' || type === 'parse' || type === 'ack' || type === 'abort'
}

export function isWorkerMessage(value: unknown): value is WorkerToParent {
  if (value == null || typeof value !== 'object' || !('type' in value)) return false
  const type = (value as { type: unknown }).type
  return (
    type === 'ready' ||
    type === 'discovered' ||
    type === 'batch' ||
    type === 'file' ||
    type === 'progress' ||
    type === 'file-error' ||
    type === 'done' ||
    type === 'error'
  )
}
