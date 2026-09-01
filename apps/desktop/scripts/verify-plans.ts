import type { Message, Part, Role } from '@agentdock/core'
import { extractPlanFilePaths, parsePlanMarkdown, projectPlans } from '../src/renderer/src/lib/plans.ts'
import {
  conversationMentionsPlanPath,
  isInsideAllowedPlanRoot,
  readWhitelistedPlanFile
} from '../../../packages/plugin-bridge/src/plan-file.ts'

function msg(id: string, role: Role, createdAt: number, parts: Part[]): Message {
  return { id, conversationId: 'c', seq: 0, role, createdAt, parts }
}

const createPlan = msg('a1', 'assistant', 10, [
  {
    kind: 'tool_call',
    name: 'CreatePlan',
    callId: 'cp1',
    input: {
      name: 'Plan and Changes tabs',
      overview: '在 Chat 模块加两个页签',
      plan: '# 方案\n\n拆成 Plan 与 Changes 两个视图。',
      todos: [
        { id: 'tabs', content: '加页签', status: 'pending' },
        { id: 'verify', content: '写校验脚本', status: 'in_progress' }
      ]
    }
  }
])

const fromCreate = projectPlans([createPlan])
if (fromCreate.length !== 1) throw new Error(`CreatePlan should yield 1 plan, got ${fromCreate.length}`)
const created = fromCreate[0]!
if (created.title !== 'Plan and Changes tabs') throw new Error(`title: ${created.title}`)
if (created.overview !== '在 Chat 模块加两个页签') throw new Error('overview missing')
if (!created.body.includes('拆成 Plan 与 Changes')) throw new Error('plan body missing')
if (created.source !== 'tool') throw new Error(`CreatePlan source should be tool, got ${created.source}`)
if (created.todos.length !== 2 || created.todos[1]?.status !== 'in_progress') {
  throw new Error('CreatePlan todos missing')
}

const exitPlan = msg('a2', 'assistant', 20, [
  {
    kind: 'tool_call',
    name: 'ExitPlanMode',
    callId: 'ex1',
    input: {
      plan: '# Claude 计划\n\n从 ExitPlanMode 取出全文。',
      planFilePath: '~/.claude/plans/exit-demo.md'
    }
  }
])
const fromExit = projectPlans([exitPlan])
if (fromExit.length !== 1) throw new Error(`ExitPlanMode should yield 1 plan, got ${fromExit.length}`)
const exited = fromExit[0]!
if (exited.source !== 'disk') throw new Error(`ExitPlanMode with path should be disk, got ${exited.source}`)
if (exited.path !== '~/.claude/plans/exit-demo.md') throw new Error(`path: ${exited.path}`)
if (!exited.body.includes('ExitPlanMode')) throw new Error('ExitPlanMode body missing')

const pathOnly = msg('u1', 'user', 30, [
  {
    kind: 'text',
    text: '继续执行 ~/.cursor/plans/plan_and_changes_tabs_de286e92.plan.md'
  }
])
const fromPath = projectPlans([pathOnly])
if (fromPath.length !== 1) throw new Error(`plan.md path should yield 1 plan, got ${fromPath.length}`)
if (fromPath[0]?.source !== 'disk') throw new Error('path-only source should be disk')
if (!fromPath[0]?.path?.includes('plan_and_changes_tabs_de286e92.plan.md')) {
  throw new Error(`extracted path: ${fromPath[0]?.path}`)
}

const claudePlanLine = msg('s1', 'system', 31, [
  { kind: 'text', text: '[plan] ~/.claude/plans/session-plan.md' }
])
const fromClaudeAtt = projectPlans([claudePlanLine])
if (fromClaudeAtt.length !== 1 || fromClaudeAtt[0]?.path !== '~/.claude/plans/session-plan.md') {
  throw new Error(`claude [plan] path: ${fromClaudeAtt[0]?.path}`)
}

const merged = projectPlans([createPlan, pathOnly])
if (merged.length !== 1) throw new Error(`CreatePlan + matching path should merge, got ${merged.length}`)
if (merged[0]?.source !== 'disk') throw new Error('merged source should be disk')
if (!merged[0]?.body.includes('拆成 Plan 与 Changes')) throw new Error('merged should keep tool body')
if (merged[0]?.title !== 'Plan and Changes tabs') throw new Error('merged should keep CreatePlan name')

const parsed = parsePlanMarkdown(`---
name: Disk title
overview: from frontmatter
todos:
  - id: tabs
    content: ViewMode 扩成 plan/changes
    status: completed
isProject: false
---
# 正文

磁盘优先。
`)
if (parsed.name !== 'Disk title') throw new Error(`frontmatter name: ${parsed.name}`)
if (parsed.overview !== 'from frontmatter') throw new Error(`frontmatter overview: ${parsed.overview}`)
if (parsed.todos.length !== 1 || parsed.todos[0]?.status !== 'completed') {
  throw new Error('frontmatter todos')
}
if (!parsed.body.includes('磁盘优先')) throw new Error(`frontmatter body: ${parsed.body}`)

const extracted = extractPlanFilePaths('see ~/.cursor/plans/foo_abc123.plan.md and /Users/me/.claude/plans/bar.md')
if (extracted.length !== 2) throw new Error(`extractPlanFilePaths: ${extracted.join('|')}`)

const longPlan = `# 实施计划\n\n${'甲'.repeat(400)}`
const shortPlan = `# 实施计划\n\n还不够长`
const noKeyword = `# Summary\n\n${'甲'.repeat(400)}`
const notFirst = `先说两句\n\n# 实施计划\n\n${'甲'.repeat(400)}`

const hit = projectPlans([msg('h1', 'assistant', 40, [{ kind: 'text', text: longPlan }])])
if (hit.length !== 1 || hit[0]?.source !== 'heuristic') {
  throw new Error(`Codex heuristic should hit, got ${hit.length} ${hit[0]?.source}`)
}

const misses = [
  projectPlans([msg('m1', 'assistant', 41, [{ kind: 'text', text: shortPlan }])]),
  projectPlans([msg('m2', 'assistant', 42, [{ kind: 'text', text: noKeyword }])]),
  projectPlans([msg('m3', 'assistant', 43, [{ kind: 'text', text: notFirst }])])
]
for (const [index, rows] of misses.entries()) {
  if (rows.length !== 0) throw new Error(`Codex heuristic miss #${index} yielded ${rows.length}`)
}

const skippedHeuristic = projectPlans([
  createPlan,
  msg('h2', 'assistant', 50, [{ kind: 'text', text: longPlan }])
])
if (skippedHeuristic.length !== 1 || skippedHeuristic[0]?.source !== 'tool') {
  throw new Error('heuristic must not run when a structured plan already exists')
}

const home = '/Users/me'
const diskPath = '/Users/me/.cursor/plans/foo.plan.md'
const mentioned = [msg('u2', 'user', 1, [{ kind: 'text', text: '~/.cursor/plans/foo.plan.md' }])]
if (!conversationMentionsPlanPath(mentioned, '~/.cursor/plans/foo.plan.md', home)) {
  throw new Error('tilde path should be mentioned')
}
if (!conversationMentionsPlanPath(mentioned, diskPath, home)) {
  throw new Error('absolute path should match tilde mention')
}
if (conversationMentionsPlanPath(mentioned, '~/.cursor/plans/other.plan.md', home)) {
  throw new Error('unmentioned plan path must be rejected')
}
if (!isInsideAllowedPlanRoot(diskPath, ['/Users/me/.cursor/plans', '/Users/me/.claude/plans'])) {
  throw new Error('file inside cursor plans should be allowed')
}
if (isInsideAllowedPlanRoot('/etc/passwd', ['/Users/me/.cursor/plans'])) {
  throw new Error('/etc/passwd must not be inside plan roots')
}

const okText = await readWhitelistedPlanFile('~/.cursor/plans/foo.plan.md', mentioned, {
  home,
  readFile: async (target) => {
    if (target !== diskPath) throw new Error(`unexpected read ${target}`)
    return '# from disk'
  },
  realpath: async (target) => target
})
if (okText !== '# from disk') throw new Error(`whitelist read: ${okText}`)

let denied = false
try {
  await readWhitelistedPlanFile('~/.cursor/plans/foo.plan.md', [], {
    home,
    readFile: async () => '# no',
    realpath: async (target) => target
  })
} catch {
  denied = true
}
if (!denied) throw new Error('unmentioned path must throw')

let escaped = false
try {
  await readWhitelistedPlanFile('~/.cursor/plans/foo.plan.md', mentioned, {
    home,
    readFile: async () => '# no',
    realpath: async (target) => (target.endsWith('foo.plan.md') ? '/etc/passwd.plan.md' : target)
  })
} catch {
  escaped = true
}
if (!escaped) throw new Error('realpath outside roots must throw')

console.log('ok: plans CreatePlan / ExitPlanMode / disk path / Codex miss / whitelist')
