import { SEARCH_TEXT_LIMIT, partsToSearchText } from '../../core/src/helpers.ts'
import { SqliteStore } from '../src/database.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const sentence = '请在扩展页面里打开设置后再试一次'
const query = '扩展页面'

const store = new SqliteStore(':memory:')
try {
  store.replaceConversation(
    {
      id: 'conv-1',
      sourceId: 'test',
      sourcePath: '/tmp/demo.jsonl',
      title: '中文检索',
      models: [],
      createdAt: 1,
      updatedAt: 1,
      messageCount: 1
    },
    [
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        seq: 0,
        role: 'user',
        createdAt: 1,
        parts: [{ kind: 'text', text: sentence }]
      }
    ],
    { path: '/tmp/demo.jsonl', mtimeMs: 1, size: sentence.length }
  )

  const raw = store.db.prepare('SELECT count(*) AS c FROM message_fts WHERE message_fts MATCH ?').get(query)
  const rawCount = raw && typeof raw.c === 'number' ? raw.c : Number(raw?.c ?? 0)
  const hits = store.search(query)

  assert(rawCount === 1, `raw FTS MATCH '${query}' expected 1, got ${rawCount}`)
  assert(hits.length === 1 && hits[0]?.id === 'conv-1', `store.search('${query}') expected 1 conversation, got ${JSON.stringify(hits)}`)
  console.log(`ok: FTS MATCH '${query}' hit 「${sentence}」`)

  store.search('扩')
  store.search('ab')
  console.log('ok: short search uses FTS (no throw)')

  const tail = 'zztailonlytoken'
  const output = `${'alphaheadtoken '.repeat(200)}${tail}`
  assert(output.length > SEARCH_TEXT_LIMIT, 'fixture output should exceed SEARCH_TEXT_LIMIT')
  const indexed = partsToSearchText([{ kind: 'tool_result', output }])
  assert(indexed.includes('alphaheadtoken'), 'indexed tool_result should keep the head')
  assert(!indexed.includes(tail), 'indexed tool_result should drop the tail past 2KB')
  assert(
    !partsToSearchText([{ kind: 'diff', path: 'src/a.ts', patch: output }]).includes(tail),
    'indexed diff.patch should drop the tail past 2KB'
  )

  store.replaceConversation(
    {
      id: 'conv-2',
      sourceId: 'test',
      sourcePath: '/tmp/tool.jsonl',
      title: '截断',
      models: [],
      createdAt: 2,
      updatedAt: 2,
      messageCount: 1
    },
    [
      {
        id: 'msg-tool',
        conversationId: 'conv-2',
        seq: 0,
        role: 'tool',
        createdAt: 2,
        parts: [{ kind: 'tool_result', output }]
      }
    ],
    { path: '/tmp/tool.jsonl', mtimeMs: 2, size: output.length }
  )
  assert(store.search('alphaheadtoken').some((row) => row.id === 'conv-2'), 'head of tool_result should be searchable')
  assert(!store.search(tail).some((row) => row.id === 'conv-2'), 'tail of tool_result must not be searchable')
  console.log('ok: FTS truncates tool_result / diff.patch')

  const fingerprints = store.listFingerprints()
  assert(
    fingerprints.some((fp) => fp.path === '/tmp/demo.jsonl' && fp.size === sentence.length),
    `listFingerprints missing demo file: ${JSON.stringify(fingerprints)}`
  )
  console.log('ok: listFingerprints loads scan_state in one query')

  const conv = {
    id: 'conv-append',
    sourceId: 'test',
    sourcePath: '/tmp/append.jsonl',
    title: '追加',
    models: [],
    createdAt: 3,
    updatedAt: 3,
    messageCount: 2
  }
  const first = [
    {
      id: 'a-1',
      conversationId: 'conv-append',
      seq: 0,
      role: 'user',
      createdAt: 3,
      parts: [{ kind: 'text', text: 'first line of the session' }]
    },
    {
      id: 'a-2',
      conversationId: 'conv-append',
      seq: 1,
      role: 'assistant',
      createdAt: 4,
      parts: [{ kind: 'text', text: 'second line of the session' }]
    }
  ]
  store.replaceConversation(conv, first, { path: '/tmp/append.jsonl', mtimeMs: 3, size: 10 })
  const before = store.db.prepare('SELECT rowid AS rid, id FROM message WHERE conversation_id = ? ORDER BY seq').all('conv-append')

  const appended = [
    ...first,
    {
      id: 'a-3',
      conversationId: 'conv-append',
      seq: 2,
      role: 'user',
      createdAt: 5,
      parts: [{ kind: 'text', text: 'third line appended later' }]
    }
  ]
  store.replaceConversation(
    { ...conv, updatedAt: 5, messageCount: 3, title: '追加后' },
    appended,
    { path: '/tmp/append.jsonl', mtimeMs: 5, size: 20 }
  )
  const after = store.db.prepare('SELECT rowid AS rid, id FROM message WHERE conversation_id = ? ORDER BY seq').all('conv-append')
  assert(after.length === 3, `append expected 3 messages, got ${after.length}`)
  assert(after[0]?.id === 'a-1' && after[0]?.rid === before[0]?.rid, 'prefix message 0 should keep rowid')
  assert(after[1]?.id === 'a-2' && after[1]?.rid === before[1]?.rid, 'prefix message 1 should keep rowid')
  assert(after[2]?.id === 'a-3', 'new message should be inserted')
  const appendedHits = store.search('appended later')
  assert(appendedHits.some((row) => row.id === 'conv-append'), 'appended message should be in FTS')
  console.log('ok: replaceConversation appends by message id')

  store.replaceConversation(
    { ...conv, title: '重写' },
    [
      {
        id: 'b-1',
        conversationId: 'conv-append',
        seq: 0,
        role: 'user',
        createdAt: 6,
        parts: [{ kind: 'text', text: 'rewritten from scratch here' }]
      }
    ],
    { path: '/tmp/append.jsonl', mtimeMs: 6, size: 30 }
  )
  const rewritten = store.getMessages('conv-append')
  assert(rewritten.length === 1 && rewritten[0]?.id === 'b-1', 'non-append rewrite should replace all messages')
  console.log('ok: replaceConversation still full-replaces when ids are not a prefix')
} finally {
  store.close()
}
