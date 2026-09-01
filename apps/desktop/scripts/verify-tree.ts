import type { Conversation } from '@agentdock/core'
import {
  flattenSearchRows,
  flattenSidebarRows,
  sessionRowKey,
  sourceRowKey,
  workspaceRowKey
} from '../src/renderer/src/lib/tree.ts'

function conv(id: string, sourceId: string, workspace: string): Conversation {
  return {
    id,
    sourceId,
    sourcePath: `/${id}.jsonl`,
    title: id,
    workspace,
    models: [],
    createdAt: 1,
    updatedAt: 2,
    messageCount: 1
  }
}

const a1 = conv('a1', 'cursor', '/repo/a')
const a2 = conv('a2', 'cursor', '/repo/a')
const b1 = conv('b1', 'cursor', '/repo/b')
const tree = [
  {
    id: 'cursor',
    label: 'Cursor',
    count: 3,
    workspaces: [
      { workspace: '/repo/a', label: 'a', count: 2, conversations: [a1, a2] },
      { workspace: '/repo/b', label: 'b', count: 1, conversations: [b1] }
    ]
  }
]

const expanded = flattenSidebarRows(tree, new Set())
if (expanded.map((row) => row.kind).join(',') !== 'source,workspace,session,session,workspace,session') {
  throw new Error(`expanded kinds: ${expanded.map((row) => row.kind).join(',')}`)
}
if (expanded[0]?.key !== sourceRowKey('cursor')) throw new Error('source key')
if (expanded[1]?.key !== workspaceRowKey('cursor', '/repo/a')) throw new Error('workspace key')
const row2 = expanded[2]
if (row2?.kind !== 'session' || !row2.nested) throw new Error('nested session')

const sourceCollapsed = flattenSidebarRows(tree, new Set([sourceRowKey('cursor')]))
if (sourceCollapsed.length !== 1 || sourceCollapsed[0]?.kind !== 'source') {
  throw new Error(`source collapsed: ${sourceCollapsed.length}`)
}

const wsCollapsed = flattenSidebarRows(tree, new Set([workspaceRowKey('cursor', '/repo/a')]))
if (wsCollapsed.map((row) => row.kind).join(',') !== 'source,workspace,workspace,session') {
  throw new Error(`ws collapsed: ${wsCollapsed.map((row) => row.kind).join(',')}`)
}

const hits = flattenSearchRows([a1, b1])
const hit0 = hits[0]
if (hits.length !== 2 || hit0?.kind !== 'session' || hit0.nested !== false) throw new Error('search nested')
if (hit0.key !== sessionRowKey('a1')) throw new Error('search key')

console.log('ok: sidebar flatten')
