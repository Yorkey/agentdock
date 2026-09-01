import type { Message, Part } from '@agentdock/core'

export type ChangeOrigin = 'native' | 'synthetic'

export interface ChangeHunk {
  id: string
  path: string
  patch: string
  origin: ChangeOrigin
  intent: boolean
  failed: boolean
  createdAt: number
  toolName?: string
}

export interface FileChange {
  path: string
  fileName: string
  origin: ChangeOrigin
  count: number
  intent: boolean
  failed: boolean
  entries: ChangeHunk[]
}

const EDIT_NAME_RE = /write|strreplace|edit|delete|apply_patch|applypatch|multiedit/i

export function projectChanges(messages: Message[]): FileChange[] {
  const results = indexToolResults(messages)
  const native: ChangeHunk[] = []
  const synthetic: ChangeHunk[] = []
  let seq = 0

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.kind === 'diff') {
        const path = part.path.trim()
        if (!path && !part.patch.trim()) continue
        if (!path) continue
        native.push({
          id: `diff:${seq++}:${path}`,
          path,
          patch: part.patch,
          origin: 'native',
          intent: false,
          failed: false,
          createdAt: message.createdAt
        })
        continue
      }
      if (part.kind !== 'tool_call' || !isEditTool(part.name)) continue
      const made = synthesizeFromTool(part, results.get(part.callId ?? ''), message.createdAt, seq)
      seq += made.length
      synthetic.push(...made)
    }
  }

  const nativeKeys = new Set(native.map((hunk) => pathKey(hunk.path)))
  const kept = [...native, ...synthetic.filter((hunk) => !nativeKeys.has(pathKey(hunk.path)))]
  return groupByPath(kept)
}

function groupByPath(hunks: ChangeHunk[]): FileChange[] {
  const groups = new Map<string, FileChange>()
  for (const hunk of hunks) {
    const key = pathKey(hunk.path)
    const existing = groups.get(key)
    if (existing) {
      existing.entries.push(hunk)
      existing.count += 1
      if (hunk.origin === 'native') existing.origin = 'native'
      if (hunk.intent) existing.intent = true
      if (hunk.failed) existing.failed = true
      continue
    }
    groups.set(key, {
      path: hunk.path,
      fileName: fileName(hunk.path),
      origin: hunk.origin,
      count: 1,
      intent: hunk.intent,
      failed: hunk.failed,
      entries: [hunk]
    })
  }

  const files = [...groups.values()]
  for (const file of files) {
    file.entries.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  }
  files.sort((a, b) => {
    const aTime = a.entries.at(-1)?.createdAt ?? 0
    const bTime = b.entries.at(-1)?.createdAt ?? 0
    if (aTime !== bTime) return bTime - aTime
    return a.path.localeCompare(b.path)
  })
  return files
}

function synthesizeFromTool(
  part: Extract<Part, { kind: 'tool_call' }>,
  result: { isError: boolean } | undefined,
  createdAt: number,
  seq: number
): ChangeHunk[] {
  const rec = asRecord(part.input)
  const intent = result == null
  const failed = result?.isError === true
  const key = part.name.toLowerCase()

  if (key.includes('multiedit')) {
    const path = rec ? pathFromRecord(rec) : undefined
    const edits = rec && Array.isArray(rec.edits) ? rec.edits : []
    if (!path || edits.length === 0) return []
    const hunks: string[] = []
    for (const edit of edits) {
      if (!isRecord(edit)) continue
      const oldText = stringField(edit, 'old_string') ?? stringField(edit, 'old_str') ?? ''
      const newText = stringField(edit, 'new_string') ?? stringField(edit, 'new_str') ?? ''
      hunks.push(hunkBlock(oldText, newText))
    }
    if (hunks.length === 0) return []
    const patch = `${fileHeader(path)}${hunks.join('')}`
    return [makeHunk(seq, path, patch, part.name, createdAt, intent, failed)]
  }

  if (key.includes('apply_patch') || key.includes('applypatch')) {
    const rawPatch =
      rec ? stringField(rec, 'patch') ?? stringField(rec, 'hunk') ?? stringField(rec, 'input') : undefined
    const fallback = typeof part.input === 'string' ? part.input : rawPatch
    if (!fallback) return []
    if (looksLikeUnifiedDiff(fallback)) {
      const path = rec ? pathFromRecord(rec) : undefined
      const fromPatch = pathFromUnifiedDiff(fallback)
      const resolved = path || fromPatch
      if (!resolved) return []
      return [makeHunk(seq, resolved, fallback, part.name, createdAt, intent, failed)]
    }
    return []
  }

  const path = rec ? pathFromRecord(rec) : undefined
  if (!path) return []

  if (key.includes('write')) {
    const contents = rec ? stringField(rec, 'contents') ?? stringField(rec, 'content') ?? '' : ''
    return [makeHunk(seq, path, syntheticAdd(path, contents), part.name, createdAt, intent, failed)]
  }

  if (key.includes('delete') && !key.includes('strreplace') && !key.includes('edit')) {
    const oldText = rec ? stringField(rec, 'old_string') ?? stringField(rec, 'contents') ?? '' : ''
    return [makeHunk(seq, path, syntheticDelete(path, oldText), part.name, createdAt, intent, failed)]
  }

  const oldText = rec ? stringField(rec, 'old_string') ?? stringField(rec, 'old_str') ?? '' : ''
  const newText = rec ? stringField(rec, 'new_string') ?? stringField(rec, 'new_str') ?? '' : ''
  if (!oldText && !newText) return []
  return [makeHunk(seq, path, `${fileHeader(path)}${hunkBlock(oldText, newText)}`, part.name, createdAt, intent, failed)]
}

function makeHunk(
  seq: number,
  path: string,
  patch: string,
  toolName: string,
  createdAt: number,
  intent: boolean,
  failed: boolean
): ChangeHunk {
  return {
    id: `edit:${seq}:${path}`,
    path,
    patch,
    origin: 'synthetic',
    intent,
    failed,
    createdAt,
    toolName
  }
}

function syntheticAdd(path: string, contents: string): string {
  const lines = diffLines(contents)
  const body = lines.map((line) => `+${line}`).join('\n')
  const count = Math.max(lines.length, 1)
  return `--- /dev/null\n+++ ${path}\n@@ -0,0 +1,${count} @@\n${body}\n`
}

function syntheticDelete(path: string, contents: string): string {
  const lines = diffLines(contents)
  const body = lines.length > 0 && contents ? `${lines.map((line) => `-${line}`).join('\n')}\n` : ''
  return `--- ${path}\n+++ /dev/null\n@@ -1,${Math.max(lines.length, 1)} +0,0 @@\n${body}`
}

function fileHeader(path: string): string {
  return `--- ${path}\n+++ ${path}\n`
}

function hunkBlock(oldText: string, newText: string): string {
  const oldLines = diffLines(oldText)
  const newLines = diffLines(newText)
  const del = oldText ? oldLines.map((line) => `-${line}`).join('\n') : ''
  const add = newText ? newLines.map((line) => `+${line}`).join('\n') : ''
  const body = [del, add].filter(Boolean).join('\n')
  return `@@ -1,${Math.max(oldLines.length, 1)} +1,${Math.max(newLines.length, 1)} @@\n${body}\n`
}

function diffLines(text: string): string[] {
  if (!text) return []
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

function looksLikeUnifiedDiff(text: string): boolean {
  return /^(?:diff --git |--- )/m.test(text)
}

function pathFromUnifiedDiff(patch: string): string | undefined {
  const plus = /^\+\+\+\s+(?:b\/)?(.+)$/m.exec(patch)
  const candidate = plus?.[1]?.trim()
  if (candidate && candidate !== '/dev/null') return candidate
  const minus = /^---\s+(?:a\/)?(.+)$/m.exec(patch)
  const from = minus?.[1]?.trim()
  if (from && from !== '/dev/null') return from
  return undefined
}

function isEditTool(name: string): boolean {
  return EDIT_NAME_RE.test(name)
}

function indexToolResults(messages: Message[]): Map<string, { isError: boolean }> {
  const results = new Map<string, { isError: boolean }>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.kind !== 'tool_result' || !part.callId) continue
      results.set(part.callId, { isError: part.isError === true })
    }
  }
  return results
}

function pathFromRecord(rec: Record<string, unknown>): string | undefined {
  const raw =
    stringField(rec, 'path') ??
    stringField(rec, 'file_path') ??
    stringField(rec, 'target_file') ??
    stringField(rec, 'file')
  const trimmed = raw?.trim()
  return trimmed || undefined
}

function pathKey(path: string): string {
  return path.replace(/\\/g, '/')
}

function fileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts.at(-1) || path
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined
    try {
      const parsed: unknown = JSON.parse(trimmed)
      return isRecord(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return isRecord(value) ? value : undefined
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}
