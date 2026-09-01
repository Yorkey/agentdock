import type { Message } from '@agentdock/core'
import {
  deriveTrajectoryTimeline,
  hitTestLane,
  laneTimelineSpans,
  projectTrajectory,
  SEARCH_DETAIL_LIMIT,
  timelineMode
} from '../src/renderer/src/lib/trajectory.ts'

const t0 = Date.parse('2026-09-01T13:44:15Z')
const hour = 60 * 60 * 1000

function msg(
  id: string,
  seq: number,
  role: Message['role'],
  createdAt: number,
  parts: Message['parts']
): Message {
  return { id, conversationId: 'c', seq, role, createdAt, parts }
}

const overnight: Message[] = [
  msg('u1', 0, 'user', t0, [{ kind: 'text', text: '开始' }]),
  msg('a1', 1, 'assistant', t0 + 2_000, [{ kind: 'text', text: '好的' }]),
  msg('u2', 2, 'user', t0 + 12 * hour, [{ kind: 'text', text: '还在吗' }])
]

const overnightProj = projectTrajectory(overnight)
const assistant = overnightProj.records.find((record) => record.kind === 'assistant')
if (!assistant) throw new Error('missing assistant')
if (assistant.durationMs !== 0) {
  throw new Error(`idle must not become assistant duration: ${assistant.durationMs}`)
}
if (overnightProj.stats.durationMs < 12 * hour - 1_000) {
  throw new Error(`wall duration should stay ~12h, got ${overnightProj.stats.durationMs}`)
}

const actual = deriveTrajectoryTimeline(overnightProj.records, 'actual')
const actualAssistant = actual.spans.find((span) => span.record.kind === 'assistant')
const actualUser2 = actual.spans.find((span) => span.record.id === 'u2')
if (!actualAssistant || !actualUser2) throw new Error('actual spans')
if (actualAssistant.end !== actualAssistant.start) {
  throw new Error('assistant without own duration is a tick')
}
const actualDomain = actual.end - actual.start
if (actualUser2.start - actualAssistant.start < 11 * hour) {
  throw new Error('actual mode must keep the overnight gap')
}
if (actualDomain < 11 * hour) throw new Error(`actual domain ${actualDomain}`)

const compressed = deriveTrajectoryTimeline(overnightProj.records, 'duration')
const packedAssistant = compressed.spans.find((span) => span.record.kind === 'assistant')
const packedUser2 = compressed.spans.find((span) => span.record.id === 'u2')
if (!packedAssistant || !packedUser2) throw new Error('duration spans')
if (packedUser2.start - packedAssistant.end > 2) {
  throw new Error(`compress idle failed: gap ${packedUser2.start - packedAssistant.end}`)
}

const sequence = deriveTrajectoryTimeline(overnightProj.records, 'sequence')
if (sequence.end !== overnightProj.records.length) throw new Error('sequence end')
if (sequence.spans.some((span) => span.end - span.start !== 1)) throw new Error('sequence equal width')

if (timelineMode(true, false) !== 'duration') throw new Error('mode duration')
if (timelineMode(true, true) !== 'actual') throw new Error('mode actual')
if (timelineMode(false, false) !== 'sequence') throw new Error('mode sequence')
if (timelineMode(false, true) !== 'time') throw new Error('mode time')

const compressedInput = laneTimelineSpans(compressed, 'input')
const packedU1 = compressedInput.find((span) => span.record.id === 'u1')
const packedU2 = compressedInput.find((span) => span.record.id === 'u2')
if (!packedU1 || !packedU2) throw new Error('compressed input spans')
const compressedDomain = compressed.end - compressed.start
const midRatio = (span: { start: number; end: number }): number =>
  ((span.start + span.end) / 2 - compressed.start) / compressedDomain
if (hitTestLane(compressedInput, compressed.start, compressed.end, midRatio(packedU1))?.id !== 'u1') {
  throw new Error('hit-test compressed u1')
}
if (hitTestLane(compressedInput, compressed.start, compressed.end, midRatio(packedU2))?.id !== 'u2') {
  throw new Error('hit-test compressed u2')
}
if (hitTestLane(compressedInput, compressed.start, compressed.end, 0)?.id !== 'u1') {
  throw new Error('hit-test start of compressed domain')
}

const seqInput = laneTimelineSpans(sequence, 'input')
if (hitTestLane(seqInput, sequence.start, sequence.end, 0.1)?.id !== 'u1') {
  throw new Error('hit-test sequence left')
}
if (hitTestLane(seqInput, sequence.start, sequence.end, 0.9)?.id !== 'u2') {
  throw new Error('hit-test sequence right')
}

const burst: Message[] = [msg('u', 0, 'user', t0, [{ kind: 'text', text: 'x' }])]
for (let i = 0; i < 8; i++) {
  const at = t0 + 10_000 + i * 3_600_000
  burst.push(
    msg(`a${i}`, 1 + i * 2, 'assistant', at, [
      { kind: 'tool_call', name: 'Read', callId: `c${i}`, input: { path: `f${i}.ts` } }
    ])
  )
  burst.push(
    msg(`r${i}`, 2 + i * 2, 'tool', at + 80, [{ kind: 'tool_result', callId: `c${i}`, output: `ok${i}` }])
  )
}
const burstProj = projectTrajectory(burst)
const burstCompressed = deriveTrajectoryTimeline(burstProj.records, 'duration')
const burstTools = laneTimelineSpans(burstCompressed, 'tools')
if (burstTools.length !== 8) throw new Error(`burst tools ${burstTools.length}`)
const burstFirst = hitTestLane(burstTools, burstCompressed.start, burstCompressed.end, 0.04)
const burstLast = hitTestLane(burstTools, burstCompressed.start, burstCompressed.end, 0.96)
if (!burstFirst || !burstLast || burstFirst.id === burstLast.id) {
  throw new Error('compress hit-test should distinguish packed tools')
}
if (!burstFirst.preview.includes('f0')) throw new Error(`first packed tool ${burstFirst.preview}`)
if (!burstLast.preview.includes('f7')) throw new Error(`last packed tool ${burstLast.preview}`)

const overlapStart = t0 + 1_000
const overlapping: Message[] = [
  msg('u', 0, 'user', t0, [{ kind: 'text', text: 'x' }]),
  msg('a1', 1, 'assistant', overlapStart, [
    { kind: 'tool_call', name: 'Bash', callId: 'long', input: { command: 'sleep' } }
  ]),
  msg('a2', 2, 'assistant', overlapStart + 4_000, [
    { kind: 'tool_call', name: 'Read', callId: 'short', input: { path: 'a.ts' } }
  ]),
  msg('r2', 3, 'tool', overlapStart + 4_100, [{ kind: 'tool_result', callId: 'short', output: 'ok' }]),
  msg('r1', 4, 'tool', overlapStart + 10_000, [{ kind: 'tool_result', callId: 'long', output: 'done' }])
]
const overlapModel = deriveTrajectoryTimeline(projectTrajectory(overlapping).records, 'actual')
const overlapTools = laneTimelineSpans(overlapModel, 'tools')
const overlapDomain = overlapModel.end - overlapModel.start
const nestedX = (overlapStart + 4_050 - overlapModel.start) / overlapDomain
const nestedHit = hitTestLane(overlapTools, overlapModel.start, overlapModel.end, nestedX)
if (nestedHit?.toolName !== 'Read') {
  throw new Error(`overlap should prefer shorter span, got ${nestedHit?.toolName ?? 'none'}`)
}

const huge = `payload-${'z'.repeat(2000)}-TAIL`
const haystackMsgs: Message[] = [
  msg('u', 0, 'user', t0, [{ kind: 'text', text: 'go' }]),
  msg('a', 1, 'assistant', t0 + 1, [
    { kind: 'tool_call', name: 'Bash', callId: 'c1', input: { command: 'x' } }
  ]),
  msg('r', 2, 'tool', t0 + 2, [{ kind: 'tool_result', callId: 'c1', output: huge }])
]
const haystackTool = projectTrajectory(haystackMsgs).records.find((record) => record.kind === 'tool')
if (!haystackTool) throw new Error('haystack tool')
if (!haystackTool.detail.endsWith('TAIL')) throw new Error('full detail must stay on the record')
if (haystackTool.searchHaystack.includes('tail')) throw new Error('haystack must truncate detail')
if (!haystackTool.searchHaystack.includes('bash')) throw new Error('haystack should keep tool name')
if (haystackTool.searchHaystack.length > SEARCH_DETAIL_LIMIT + 80) {
  throw new Error(`haystack too long: ${haystackTool.searchHaystack.length}`)
}

const withTool: Message[] = [
  msg('u', 0, 'user', t0, [{ kind: 'text', text: '读文件' }]),
  msg('a', 1, 'assistant', t0 + 1_000, [
    { kind: 'tool_call', name: 'Read', callId: 'c1', input: { path: 'a.ts' } }
  ]),
  msg('r', 2, 'tool', t0 + 6_000, [{ kind: 'tool_result', callId: 'c1', output: 'export {}' }])
]
const toolProj = projectTrajectory(withTool)
const tool = toolProj.records.find((record) => record.kind === 'tool')
if (!tool) throw new Error('missing tool')
if (tool.durationMs !== 5_000) throw new Error(`tool duration ${tool.durationMs}`)

console.log('ok: trajectory own duration / idle / timeline modes / hit-test / haystack')
