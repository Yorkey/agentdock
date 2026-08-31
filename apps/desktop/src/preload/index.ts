import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type DesktopApi, type ScanDone, type ScanProgress } from '@chats/plugin-bridge/ipc'

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
  onScanProgress: (listener) => listen<ScanProgress>(IPC.scanProgress, listener),
  onScanDone: (listener) => listen<ScanDone>(IPC.scanDone, listener)
}

contextBridge.exposeInMainWorld('api', api)
