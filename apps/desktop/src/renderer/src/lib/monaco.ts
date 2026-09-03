import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'
import * as monaco from 'monaco-editor'
import { fileName } from './format'

globalThis.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  }
}

const LIGHT = 'agentdock-light'
const DARK = 'agentdock-dark'

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  cts: 'typescript',
  mts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  py: 'python',
  go: 'go',
  rs: 'rust',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  sql: 'sql',
  xml: 'xml',
  svg: 'xml',
  vue: 'html',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  cs: 'csharp'
}

function languageFromFile(path: string, name: string): string {
  const file = (name.trim() || fileName(path)).toLowerCase()
  const dot = file.lastIndexOf('.')
  if (dot <= 0 || dot === file.length - 1) return 'plaintext'
  return LANGUAGE_BY_EXT[file.slice(dot + 1)] ?? 'plaintext'
}

function isDarkAppearance(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return true
  if (attr === 'light') return false
  return matchMedia('(prefers-color-scheme: dark)').matches
}

function tokenHex(name: string): string | undefined {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return /^#([0-9a-f]{3,8})$/i.test(value) ? value : undefined
}

function applyPreviewTheme(): void {
  const background = tokenHex('--surface-1')
  const foreground = tokenHex('--text-1')
  const colors: Record<string, string> = {}
  if (background) {
    colors['editor.background'] = background
    colors['editorGutter.background'] = background
  }
  if (foreground) colors['editor.foreground'] = foreground

  monaco.editor.defineTheme(LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors
  })
  monaco.editor.defineTheme(DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors
  })
  monaco.editor.setTheme(isDarkAppearance() ? DARK : LIGHT)
}

export function mountPreviewEditor(
  host: HTMLElement,
  options: { text: string; path: string; name: string }
): () => void {
  applyPreviewTheme()
  const editor = monaco.editor.create(host, {
    value: options.text,
    language: languageFromFile(options.path, options.name),
    readOnly: true,
    domReadOnly: true,
    minimap: { enabled: false },
    contextmenu: false,
    scrollBeyondLastLine: false,
    lineNumbers: 'on',
    wordWrap: 'on',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    automaticLayout: true,
    theme: isDarkAppearance() ? DARK : LIGHT
  })

  const syncTheme = (): void => applyPreviewTheme()
  const mo = new MutationObserver(syncTheme)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const mq = matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', syncTheme)

  return () => {
    mo.disconnect()
    mq.removeEventListener('change', syncTheme)
    const model = editor.getModel()
    editor.dispose()
    model?.dispose()
  }
}
