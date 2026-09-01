import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import { StoreService } from '@agentdock/plugin-store'
import { SourceRegistry } from '@agentdock/plugin-registry'
import cursorSourcePlugin from '@agentdock/source-cursor'
import claudeCodeSourcePlugin from '@agentdock/source-claude-code'
import codexSourcePlugin from '@agentdock/source-codex'
import { createInlineScanEngine } from '../src/worker/inline-engine.ts'

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'agentdock-dry-scan-'))
  const dbPath = join(dir, 'agentdock.sqlite')
  const ctx = new Context()
  try {
    await ctx.plugin(StoreService, { path: dbPath })
    await ctx.plugin(SourceRegistry)
    await ctx.plugin(cursorSourcePlugin)
    await ctx.plugin(claudeCodeSourcePlugin)
    await ctx.plugin(codexSourcePlugin)
    ctx.sources.useEngine(createInlineScanEngine())

    const sources = ctx.sources.list().map((source) => `${source.id} (${source.label})`)
    console.log('sources:', sources.join(', ') || '(none)')

    const result = await ctx.sources.scan()
    console.log('scan:', result)

    const second = await ctx.sources.scan()
    console.log('scan again (fingerprint skip):', second)

    const counts = new Map<string, number>()
    for (const source of ctx.sources.list()) {
      counts.set(source.id, 0)
    }
    for (const conversation of ctx.store.listConversations()) {
      counts.set(conversation.sourceId, (counts.get(conversation.sourceId) ?? 0) + 1)
    }
    console.log('conversations per source:')
    for (const [sourceId, count] of counts) {
      console.log(`  ${sourceId}: ${count}`)
    }
    console.log(`  total: ${ctx.store.listConversations().length}`)
  } finally {
    try {
      ctx.store.close()
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true })
  }
}

await main()
