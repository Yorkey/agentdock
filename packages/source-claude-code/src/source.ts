import type { Conversation, ConversationSource, Message, SourceFileRef } from '@agentdock/core'
import { makeConversationId, truncateTitle } from '@agentdock/core'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { getCachedFileMeta, parseClaudeSession } from './parse.ts'

export const SOURCE_ID = 'claude-code'
export const SOURCE_LABEL = 'Claude Code'

export function claudeProjectsRoot(): string {
  return join(homedir(), '.claude', 'projects')
}

async function* walkJsonl(dir: string): AsyncIterable<SourceFileRef> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkJsonl(fullPath)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
    try {
      const info = await stat(fullPath)
      yield { path: fullPath, mtimeMs: info.mtimeMs, size: info.size }
    } catch {
      // skip unreadable files
    }
  }
}

async function* discover(): AsyncIterable<SourceFileRef> {
  yield* walkJsonl(claudeProjectsRoot())
}

async function* parse(ref: SourceFileRef): AsyncIterable<Message> {
  const parsed = await parseClaudeSession(ref, SOURCE_ID)
  for (const message of parsed.messages) {
    yield message
  }
}

function isSlashCommandText(text: string): boolean {
  return (
    text.includes('<local-command-caveat>') ||
    text.includes('<command-name>') ||
    text.includes('<local-command-stdout>') ||
    text.includes('<local-command-stderr>')
  )
}

function titleFromMessages(messages: Message[]): string {
  for (const message of messages) {
    if (message.role !== 'user') continue
    for (const part of message.parts) {
      if (part.kind !== 'text') continue
      const text = part.text.trim()
      if (!text || isSlashCommandText(text)) continue
      const title = truncateTitle(text)
      if (title) return title
    }
  }
  return ''
}

function meta(ref: SourceFileRef, messages: Message[]): Conversation {
  const cached = getCachedFileMeta(ref.path)
  const conversationId =
    cached?.conversationId ??
    messages[0]?.conversationId ??
    makeConversationId(SOURCE_ID, ref.path)

  const title =
    cached?.title ||
    titleFromMessages(messages) ||
    truncateTitle(cached?.sessionId ?? ref.path) ||
    'Claude Code'

  const createdAt =
    cached?.createdAt ||
    messages[0]?.createdAt ||
    Math.trunc(ref.mtimeMs)
  const updatedAt =
    cached?.updatedAt ||
    messages[messages.length - 1]?.createdAt ||
    Math.trunc(ref.mtimeMs)

  return {
    id: conversationId,
    sourceId: SOURCE_ID,
    sourcePath: ref.path,
    title,
    workspace: cached?.workspace,
    gitBranch: cached?.gitBranch,
    models: cached?.models ?? [],
    createdAt,
    updatedAt,
    messageCount: messages.length
  }
}

export const claudeCodeSource: ConversationSource = {
  id: SOURCE_ID,
  label: SOURCE_LABEL,
  discover,
  parse,
  meta
}
