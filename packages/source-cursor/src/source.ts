import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'
import {
  hashId,
  makeConversationId,
  truncateTitle,
  type Conversation,
  type ConversationSource,
  type Message,
  type SourceFileRef
} from '@agentdock/core'
import {
  extractTimestampMs,
  extractUserQuery,
  firstLine,
  isEnoent,
  isRecord,
  mapMessageParts,
  mapRole,
  rawTextFromContent
} from './content.ts'
import { projectSlugFromTranscriptPath, slugToWorkspacePath } from './workspace.ts'

export const SOURCE_ID = 'cursor'
export const SOURCE_LABEL = 'Cursor'

export function projectsRoot(): string {
  return join(homedir(), '.cursor', 'projects')
}

export function conversationIdFromPath(filePath: string): string {
  return makeConversationId(SOURCE_ID, basename(filePath, '.jsonl'))
}

export const cursorSource: ConversationSource = {
  id: SOURCE_ID,
  label: SOURCE_LABEL,
  discover,
  parse,
  meta
}

async function* discover(): AsyncIterable<SourceFileRef> {
  const root = projectsRoot()
  let projects
  try {
    projects = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (isEnoent(error)) return
    throw error
  }

  for (const project of projects) {
    if (!project.isDirectory()) continue
    // Purely numeric dirs (e.g. `1782092789329`) have no jsonl; skipping
    // missing `agent-transcripts` yields nothing.
    const transcriptsDir = join(root, project.name, 'agent-transcripts')
    let files
    try {
      files = await readdir(transcriptsDir, { withFileTypes: true, recursive: true })
    } catch (error) {
      if (isEnoent(error)) continue
      throw error
    }
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.jsonl')) continue
      const filePath = join(file.parentPath, file.name)
      try {
        const info = await stat(filePath)
        yield { path: filePath, mtimeMs: info.mtimeMs, size: info.size }
      } catch (error) {
        if (isEnoent(error)) continue
        throw error
      }
    }
  }
}

async function* parse(ref: SourceFileRef): AsyncIterable<Message> {
  const conversationId = conversationIdFromPath(ref.path)
  const stream = createReadStream(ref.path, { encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  let seq = 0
  let lastCreatedAt = ref.mtimeMs
  try {
    for await (const line of rl) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let row: unknown
      try {
        row = JSON.parse(trimmed) as unknown
      } catch {
        continue
      }
      if (!isRecord(row)) continue
      if (row.type === 'turn_ended') continue
      const role = mapRole(row.role)
      if (!role) continue
      const content = isRecord(row.message) ? row.message.content : undefined
      const parts = mapMessageParts(content)
      if (parts.length === 0) continue
      const stamped = extractTimestampMs(rawTextFromContent(content))
      if (stamped !== undefined) lastCreatedAt = stamped
      yield {
        id: hashId(conversationId, String(seq)),
        conversationId,
        seq,
        role,
        createdAt: lastCreatedAt,
        parts
      }
      seq += 1
    }
  } catch (error) {
    if (isEnoent(error)) return
    throw error
  } finally {
    rl.close()
    stream.destroy()
  }
}

export function meta(ref: SourceFileRef, messages: Message[]): Conversation {
  const slug = projectSlugFromTranscriptPath(ref.path)
  const workspace = slug ? slugToWorkspacePath(slug) : undefined
  return {
    id: conversationIdFromPath(ref.path),
    sourceId: SOURCE_ID,
    sourcePath: ref.path,
    title: titleFromMessages(messages),
    ...(workspace ? { workspace } : {}),
    models: [],
    createdAt: createdAtFromMessages(messages, ref.mtimeMs),
    updatedAt: ref.mtimeMs,
    messageCount: messages.length
  }
}

function titleFromMessages(messages: Message[]): string {
  for (const message of messages) {
    if (message.role !== 'user') continue
    for (const part of message.parts) {
      if (part.kind !== 'text') continue
      const query = extractUserQuery(part.text) ?? part.text
      const title = truncateTitle(firstLine(query))
      if (title) return title
    }
  }
  return 'Untitled'
}

function createdAtFromMessages(messages: Message[], fallback: number): number {
  for (const message of messages) {
    if (message.role === 'user') return message.createdAt
  }
  return messages[0]?.createdAt ?? fallback
}
