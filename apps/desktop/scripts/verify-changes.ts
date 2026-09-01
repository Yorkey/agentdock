import type { Message, Part, Role } from '@agentdock/core'
import { projectChanges } from '../src/renderer/src/lib/changes.ts'

function msg(id: string, role: Role, createdAt: number, parts: Part[]): Message {
  return { id, conversationId: 'c', seq: 0, role, createdAt, parts }
}

const nativeOnly = projectChanges([
  msg('d1', 'assistant', 10, [
    { kind: 'diff', path: 'src/a.ts', patch: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+native\n' }
  ])
])
if (nativeOnly.length !== 1 || nativeOnly[0]?.origin !== 'native') {
  throw new Error(`native diff missing: ${nativeOnly[0]?.origin}`)
}
if (nativeOnly[0]?.fileName !== 'a.ts' || nativeOnly[0]?.count !== 1) {
  throw new Error('native grouping')
}
if (!nativeOnly[0]?.entries[0]?.patch.includes('+native')) throw new Error('native patch dropped')

const writeOnly = projectChanges([
  msg('w1', 'assistant', 11, [
    {
      kind: 'tool_call',
      name: 'Write',
      callId: 'w',
      input: { path: 'src/new.ts', contents: 'hello\nworld' }
    }
  ])
])
if (writeOnly.length !== 1 || writeOnly[0]?.origin !== 'synthetic') {
  throw new Error('Write should synthesize a change')
}
const writePatch = writeOnly[0]?.entries[0]?.patch ?? ''
if (!writePatch.includes('--- /dev/null')) throw new Error(`Write should use /dev/null: ${writePatch}`)
if (!writePatch.includes('+hello') || !writePatch.includes('+world')) {
  throw new Error(`Write patch body: ${writePatch}`)
}
if (!writeOnly[0]?.intent) throw new Error('Cursor Write without tool_result should be intent')

const replaceOnly = projectChanges([
  msg('e1', 'assistant', 12, [
    {
      kind: 'tool_call',
      name: 'StrReplace',
      callId: 'sr',
      input: { path: 'src/a.ts', old_string: 'foo', new_string: 'bar' }
    }
  ])
])
const replacePatch = replaceOnly[0]?.entries[0]?.patch ?? ''
if (!replacePatch.includes('-foo') || !replacePatch.includes('+bar')) {
  throw new Error(`StrReplace patch: ${replacePatch}`)
}

const nativeWins = projectChanges([
  msg('n1', 'assistant', 20, [
    { kind: 'diff', path: 'src/a.ts', patch: '--- a\n+++ a\n+from-native\n' },
    {
      kind: 'tool_call',
      name: 'StrReplace',
      callId: 'dup',
      input: { path: 'src/a.ts', old_string: 'x', new_string: 'y' }
    }
  ])
])
if (nativeWins.length !== 1) throw new Error(`same path should stay one file, got ${nativeWins.length}`)
if (nativeWins[0]?.origin !== 'native' || nativeWins[0]?.count !== 1) {
  throw new Error('synthetic must be dropped when a native diff exists for the path')
}
if (!nativeWins[0]?.entries[0]?.patch.includes('from-native')) {
  throw new Error('native patch should win')
}
if (nativeWins[0]?.entries.some((entry) => entry.origin === 'synthetic')) {
  throw new Error('synthetic hunk leaked next to native')
}

const mixedPaths = projectChanges([
  msg('n2', 'assistant', 21, [{ kind: 'diff', path: 'src/a.ts', patch: '--- a\n+++ a\n+a\n' }]),
  msg('w2', 'assistant', 22, [
    { kind: 'tool_call', name: 'Write', callId: 'w2', input: { path: 'src/b.ts', contents: 'b' } }
  ])
])
if (mixedPaths.length !== 2) throw new Error(`two paths should stay two files, got ${mixedPaths.length}`)
const byName = new Map(mixedPaths.map((file) => [file.fileName, file]))
if (byName.get('a.ts')?.origin !== 'native') throw new Error('a.ts should stay native')
if (byName.get('b.ts')?.origin !== 'synthetic') throw new Error('b.ts should stay synthetic')

const failed = projectChanges([
  msg('c1', 'assistant', 30, [
    {
      kind: 'tool_call',
      name: 'Edit',
      callId: 'ed',
      input: { file_path: 'src/c.ts', old_string: 'a', new_string: 'b' }
    }
  ]),
  msg('r1', 'tool', 31, [{ kind: 'tool_result', callId: 'ed', output: 'failed', isError: true }])
])
if (!failed[0]?.failed) throw new Error('Claude isError should mark the file failed')
if (failed[0]?.intent) throw new Error('failed edit with a result is not mere intent')

const multi = projectChanges([
  msg('m1', 'assistant', 40, [
    {
      kind: 'tool_call',
      name: 'MultiEdit',
      callId: 'me',
      input: {
        file_path: 'src/d.ts',
        edits: [
          { old_string: 'one', new_string: 'ONE' },
          { old_string: 'two', new_string: 'TWO' }
        ]
      }
    }
  ])
])
const multiPatch = multi[0]?.entries[0]?.patch ?? ''
if (!multiPatch.includes('-one') || !multiPatch.includes('+TWO')) {
  throw new Error(`MultiEdit patch: ${multiPatch}`)
}

const ignoredRead = projectChanges([
  msg('r2', 'assistant', 50, [{ kind: 'tool_call', name: 'Read', callId: 'rd', input: { path: 'src/a.ts' } }])
])
if (ignoredRead.length !== 0) throw new Error('Read must not project as a change')

console.log('ok: changes native-over-synthetic / Write / StrReplace / intent / isError')
