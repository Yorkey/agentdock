import {
  groupAssistantWork,
  hasAssistantWork,
  projectDialogue,
  projectExchanges,
  summarizeTool,
  summarizeWork,
  textsOf,
  toolsOf
} from '../src/renderer/src/lib/dialogue.ts'
import type { Message } from '@chats/core'

const messages: Message[] = [
  {
    id: 's1',
    conversationId: 'c',
    seq: 0,
    role: 'system',
    createdAt: 1,
    parts: [{ kind: 'text', text: 'token_count input=1 cached=0 output=2 reasoning=0 total=3' }]
  },
  {
    id: 'u1',
    conversationId: 'c',
    seq: 1,
    role: 'user',
    createdAt: 2,
    parts: [{ kind: 'text', text: '添加 operateTypeList' }]
  },
  {
    id: 'a1',
    conversationId: 'c',
    seq: 2,
    role: 'assistant',
    createdAt: 3,
    parts: [{ kind: 'tool_call', name: 'Bash', callId: 't1', input: { command: 'git show 64a3b8', description: 'Show diff' } }]
  },
  {
    id: 't1',
    conversationId: 'c',
    seq: 3,
    role: 'tool',
    createdAt: 4,
    parts: [{ kind: 'tool_result', callId: 't1', output: 'diff --git a/x' }]
  },
  {
    id: 'a2',
    conversationId: 'c',
    seq: 4,
    role: 'assistant',
    createdAt: 5,
    parts: [{ kind: 'text', text: 'Found it. 开始改函数。' }]
  }
]

const items = projectDialogue(messages)
const turns = items.filter((item) => item.kind === 'turn')
if (turns.length !== 2) {
  throw new Error(`expected 2 turns, got ${turns.length}`)
}
const user = turns[0]
const assistant = turns[1]
if (user?.kind !== 'turn' || user.role !== 'user' || textsOf(user)[0] !== '添加 operateTypeList') {
  throw new Error('user turn mismatch')
}
if (assistant?.kind !== 'turn' || assistant.role !== 'assistant') {
  throw new Error('assistant turn missing')
}
if (textsOf(assistant).join('') !== 'Found it. 开始改函数。') {
  throw new Error(`assistant text mismatch: ${textsOf(assistant).join('|')}`)
}
const tools = toolsOf(assistant)
if (tools.length !== 1 || tools[0]?.name !== 'Bash') {
  throw new Error('tool not merged into assistant turn')
}
if (tools[0]?.output !== 'diff --git a/x') {
  throw new Error('tool result not attached')
}
if (assistant.blocks[0]?.kind !== 'tool' || assistant.blocks[1]?.kind !== 'text') {
  throw new Error('blocks should keep tool-then-text order')
}

const summary = summarizeTool('Read', { file_path: '/a/b/pages.ts' })
if (summary !== 'b/pages.ts' && summary !== 'pages.ts' && !summary.includes('pages.ts')) {
  throw new Error(`bad read summary: ${summary}`)
}

const thread = projectExchanges(items)
if (thread.length !== 1 || thread[0]?.kind !== 'exchange') {
  throw new Error(`expected 1 exchange, got ${thread.length}`)
}
const exchange = thread[0]
if (exchange.work.probes.length !== 1 || exchange.work.probes[0]?.tools[0]?.name !== 'Bash') {
  throw new Error('exchange should wrap bash as one probe')
}
if (exchange.work.reply.join('') !== 'Found it. 开始改函数。') {
  throw new Error(`reply mismatch: ${exchange.work.reply.join('|')}`)
}

const grouped = groupAssistantWork([
  { kind: 'text', text: '正在核验两处问题。' },
  { kind: 'tool', tool: { name: 'Grep', summary: 'foo', input: {}, diffs: [] } },
  { kind: 'tool', tool: { name: 'Read', summary: 'a.ts', input: {}, diffs: [] } },
  { kind: 'text', text: '改用 --cd 重新派发。' },
  { kind: 'tool', tool: { name: 'Bash', summary: 'codex', input: {}, diffs: [] } },
  { kind: 'text', text: '已经修好了。' }
])
if (grouped.probes.length !== 2) {
  throw new Error(`expected 2 probes, got ${grouped.probes.length}`)
}
if (!grouped.probes[0]?.title.includes('核验') || grouped.probes[0].tools.length !== 2) {
  throw new Error('first probe should be working note + grep/read')
}
if (!grouped.probes[1]?.title.includes('重新派发') || grouped.probes[1].tools[0]?.name !== 'Bash') {
  throw new Error('second probe should be bash')
}
if (grouped.reply.join('') !== '已经修好了。') {
  throw new Error('trailing text should be the user-facing reply')
}
if (!hasAssistantWork(grouped)) {
  throw new Error('grouped work should count as assistant work')
}
const workLine = summarizeWork(grouped)
if (!workLine.includes('搜索') || !workLine.includes('读取') || !workLine.includes('执行')) {
  throw new Error(`bad work summary: ${workLine}`)
}

console.log('ok: dialogue projects 5 raw messages → 1 exchange (user + probe + reply)')
