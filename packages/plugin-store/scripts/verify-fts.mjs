import { SqliteStore } from '../src/database.ts'

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

  if (rawCount !== 1) {
    throw new Error(`raw FTS MATCH '${query}' expected 1, got ${rawCount}`)
  }
  if (hits.length !== 1 || hits[0]?.id !== 'conv-1') {
    throw new Error(`store.search('${query}') expected 1 conversation, got ${JSON.stringify(hits)}`)
  }

  console.log(`ok: FTS MATCH '${query}' hit 「${sentence}」`)
} finally {
  store.close()
}
