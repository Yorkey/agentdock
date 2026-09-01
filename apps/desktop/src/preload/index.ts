import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type DesktopApi, type ScanDone, type ScanProgress } from '@agentdock/plugin-bridge/ipc'

function listen<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T) => {
    listener(payload)
  }
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const api: DesktopApi = {
  listConversations: (options) => ipcRenderer.invoke(IPC.listConversations, options),
  getMessages: (conversationId) => ipcRenderer.invoke(IPC.getMessages, conversationId),
  search: (query) => ipcRenderer.invoke(IPC.search, query),
  listSources: () => ipcRenderer.invoke(IPC.listSources),
  startScan: () => ipcRenderer.invoke(IPC.startScan),
  listActivities: () => ipcRenderer.invoke(IPC.listActivities),
  setThemeSource: (source) => ipcRenderer.invoke(IPC.setThemeSource, source),
  readPlanFile: (conversationId, path) => ipcRenderer.invoke(IPC.readPlanFile, conversationId, path),
  revealInFolder: (path, workspace) => ipcRenderer.invoke(IPC.revealInFolder, path, workspace),
  readPreviewFile: (path, workspace) => ipcRenderer.invoke(IPC.readPreviewFile, path, workspace),
  onScanProgress: (listener) => listen<ScanProgress>(IPC.scanProgress, listener),
  onScanDone: (listener) => listen<ScanDone>(IPC.scanDone, listener)
}

contextBridge.exposeInMainWorld('api', api)
