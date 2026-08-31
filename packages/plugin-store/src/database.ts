import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLOutputValue, type StatementSync } from 'node:sqlite'
import {
  partsToSearchText,
  type Conversation,
  type FileFingerprint,
  type Message,
  type Resource,
  type Role,
  type SourceFileRef
} from '@chats/core'
import { PRAGMA_SQL, SCHEMA_SQL } from './schema.ts'

export interface ListConversationsOptions {
  sourceId?: string
}

export function openStoreDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }
  const db = new DatabaseSync(path)
  db.exec(PRAGMA_SQL)
  db.exec(SCHEMA_SQL)
  return db
}

function asString(value: SQLOutputValue | undefined): string {
  if (value == null) return ''
  return String(value)
}

function asStringOpt(value: SQLOutputValue | undefined): string | undefined {
  if (value == null) return undefined
  return String(value)
}

function asNumber(value: SQLOutputValue | undefined): number {
  if (value == null) return 0
  return Number(value)
}

function mapConversation(row: Record<string, SQLOutputValue>): Conversation {
  const modelsRaw = asString(row.models) || '[]'
  let models: string[] = []
  try {
    const parsed: unknown = JSON.parse(modelsRaw)
    if (Array.isArray(parsed)) {
      models = parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    models = []
  }
  return {
    id: asString(row.id),
    sourceId: asString(row.source_id),
    sourcePath: asString(row.source_path),
    title: asString(row.title),
    workspace: asStringOpt(row.workspace),
    gitBranch: asStringOpt(row.git_branch),
    models,
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
    messageCount: asNumber(row.message_count)
  }
}

function mapMessage(row: Record<string, SQLOutputValue>): Message {
  const partsRaw = asString(row.parts) || '[]'
  let parts: Message['parts'] = []
  try {
    const parsed: unknown = JSON.parse(partsRaw)
    if (Array.isArray(parsed)) {
      parts = parsed as Message['parts']
    }
  } catch {
    parts = []
  }
  return {
    id: asString(row.id),
    conversationId: asString(row.conversation_id),
    seq: asNumber(row.seq),
    role: asString(row.role) as Role,
    createdAt: asNumber(row.created_at),
    parts
  }
}

function toFtsQuery(query: string): string {
  const trimmed = query.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed
  }
  return `"${trimmed.replaceAll('"', '""')}"`
}

export class SqliteStore {
  db: DatabaseSync
  stmtUpsertConversation: StatementSync
  stmtInsertMessage: StatementSync
  stmtInsertFts: StatementSync
  stmtInsertResource: StatementSync
  stmtGetFingerprint: StatementSync
  stmtSetFingerprint: StatementSync
  stmtListAll: StatementSync
  stmtListBySource: StatementSync
  stmtGetMessages: StatementSync
  stmtSearch: StatementSync
  stmtSearchLike: StatementSync
  stmtFindIds: StatementSync
  stmtDeleteFts: StatementSync
  stmtDeleteConversation: StatementSync

  constructor(path: string) {
    this.db = openStoreDatabase(path)
    this.stmtUpsertConversation = this.db.prepare(`
      INSERT INTO conversation (
        id, source_id, source_path, title, workspace, git_branch,
        models, created_at, updated_at, message_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source_id = excluded.source_id,
        source_path = excluded.source_path,
        title = excluded.title,
        workspace = excluded.workspace,
        git_branch = excluded.git_branch,
        models = excluded.models,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        message_count = excluded.message_count
    `)
    this.stmtInsertMessage = this.db.prepare(`
      INSERT INTO message (id, conversation_id, seq, role, created_at, parts)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    this.stmtInsertFts = this.db.prepare(`
      INSERT INTO message_fts (conversation_id, message_id, text)
      VALUES (?, ?, ?)
    `)
    this.stmtInsertResource = this.db.prepare(`
      INSERT INTO resource (id, conversation_id, mime_type, local_path, byte_length)
      VALUES (?, ?, ?, ?, ?)
    `)
    this.stmtGetFingerprint = this.db.prepare(`
      SELECT source_id, path, mtime_ms, size
      FROM scan_state
      WHERE source_id = ? AND path = ?
    `)
    this.stmtSetFingerprint = this.db.prepare(`
      INSERT INTO scan_state (source_id, path, mtime_ms, size, conversation_id, scanned_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, path) DO UPDATE SET
        mtime_ms = excluded.mtime_ms,
        size = excluded.size,
        conversation_id = excluded.conversation_id,
        scanned_at = excluded.scanned_at
    `)
    this.stmtListAll = this.db.prepare(`
      SELECT * FROM conversation ORDER BY updated_at DESC, id ASC
    `)
    this.stmtListBySource = this.db.prepare(`
      SELECT * FROM conversation WHERE source_id = ? ORDER BY updated_at DESC, id ASC
    `)
    this.stmtGetMessages = this.db.prepare(`
      SELECT * FROM message WHERE conversation_id = ? ORDER BY seq ASC
    `)
    this.stmtSearch = this.db.prepare(`
      SELECT DISTINCT conversation.*
      FROM message_fts
      JOIN conversation ON conversation.id = message_fts.conversation_id
      WHERE message_fts MATCH ?
      ORDER BY conversation.updated_at DESC, conversation.id ASC
    `)
    this.stmtSearchLike = this.db.prepare(`
      SELECT DISTINCT conversation.*
      FROM message
      JOIN conversation ON conversation.id = message.conversation_id
      WHERE message.parts LIKE ? ESCAPE '\\'
      ORDER BY conversation.updated_at DESC, conversation.id ASC
    `)
    this.stmtFindIds = this.db.prepare(`
      SELECT id FROM conversation WHERE id = ? OR (source_id = ? AND source_path = ?)
    `)
    this.stmtDeleteFts = this.db.prepare(`
      DELETE FROM message_fts WHERE conversation_id = ?
    `)
    this.stmtDeleteConversation = this.db.prepare(`
      DELETE FROM conversation WHERE id = ?
    `)
  }

  close(): void {
    if (this.db.isOpen) {
      this.db.close()
    }
  }

  withTransaction(fn: () => void): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      fn()
      this.db.exec('COMMIT')
    } catch (error) {
      if (this.db.isTransaction) {
        this.db.exec('ROLLBACK')
      }
      throw error
    }
  }

  upsertConversation(conversation: Conversation): void {
    this.stmtUpsertConversation.run(
      conversation.id,
      conversation.sourceId,
      conversation.sourcePath,
      conversation.title,
      conversation.workspace ?? null,
      conversation.gitBranch ?? null,
      JSON.stringify(conversation.models),
      conversation.createdAt,
      conversation.updatedAt,
      conversation.messageCount
    )
  }

  insertMessages(messages: Message[]): void {
    this.withTransaction(() => {
      this.insertMessagesUnlocked(messages)
    })
  }

  insertMessagesUnlocked(messages: Message[]): void {
    for (const message of messages) {
      this.stmtInsertMessage.run(
        message.id,
        message.conversationId,
        message.seq,
        message.role,
        message.createdAt,
        JSON.stringify(message.parts)
      )
      const text = partsToSearchText(message.parts)
      if (text) {
        this.stmtInsertFts.run(message.conversationId, message.id, text)
      }
    }
  }

  upsertResources(resources: Resource[]): void {
    this.withTransaction(() => {
      this.upsertResourcesUnlocked(resources)
    })
  }

  upsertResourcesUnlocked(resources: Resource[]): void {
    for (const resource of resources) {
      this.stmtInsertResource.run(
        resource.id,
        resource.conversationId,
        resource.mimeType ?? null,
        resource.localPath ?? null,
        resource.byteLength ?? null
      )
    }
  }

  deleteConversation(conversationId: string): void {
    this.stmtDeleteFts.run(conversationId)
    this.stmtDeleteConversation.run(conversationId)
  }

  replaceConversation(
    conversation: Conversation,
    messages: Message[],
    file?: SourceFileRef,
    resources: Resource[] = []
  ): void {
    const written: Conversation = {
      ...conversation,
      messageCount: messages.length
    }
    this.withTransaction(() => {
      const existing = this.stmtFindIds.all(written.id, written.sourceId, written.sourcePath)
      for (const row of existing) {
        this.deleteConversation(asString(row.id))
      }
      this.upsertConversation(written)
      this.insertMessagesUnlocked(messages)
      this.upsertResourcesUnlocked(resources)
      if (file) {
        this.setFingerprintUnlocked(
          {
            sourceId: written.sourceId,
            path: file.path,
            mtimeMs: file.mtimeMs,
            size: file.size
          },
          written.id
        )
      }
    })
  }

  getFingerprint(sourceId: string, path: string): FileFingerprint | undefined {
    const row = this.stmtGetFingerprint.get(sourceId, path)
    if (!row) return undefined
    return {
      sourceId: asString(row.source_id),
      path: asString(row.path),
      mtimeMs: asNumber(row.mtime_ms),
      size: asNumber(row.size)
    }
  }

  setFingerprint(fingerprint: FileFingerprint, conversationId: string): void {
    this.setFingerprintUnlocked(fingerprint, conversationId)
  }

  setFingerprintUnlocked(fingerprint: FileFingerprint, conversationId: string): void {
    this.stmtSetFingerprint.run(
      fingerprint.sourceId,
      fingerprint.path,
      fingerprint.mtimeMs,
      fingerprint.size,
      conversationId,
      Date.now()
    )
  }

  search(query: string): Conversation[] {
    const trimmed = query.trim()
    if (!trimmed) return []
    const graphemes = Array.from(trimmed)
    if (graphemes.length < 3) {
      const escaped = trimmed.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
      return this.stmtSearchLike.all(`%${escaped}%`).map(mapConversation)
    }
    const match = toFtsQuery(trimmed)
    return this.stmtSearch.all(match).map(mapConversation)
  }

  listConversations(options: ListConversationsOptions = {}): Conversation[] {
    const rows = options.sourceId
      ? this.stmtListBySource.all(options.sourceId)
      : this.stmtListAll.all()
    return rows.map(mapConversation)
  }

  getMessages(conversationId: string): Message[] {
    return this.stmtGetMessages.all(conversationId).map(mapMessage)
  }
}
