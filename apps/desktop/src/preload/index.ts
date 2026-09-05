import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
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
  onScanDone: (listener) => listen<ScanDone>(IPC.scanDone, listener),

  // Skills API
  listSkills: (agentId) => ipcRenderer.invoke(IPC.listSkills, agentId),
  listAggregatedSkills: () => ipcRenderer.invoke(IPC.listAggregatedSkills),
  listSkillAgents: () => ipcRenderer.invoke(IPC.listSkillAgents),
  getSkillDetail: (skillName, agentId) => ipcRenderer.invoke(IPC.getSkillDetail, skillName, agentId),
  installSkillToAgents: (args) => ipcRenderer.invoke(IPC.installSkillToAgents, args),
  previewGitHubSkill: (url) => ipcRenderer.invoke(IPC.previewGitHubSkill, url),
  installSkillFromGitHub: (args) => ipcRenderer.invoke(IPC.installSkillFromGitHub, args),
  selectSkillFolder: () => ipcRenderer.invoke(IPC.selectSkillFolder),
  selectSkillZip: () => ipcRenderer.invoke(IPC.selectSkillZip),
  previewLocalSkill: (sourcePath) => ipcRenderer.invoke(IPC.previewLocalSkill, sourcePath),
  installLocalSkill: (args) => ipcRenderer.invoke(IPC.installLocalSkill, args),
  uninstallSkill: (args) => ipcRenderer.invoke(IPC.uninstallSkill, args),
  listSkillOverrides: () => ipcRenderer.invoke(IPC.listSkillOverrides),
  enableSkillOverride: (agentId, skillId) => ipcRenderer.invoke(IPC.enableSkillOverride, agentId, skillId),
  getSkillOverrideStatus: (agentId, skillId) => ipcRenderer.invoke(IPC.getSkillOverrideStatus, agentId, skillId),
  readSkillFile: (agentId, skillId, relativePath) => ipcRenderer.invoke(IPC.readSkillFile, agentId, skillId, relativePath),
  saveSkillOverrideFile: (args) => ipcRenderer.invoke(IPC.saveSkillOverrideFile, args),
  getSkillOverrideDiff: (agentId, skillId, relativePath) => ipcRenderer.invoke(IPC.getSkillOverrideDiff, agentId, skillId, relativePath),
  revertSkillOverride: (agentId, skillId) => ipcRenderer.invoke(IPC.revertSkillOverride, agentId, skillId),
  commitSkillOverride: (agentId, skillId) => ipcRenderer.invoke(IPC.commitSkillOverride, agentId, skillId),
  getPathForFile: (file: any) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
