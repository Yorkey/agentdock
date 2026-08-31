import { Service, type Context } from 'cordis'
import type { Conversation, FileFingerprint, Message, Resource, SourceFileRef } from '@chats/core'
import { SqliteStore, type ListConversationsOptions } from './database.ts'

export type { ListConversationsOptions }
export { openStoreDatabase, SqliteStore } from './database.ts'
export { PRAGMA_SQL, SCHEMA_SQL } from './schema.ts'

export interface StoreConfig {
  path: string
}

export class StoreService extends Service {
  static provide = 'store'
  static name = 'store'

  config: StoreConfig
  impl: SqliteStore

  constructor(ctx: Context, config: StoreConfig) {
    super(ctx, 'store')
    this.config = config
    this.impl = new SqliteStore(config.path)
    this.ctx.effect(() => {
      return () => {
        this.impl.close()
      }
    })
  }

  upsertConversation(conversation: Conversation): void {
    this.impl.upsertConversation(conversation)
  }

  insertMessages(messages: Message[]): void {
    this.impl.insertMessages(messages)
  }

  replaceConversation(
    conversation: Conversation,
    messages: Message[],
    file?: SourceFileRef,
    resources: Resource[] = []
  ): void {
    this.impl.replaceConversation(conversation, messages, file, resources)
  }

  getFingerprint(sourceId: string, path: string): FileFingerprint | undefined {
    return this.impl.getFingerprint(sourceId, path)
  }

  setFingerprint(fingerprint: FileFingerprint, conversationId: string): void {
    this.impl.setFingerprint(fingerprint, conversationId)
  }

  search(query: string): Conversation[] {
    return this.impl.search(query)
  }

  listConversations(options: ListConversationsOptions = {}): Conversation[] {
    return this.impl.listConversations(options)
  }

  getMessages(conversationId: string): Message[] {
    return this.impl.getMessages(conversationId)
  }

  upsertResources(resources: Resource[]): void {
    this.impl.upsertResources(resources)
  }

  close(): void {
    this.impl.close()
  }
}

declare module 'cordis' {
  interface Context {
    store: StoreService
  }
}

export default StoreService
