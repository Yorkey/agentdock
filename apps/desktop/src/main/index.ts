import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { Context } from 'cordis'
import { StoreService } from '@agentdock/plugin-store'
import { SourceRegistry } from '@agentdock/plugin-registry'
import { WorkbenchRegistry } from '@agentdock/plugin-workbench'
import { BridgeService } from '@agentdock/plugin-bridge'
import chatsModulePlugin from '@agentdock/module-chats'
import skillsModulePlugin from '@agentdock/module-skills'
import cursorSourcePlugin from '@agentdock/source-cursor'
import claudeCodeSourcePlugin from '@agentdock/source-claude-code'
import codexSourcePlugin from '@agentdock/source-codex'
import scanWorkerPath from '../worker/index.ts?modulePath'
import { createUtilityScanEngine } from './scan-engine.ts'

let appCtx: Context | undefined

/** 与 tokens.css 的 `--surface-1` 对齐，避免启动白闪。 */
const WINDOW_BG = { light: '#ffffff', dark: '#1b1c1f' } as const

function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? WINDOW_BG.dark : WINDOW_BG.light
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    title: 'AgentDock',
    backgroundColor: windowBackground(),
    show: false,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
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

  const syncBackground = () => {
    if (!win.isDestroyed()) win.setBackgroundColor(windowBackground())
  }
  nativeTheme.on('updated', syncBackground)
  win.on('closed', () => {
    nativeTheme.off('updated', syncBackground)
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

function resolveStorePath(): string {
  const userData = app.getPath('userData')
  const storePath = join(userData, 'agentdock.sqlite')
  const legacyPath = join(userData, 'chats.sqlite')
  if (!existsSync(storePath) && existsSync(legacyPath)) {
    try {
      renameSync(legacyPath, storePath)
    } catch {
      // 迁移失败则使用新库
    }
  }
  return storePath
}

async function startPlugins(): Promise<Context> {
  const ctx = new Context()
  const storePath = resolveStorePath()
  await ctx.plugin(StoreService, {
    path: storePath
  })
  await ctx.plugin(SourceRegistry)
  await ctx.plugin(WorkbenchRegistry)
  await ctx.plugin(cursorSourcePlugin)
  await ctx.plugin(claudeCodeSourcePlugin)
  await ctx.plugin(codexSourcePlugin)
  await ctx.plugin(chatsModulePlugin)
  await ctx.plugin(skillsModulePlugin)
  const scanEngine = createUtilityScanEngine(scanWorkerPath, storePath)
  ctx.sources.useEngine(scanEngine)
  await ctx.plugin(BridgeService)
  ctx.effect(() => () => {
    scanEngine.dispose()
  })
  return ctx
}

app.setName('AgentDock')

if (process.platform === 'darwin') {
  app.setAboutPanelOptions({
    applicationName: 'AgentDock',
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: 'Copyright © 2026 AgentDock'
  })
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

// Trigger electron-vite main reload for skills override service

