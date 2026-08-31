import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { Context } from 'cordis'
import { StoreService } from '@chats/plugin-store'
import { SourceRegistry } from '@chats/plugin-registry'
import { WorkbenchRegistry } from '@chats/plugin-workbench'
import { BridgeService } from '@chats/plugin-bridge'
import chatsModulePlugin from '@chats/module-chats'
import skillsModulePlugin from '@chats/module-skills'
import cursorSourcePlugin from '@chats/source-cursor'
import claudeCodeSourcePlugin from '@chats/source-claude-code'
import codexSourcePlugin from '@chats/source-codex'
import scanWorkerPath from '../worker/index.ts?modulePath'
import { createUtilityScanEngine } from './scan-engine.ts'

let appCtx: Context | undefined

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    title: '对话归集',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

async function startPlugins(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(StoreService, {
    path: join(app.getPath('userData'), 'chats.sqlite')
  })
  await ctx.plugin(SourceRegistry)
  await ctx.plugin(WorkbenchRegistry)
  await ctx.plugin(cursorSourcePlugin)
  await ctx.plugin(claudeCodeSourcePlugin)
  await ctx.plugin(codexSourcePlugin)
  await ctx.plugin(chatsModulePlugin)
  await ctx.plugin(skillsModulePlugin)
  const scanEngine = createUtilityScanEngine(scanWorkerPath)
  ctx.sources.useEngine(scanEngine)
  await ctx.plugin(BridgeService)
  ctx.effect(() => () => {
    scanEngine.dispose()
  })
  return ctx
}

app.whenReady().then(async () => {
  appCtx = await startPlugins()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  try {
    appCtx?.store.close()
  } catch {
    // 进程即将退出，关闭失败可忽略
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
