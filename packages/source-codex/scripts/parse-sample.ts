import { createCodexSource } from '../src/source.ts'

const missing = createCodexSource({ root: '/tmp/.codex-sessions-missing-for-verify' })
let missingCount = 0
for await (const _ref of missing.discover()) {
  missingCount += 1
}
if (missingCount !== 0) {
  console.error('expected empty discover for missing root, got', missingCount)
  process.exit(1)
}
console.log('missing-root discover: 0 (ok)')

const source = createCodexSource()
const files: { path: string; mtimeMs: number; size: number }[] = []

try {
  for await (const ref of source.discover()) {
    files.push(ref)
  }
} catch (error) {
  console.error('discover failed:', error)
  process.exit(0)
}

if (files.length === 0) {
  console.log('No ~/.codex/sessions/**/*.jsonl files found; skip.')
  process.exit(0)
}

files.sort((a, b) => a.size - b.size)
const richer = files.find((file) => file.size > 200_000 && file.size < 600_000)
const fallback = files[Math.min(1, files.length - 1)]
const picks = [files[0], richer ?? fallback].filter(
  (file, index, list): file is (typeof files)[number] =>
    Boolean(file) && list.findIndex((item) => item?.path === file.path) === index
)

for (const ref of picks) {
  const messages = []
  for await (const message of source.parse(ref)) {
    messages.push(message)
  }
  const meta = source.meta(ref, messages)
  const roles: Record<string, number> = {}
  const parts: Record<string, number> = {}
  for (const message of messages) {
    roles[message.role] = (roles[message.role] ?? 0) + 1
    for (const part of message.parts) {
      parts[part.kind] = (parts[part.kind] ?? 0) + 1
    }
  }
  console.log(
    JSON.stringify(
      {
        path: ref.path,
        size: ref.size,
        meta: {
          id: meta.id,
          sourceId: meta.sourceId,
          title: meta.title,
          workspace: meta.workspace,
          gitBranch: meta.gitBranch,
          models: meta.models,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
          messageCount: meta.messageCount
        },
        roles,
        parts
      },
      null,
      2
    )
  )
}
