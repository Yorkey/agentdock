import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { Conversation, ConversationSource, Message, SourceFileRef } from '@agentdock/core'
import { hashId, makeConversationId, truncateTitle } from '@agentdock/core'
import { firstUserTitleText, mapCodexRecord } from './map.ts'
import { isErrno, parseTimestamp, sessionUuidFromFilename } from './util.ts'

export const SOURCE_ID = 'codex'
export const SOURCE_LABEL = 'Codex'

export function defaultSessionsRoot(): string {
  return join(homedir(), '.codex', 'sessions')
}

interface ParseSidecar {
  conversationId: string
  workspace?: string
  gitBranch?: string
  models: string[]
  createdAt: number
  updatedAt: number
}

export interface CodexSourceOptions {
  root?: string
}

export function createCodexSource(options: CodexSourceOptions = {}): ConversationSource {
  const root = options.root ?? defaultSessionsRoot()
  const sidecars = new Map<string, ParseSidecar>()

  return {
    id: SOURCE_ID,
    label: SOURCE_LABEL,

    async *discover(): AsyncIterable<SourceFileRef> {
      yield* walkJsonl(root)
    },

    async *parse(ref: SourceFileRef): AsyncIterable<Message> {
      const sessionKey = sessionUuidFromFilename(ref.path) ?? ref.path
      const conversationId = makeConversationId(SOURCE_ID, sessionKey)
      const models: string[] = []
      const seenModels = new Set<string>()
      let workspace: string | undefined
      let gitBranch: string | undefined
      let createdAt = 0
      let updatedAt = 0
      let seq = 0

      try {
        for await (const record of readJsonl(ref.path)) {
          const ts = timestampOf(record)
          if (ts) {
            if (!createdAt) createdAt = ts
            updatedAt = ts
          }

          const mapped = mapCodexRecord(record)
          if (mapped.kind === 'skip') continue

          if (mapped.kind === 'meta') {
            if (mapped.workspace && !workspace) workspace = mapped.workspace
            if (mapped.gitBranch && !gitBranch) gitBranch = mapped.gitBranch
            if (mapped.model && !seenModels.has(mapped.model)) {
              seenModels.add(mapped.model)
              models.push(mapped.model)
            }
            continue
          }

          seq += 1
          const message: Message = {
            id: hashId(conversationId, String(seq)),
            conversationId,
            seq,
            role: mapped.role,
            createdAt: ts ?? createdAt,
            parts: mapped.parts
          }
          yield message
        }
      } finally {
        sidecars.set(ref.path, {
          conversationId,
          workspace,
          gitBranch,
          models,
          createdAt,
          updatedAt: updatedAt || createdAt || Math.round(ref.mtimeMs)
        })
      }
    },

    meta(ref: SourceFileRef, messages: Message[]): Conversation {
      const sidecar = sidecars.get(ref.path)
      const sessionKey = sessionUuidFromFilename(ref.path) ?? ref.path
      const id = sidecar?.conversationId ?? makeConversationId(SOURCE_ID, sessionKey)
      const createdAt =
        sidecar?.createdAt ||
        messages[0]?.createdAt ||
        Math.round(ref.mtimeMs)
      const updatedAt =
        sidecar?.updatedAt ||
        messages[messages.length - 1]?.createdAt ||
        Math.round(ref.mtimeMs)

      const conversation: Conversation = {
        id,
        sourceId: SOURCE_ID,
        sourcePath: ref.path,
        title: titleFromMessages(messages),
        models: sidecar?.models ?? [],
        createdAt,
        updatedAt,
        messageCount: messages.length
      }
      if (sidecar?.workspace) conversation.workspace = sidecar.workspace
      if (sidecar?.gitBranch) conversation.gitBranch = sidecar.gitBranch
      return conversation
    }
  }
}

export const codexSource = createCodexSource()

function titleFromMessages(messages: Message[]): string {
  for (const message of messages) {
    if (message.role !== 'user') continue
    const text = firstUserTitleText(message.parts)
    if (text) {
      const title = truncateTitle(text)
      if (title) return title
    }
  }
  return 'Codex session'
}

function timestampOf(record: unknown): number | undefined {
  if (typeof record !== 'object' || record === null || !('timestamp' in record)) {
    return undefined
  }
  return parseTimestamp((record as { timestamp?: unknown }).timestamp)
}

async function* walkJsonl(dir: string): AsyncIterable<SourceFileRef> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return
    throw error
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkJsonl(fullPath)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
    const info = await stat(fullPath)
    yield { path: fullPath, mtimeMs: info.mtimeMs, size: info.size }
  }
}

async function* readJsonl(filePath: string): AsyncIterable<unknown> {
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        yield JSON.parse(trimmed) as unknown
      } catch {
        continue
      }
    }
  } finally {
    lines.close()
    stream.destroy()
  }
}
