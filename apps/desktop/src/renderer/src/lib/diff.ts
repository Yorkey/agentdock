export type DiffLineKind = 'add' | 'del' | 'hunk' | 'meta' | 'ctx'

export interface DiffLine {
  kind: DiffLineKind
  text: string
}

export function parseDiffLines(patch: string): DiffLine[] {
  if (!patch) return []
  return patch.split('\n').map((text) => {
    if (
      text.startsWith('+++') ||
      text.startsWith('---') ||
      text.startsWith('diff ') ||
      text.startsWith('index ') ||
      text.startsWith('similarity ') ||
      text.startsWith('rename ')
    ) {
      return { kind: 'meta', text }
    }
    if (text.startsWith('@@')) return { kind: 'hunk', text }
    if (text.startsWith('+')) return { kind: 'add', text }
    if (text.startsWith('-')) return { kind: 'del', text }
    return { kind: 'ctx', text }
  })
}
