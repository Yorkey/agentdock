import type { SourceFileRef } from '@agentdock/core'

export function isUnchanged(
  fingerprint: { mtimeMs: number; size: number } | undefined,
  ref: SourceFileRef
): boolean {
  return Boolean(
    fingerprint && fingerprint.mtimeMs === ref.mtimeMs && fingerprint.size === ref.size
  )
}

export interface DiscoveredFile {
  sourceId: string
  ref: SourceFileRef
}

export type ParentToWorker =
  | { type: 'start'; sourceIds: string[]; storePath: string }
  | {
      type: 'parse'
      files: DiscoveredFile[]
      total: number
      completed: number
    }
  | { type: 'abort' }

export type WorkerToParent =
  | { type: 'ready' }
  | { type: 'discovered'; files: DiscoveredFile[] }
  | { type: 'file'; sourceId: string; path: string }
  | { type: 'progress'; sourceId: string; path: string; done: number; total: number }
  | { type: 'file-error'; sourceId: string; path: string; error: string }
  | { type: 'done' }
  | { type: 'error'; error: string }

export function isParentMessage(value: unknown): value is ParentToWorker {
  if (value == null || typeof value !== 'object' || !('type' in value)) return false
  const type = (value as { type: unknown }).type
  return type === 'start' || type === 'parse' || type === 'abort'
}

export function isWorkerMessage(value: unknown): value is WorkerToParent {
  if (value == null || typeof value !== 'object' || !('type' in value)) return false
  const type = (value as { type: unknown }).type
  return (
    type === 'ready' ||
    type === 'discovered' ||
    type === 'file' ||
    type === 'progress' ||
    type === 'file-error' ||
    type === 'done' ||
    type === 'error'
  )
}
