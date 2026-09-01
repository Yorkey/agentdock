import type { Conversation, Message, WorkbenchContribution } from '@agentdock/core'
import type { DesktopApi, FilePreviewResult, ListConversationsArgs, ThemeSource } from '@agentdock/plugin-bridge/ipc'
import type { ScanDone, ScanProgress, SourceInfo } from '@agentdock/plugin-registry/types'

export type {
  Conversation,
  Message,
  ScanDone,
  ScanProgress,
  SourceInfo,
  ThemeSource,
  WorkbenchContribution,
  FilePreviewResult
}

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

/** 订阅 `agentdock:scan:progress` / `agentdock:scan:done`。 */
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

export function readPlanFile(conversationId: string, path: string): Promise<string> {
  const api = getApi()
  if (typeof api.readPlanFile !== 'function') {
    return Promise.reject(new Error('readPlanFile unavailable'))
  }
  return api.readPlanFile(conversationId, path)
}

export function revealInFolder(path: string, workspace?: string): Promise<void> {
  const api = window.api
  if (typeof api?.revealInFolder !== 'function') {
    return Promise.reject(new Error('需要重启应用才能在文件夹中显示'))
  }
  return api.revealInFolder(path, workspace)
}

export function readPreviewFile(path: string, workspace?: string): Promise<FilePreviewResult> {
  const api = window.api
  if (typeof api?.readPreviewFile !== 'function') {
    return Promise.reject(new Error('需要重启应用才能预览文件'))
  }
  return api.readPreviewFile(path, workspace)
}

export function startScan(): Promise<ScanDone> {
  return getApi().startScan()
}

export function listActivities(): Promise<WorkbenchContribution[]> {
  return getApi().listActivities()
}

/** 同步主题到主进程的 `nativeTheme`；preload 不可用时静默跳过。 */
export function setThemeSource(source: ThemeSource): void {
  const api = window.api
  if (typeof api?.setThemeSource !== 'function') return
  void api.setThemeSource(source).catch(() => {
    // 主题同步失败不影响渲染层已生效的 data-theme
  })
}
