import type { Conversation, ConversationSource, Message, SourceFileRef } from '@chats/core'
import { claudeCodeSource } from '@chats/source-claude-code'
import { codexSource } from '@chats/source-codex'
import { cursorSource } from '@chats/source-cursor'
import { MESSAGE_BATCH_SIZE, type DiscoveredFile } from './protocol.ts'

export const builtinSources: ConversationSource[] = [
  cursorSource,
  claudeCodeSource,
  codexSource
]

const sourceMap = new Map(builtinSources.map((source) => [source.id, source]))

export function getBuiltinSource(id: string): ConversationSource {
  const source = sourceMap.get(id)
  if (!source) {
    throw new Error(`unknown source: ${id}`)
  }
  return source
}

export async function discoverFiles(sourceIds: string[]): Promise<DiscoveredFile[]> {
  const files: DiscoveredFile[] = []
  for (const sourceId of sourceIds) {
    const source = getBuiltinSource(sourceId)
    for await (const ref of source.discover()) {
      files.push({ sourceId, ref })
    }
  }
  return files
}

export async function parseOne(
  source: ConversationSource,
  ref: SourceFileRef,
  onBatch?: (batch: Message[]) => void | Promise<void>,
  batchSize = MESSAGE_BATCH_SIZE
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const messages: Message[] = []
  let batch: Message[] = []
  for await (const message of source.parse(ref)) {
    messages.push(message)
    if (!onBatch) continue
    batch.push(message)
    if (batch.length >= batchSize) {
      await onBatch(batch)
      batch = []
    }
  }
  if (onBatch && batch.length > 0) {
    await onBatch(batch)
  }
  return {
    conversation: source.meta(ref, messages),
    messages
  }
}
