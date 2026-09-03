import type { Conversation } from '@agentdock/core'
import { formatConversationCite } from '../src/renderer/src/lib/format.ts'
import { stickySourcePin } from '../src/renderer/src/lib/sticky-source.ts'
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

if (stickySourcePin([0, 200], 0, 32) !== null) throw new Error('pin hidden at top')
if (stickySourcePin([0, 200], 31, 32) !== null) throw new Error('pin hidden until scrolled out')
const justOut = stickySourcePin([0, 200], 32, 32)
if (justOut?.sourceIndex !== 0 || justOut.translateY !== 0) throw new Error('pin after source out')
const pushing = stickySourcePin([0, 200], 180, 32)
if (pushing?.sourceIndex !== 0 || pushing.translateY !== -12) throw new Error(`pin push: ${pushing?.translateY}`)
const nextFlush = stickySourcePin([0, 200], 200, 32)
if (nextFlush !== null) throw new Error('pin hidden when next source is at top')
if (stickySourcePin([0, 200], 210, 32) !== null) throw new Error('pin hidden while next source occupies top')
const nextPinned = stickySourcePin([0, 200], 232, 32)
if (nextPinned?.sourceIndex !== 1 || nextPinned.translateY !== 0) throw new Error('next source pinned')
if (stickySourcePin([], 100, 32) !== null) throw new Error('empty sources')

const fullCite = formatConversationCite(
  {
    title: 'Hello',
    workspace: '/abs/workspace',
    gitBranch: 'feat/x',
    models: ['model-a', 'model-b'],
    sourcePath: '/abs/sourcePath'
  },
  'Cursor'
)
if (
  fullCite !==
  '# Hello\n\n- 来源：Cursor\n- 工作区：/abs/workspace\n- 分支：feat/x\n- 模型：model-a · model-b\n- 会话文件：/abs/sourcePath'
) {
  throw new Error(`cite full:\n${fullCite}`)
}
const omitted = formatConversationCite(
  { title: '  ', workspace: '', models: [], sourcePath: '/p.jsonl' },
  'Cursor'
)
if (omitted !== '# 未命名会话\n\n- 来源：Cursor\n- 会话文件：/p.jsonl') {
  throw new Error(`cite omit:\n${omitted}`)
}
if (omitted.includes('- 分支：') || omitted.includes('- 工作区：') || omitted.includes('- 模型：')) {
  throw new Error('cite should omit empty fields')
}

console.log('ok: sidebar flatten')
