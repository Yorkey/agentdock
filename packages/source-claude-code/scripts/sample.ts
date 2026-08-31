import { claudeCodeSource } from '../src/source.ts'

function previewText(text: string, max = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max)}…`
}

function previewParts(parts: { kind: string; text?: string; name?: string }[]): string {
  return parts
    .slice(0, 6)
    .map((part) => {
      if (part.kind === 'text' || part.kind === 'reasoning') {
        return `${part.kind}:${previewText(part.text ?? '', 80)}`
      }
      if (part.kind === 'tool_call') return `tool_call:${part.name}`
      if (part.kind === 'tool_result') return 'tool_result'
      return part.kind
    })
    .join(' | ')
}

const refs = []
for await (const ref of claudeCodeSource.discover()) {
  refs.push(ref)
}

console.log(`discover: ${refs.length} jsonl files`)

const sessions = refs
  .filter((ref) => !ref.path.includes('/subagents/'))
  .sort((a, b) => a.size - b.size)

const samples = []
const smallest = sessions[0]
if (smallest) samples.push(smallest)
const titled = sessions.find((ref) => ref.path.endsWith('96f70129-df47-495b-b55b-bd8a72c8fd94.jsonl'))
  ?? sessions.find((ref) => ref.size > 200_000 && ref.size < 900_000)
if (titled && titled.path !== smallest?.path) samples.push(titled)
else if (sessions[1]) samples.push(sessions[1])

if (samples.length === 0) {
  console.log('no ~/.claude/projects/**/*.jsonl found; parser still implemented')
  process.exit(0)
}

for (const ref of samples) {
  const messages = []
  for await (const message of claudeCodeSource.parse(ref)) {
    messages.push(message)
  }
  const conversation = claudeCodeSource.meta(ref, messages)
  console.log('\n---')
  console.log(
    JSON.stringify(
      {
        path: ref.path,
        size: ref.size,
        id: conversation.id,
        sourceId: conversation.sourceId,
        title: conversation.title,
        workspace: conversation.workspace,
        gitBranch: conversation.gitBranch,
        models: conversation.models,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messageCount
      },
      null,
      2
    )
  )
  for (const message of messages.slice(0, 3)) {
    console.log(
      `#${message.seq} ${message.role} ${new Date(message.createdAt).toISOString()} parts=${message.parts.length}`
    )
    console.log('  ', previewParts(message.parts))
  }
}
