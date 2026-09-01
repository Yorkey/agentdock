import type { Conversation, Message, WorkbenchContribution } from '@agentdock/core'
import type { ScanDone, ScanProgress, SourceInfo } from '@agentdock/plugin-registry/types'

export const IPC = {
  listConversations: 'agentdock:conversations:list',
  getMessages: 'agentdock:conversations:messages',
  search: 'agentdock:search',
  listSources: 'agentdock:sources:list',
  startScan: 'agentdock:scan:start',
  scanProgress: 'agentdock:scan:progress',
  scanDone: 'agentdock:scan:done',
  listActivities: 'agentdock:workbench:list',
  setThemeSource: 'agentdock:theme:set-source',
  readPlanFile: 'agentdock:plans:read',
  revealInFolder: 'agentdock:fs:reveal',
  readPreviewFile: 'agentdock:fs:preview'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface ListConversationsArgs {
  sourceId?: string
}

/** 与 Electron `nativeTheme.themeSource` 同名同值。 */
export type ThemeSource = 'system' | 'light' | 'dark'

export type FilePreviewResult =
  | { kind: 'text'; path: string; name: string; text: string; truncated: boolean }
  | { kind: 'image'; path: string; name: string; mime: string; dataUrl: string }
  | { kind: 'unsupported'; path: string; name: string; reason: string }

export interface DesktopApi {
  listConversations: (options?: ListConversationsArgs) => Promise<Conversation[]>
  getMessages: (conversationId: string) => Promise<Message[]>
  search: (query: string) => Promise<Conversation[]>
  listSources: () => Promise<SourceInfo[]>
  startScan: () => Promise<ScanDone>
  listActivities: () => Promise<WorkbenchContribution[]>
  setThemeSource: (source: ThemeSource) => Promise<void>
  readPlanFile: (conversationId: string, path: string) => Promise<string>
  revealInFolder: (path: string, workspace?: string) => Promise<void>
  readPreviewFile: (path: string, workspace?: string) => Promise<FilePreviewResult>
  onScanProgress: (listener: (payload: ScanProgress) => void) => () => void
  onScanDone: (listener: (payload: ScanDone) => void) => () => void
}

export type { Conversation, Message, ScanDone, ScanProgress, SourceInfo, WorkbenchContribution }
