import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseClaudeSession } from '../src/parse.ts'

const dir = await mkdtemp(join(tmpdir(), 'claude-parse-'))
const path = join(dir, 'session.jsonl')

const lines = [
  JSON.stringify({
    type: 'user',
    uuid: 'u1',
    parentUuid: null,
    timestamp: '2024-01-01T00:00:00.000Z',
    sessionId: 'sess-1',
    cwd: '/tmp/proj',
    gitBranch: 'main',
    message: { role: 'user', content: 'hello world' }
  }),
  JSON.stringify({
    type: 'assistant',
    uuid: 'a1',
    parentUuid: 'u1',
    timestamp: '2024-01-01T00:00:01.000Z',
    sessionId: 'sess-1',
    message: {
      role: 'assistant',
      model: 'claude-opus',
      content: [{ type: 'text', text: 'hi there' }]
    }
  }),
  JSON.stringify({
    type: 'assistant',
    uuid: 'side-1',
    parentUuid: 'u1',
    isSidechain: true,
    timestamp: '2024-01-01T00:00:02.000Z',
    sessionId: 'sess-1',
    message: { role: 'assistant', content: [{ type: 'text', text: 'side note' }] }
  }),
  JSON.stringify({
    type: 'queue-operation',
    uuid: 'q1',
    timestamp: '2024-01-01T00:00:03.000Z',
    sessionId: 'sess-1'
  }),
  JSON.stringify({
    type: 'custom-title',
    customTitle: 'Streamed title',
    timestamp: '2024-01-01T00:00:04.000Z',
    sessionId: 'sess-1'
  }),
  '{not json',
  JSON.stringify('skip-non-object')
]

try {
  await writeFile(path, `${lines.join('\n')}\n`)
  const parsed = await parseClaudeSession(
    { path, mtimeMs: 1, size: 100 },
    'claude-code'
  )

  if (parsed.meta.title !== 'Streamed title') {
    throw new Error(`title: ${parsed.meta.title}`)
  }
  if (parsed.meta.workspace !== '/tmp/proj') {
    throw new Error(`workspace: ${parsed.meta.workspace}`)
  }
  if (parsed.meta.gitBranch !== 'main') {
    throw new Error(`gitBranch: ${parsed.meta.gitBranch}`)
  }
  if (parsed.meta.sessionId !== 'sess-1') {
    throw new Error(`sessionId: ${parsed.meta.sessionId}`)
  }
  if (parsed.meta.models.join(',') !== 'claude-opus') {
    throw new Error(`models: ${parsed.meta.models.join(',')}`)
  }
  if (parsed.messages.length !== 3) {
    throw new Error(`messages: ${parsed.messages.length}`)
  }

  const texts = parsed.messages.map((message) => {
    const part = message.parts[0]
    return part && 'text' in part ? part.text : ''
  })
  if (texts[0] !== 'hello world' || texts[1] !== 'hi there' || texts[2] !== 'side note') {
    throw new Error(`order: ${JSON.stringify(texts)}`)
  }

  console.log('ok: parseClaudeSession streams jsonl into the parent tree')
} finally {
  await rm(dir, { recursive: true, force: true })
}
