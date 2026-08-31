import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const bundledWorkspacePkgs = [
  '@chats/core',
  '@chats/plugin-store',
  '@chats/plugin-registry',
  '@chats/plugin-workbench',
  '@chats/plugin-bridge',
  '@chats/module-chats',
  '@chats/module-skills',
  '@chats/source-cursor',
  '@chats/source-claude-code',
  '@chats/source-codex',
  // 纯 ESM，打进产物以免 pnpm workspace / 打包后找不到 node_modules
  'cordis'
]

function emitMainEsmPackageJson() {
  return {
    name: 'emit-main-esm-package-json',
    apply: 'build' as const,
    closeBundle() {
      const dir = resolve(import.meta.dirname, 'out/main')
      mkdirSync(dir, { recursive: true })
      // utilityProcess 从 asar.unpacked 加载 hashed worker 时，靠这份 package.json 把 .js 当 ESM
      writeFileSync(resolve(dir, 'package.json'), `${JSON.stringify({ type: 'module' })}\n`)
    }
  }
}

export default defineConfig({
  main: {
    plugins: [emitMainEsmPackageJson()],
    build: {
      // workspace 源码与 cordis 打进主进程 / worker；node:sqlite 仍是 Node 内置
      externalizeDeps: {
        exclude: bundledWorkspacePkgs
      },
      rollupOptions: {
        output: {
          // cordis 是纯 ESM，主进程必须打成 ES module
          format: 'es'
        }
      }
    }
  },
  preload: {
    build: {
      externalizeDeps: {
        exclude: [
          '@chats/core',
          '@chats/plugin-bridge',
          '@chats/plugin-registry',
          '@chats/plugin-workbench'
        ]
      },
      rollupOptions: {
        output: {
          // sandbox 预加载脚本仍需 CJS；type:module 时输出为 index.cjs
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
