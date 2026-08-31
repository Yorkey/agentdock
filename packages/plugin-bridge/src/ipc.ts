import type { Conversation, Message, WorkbenchContribution } from '@chats/core'
import type { ScanDone, ScanProgress, SourceInfo } from '@chats/plugin-registry/types'

export const IPC = {
  listConversations: 'chats:conversations:list',
  getMessages: 'chats:conversations:messages',
  search: 'chats:search',
  listSources: 'chats:sources:list',
  startScan: 'chats:scan:start',
  scanProgress: 'chats:scan:progress',
  scanDone: 'chats:scan:done',
  listActivities: 'chats:workbench:list'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface ListConversationsArgs {
  sourceId?: string
}

export interface DesktopApi {
  listConversations: (options?: ListConversationsArgs) => Promise<Conversation[]>
  getMessages: (conversationId: string) => Promise<Message[]>
  search: (query: string) => Promise<Conversation[]>
  listSources: () => Promise<SourceInfo[]>
  startScan: () => Promise<ScanDone>
  listActivities: () => Promise<WorkbenchContribution[]>
  onScanProgress: (listener: (payload: ScanProgress) => void) => () => void
  onScanDone: (listener: (payload: ScanDone) => void) => () => void
}

export type { Conversation, Message, ScanDone, ScanProgress, SourceInfo, WorkbenchContribution }
