/**
 * Optional smoke parse: print title / createdAt / parts for one real transcript.
 * Missing ~/.cursor/projects is not a failure.
 */
import { cursorSource, slugToWorkspacePath } from '../src/index.ts'

const samples = [
  'Volumes-WY-my-projects-chats',
  'Users-wangyu-codex',
  '1782092789329'
]

console.log('slug → workspace')
for (const slug of samples) {
  console.log(`  ${slug}`)
  console.log(`  → ${slugToWorkspacePath(slug)}`)
}

const refs: Array<{ path: string; mtimeMs: number; size: number }> = []
try {
  for await (const ref of cursorSource.discover()) {
    refs.push(ref)
  }
} catch (error) {
  console.error('discover failed', error)
  process.exit(0)
}

console.log(`\ndiscover: ${refs.length} jsonl file(s)`)
if (refs.length === 0) {
  console.log('no transcripts found (ok)')
  process.exit(0)
}

const preferred = refs.find((ref) => ref.path.includes('Volumes-WY-my-projects-chats') && !ref.path.includes('subagents'))
const target = preferred ?? refs[0]!

const messages = []
for await (const message of cursorSource.parse(target)) {
  messages.push(message)
}
const conversation = cursorSource.meta(target, messages)

console.log('\nsample file:', target.path)
console.log('title:', conversation.title)
console.log('workspace:', conversation.workspace)
console.log('createdAt:', conversation.createdAt, new Date(conversation.createdAt).toString())
console.log('updatedAt:', conversation.updatedAt, new Date(conversation.updatedAt).toString())
console.log('messageCount:', conversation.messageCount)
console.log('id:', conversation.id)

const firstUser = messages.find((message) => message.role === 'user')
const firstAssistant = messages.find((message) => message.role === 'assistant')
for (const label of [
  ['first user', firstUser],
  ['first assistant', firstAssistant]
] as const) {
  const message = label[1]
  console.log(`\n${label[0]} seq=${message?.seq} parts=${message?.parts.length}`)
  for (const part of message?.parts.slice(0, 4) ?? []) {
    if (part.kind === 'text' || part.kind === 'reasoning') {
      console.log(`  [${part.kind}] ${part.text.slice(0, 180).replaceAll('\n', '\\n')}`)
    } else if (part.kind === 'tool_call') {
      console.log(`  [tool_call] ${part.name}`)
    } else {
      console.log(`  [${part.kind}]`)
    }
  }
}
