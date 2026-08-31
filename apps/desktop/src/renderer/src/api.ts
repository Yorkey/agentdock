import type { Conversation, Message, WorkbenchContribution } from '@chats/core'
import type { DesktopApi, ListConversationsArgs } from '@chats/plugin-bridge/ipc'
import type { ScanDone, ScanProgress, SourceInfo } from '@chats/plugin-registry/types'

export type { Conversation, Message, ScanDone, ScanProgress, SourceInfo, WorkbenchContribution }

export function getApi(): DesktopApi {
  const api = window.api
  if (api == null) {
    throw new Error('window.api 不可用（需要 Electron preload）')
  }
  return api
}

function bindScanListener<T>(
  method: ((listener: (payload: T) => void) => unknown) | undefined,
  listener: (payload: T) => void
): (() => void) | undefined {
  if (typeof method !== 'function') return undefined
  const result = method(listener)
  return typeof result === 'function' ? () => void result() : undefined
}

/** 订阅 `chats:scan:progress` / `chats:scan:done`。 */
export function subscribeScanEvents(handlers: {
  onProgress?: (payload: ScanProgress) => void
  onDone?: (payload: ScanDone) => void
}): () => void {
  const api = getApi()
  const offs: Array<() => void> = []
  if (handlers.onProgress) {
    const off = bindScanListener(api.onScanProgress, handlers.onProgress)
    if (off) offs.push(off)
  }
  if (handlers.onDone) {
    const off = bindScanListener(api.onScanDone, handlers.onDone)
    if (off) offs.push(off)
  }
  return () => {
    for (const off of offs) off()
  }
}

export function listSources(): Promise<SourceInfo[]> {
  return getApi().listSources()
}

export function listConversations(filter?: ListConversationsArgs): Promise<Conversation[]> {
  return getApi().listConversations(filter)
}

export function searchConversations(query: string): Promise<Conversation[]> {
  return getApi().search(query)
}

export function getMessages(conversationId: string): Promise<Message[]> {
  return getApi().getMessages(conversationId)
}

export function startScan(): Promise<ScanDone> {
  return getApi().startScan()
}

export function listActivities(): Promise<WorkbenchContribution[]> {
  return getApi().listActivities()
}
