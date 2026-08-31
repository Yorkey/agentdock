export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: InlineNode[] }

export type BlockNode =
  | { type: 'h'; level: 1 | 2 | 3 | 4; children: InlineNode[] }
  | { type: 'p'; children: InlineNode[] }
  | { type: 'ul'; items: InlineNode[][] }
  | { type: 'ol'; items: InlineNode[][] }
  | { type: 'pre'; lang?: string; text: string }
  | { type: 'quote'; children: InlineNode[] }
  | { type: 'hr' }
  | { type: 'table'; heads: InlineNode[][]; rows: InlineNode[][][] }

export function parseMarkdown(source: string): BlockNode[] {
  const text = source.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '')
  const blocks: BlockNode[] = []
  let i = 0
  const lines = text.split('\n')

  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (!line.trim()) {
      i += 1
      continue
    }

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim() || undefined
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^```/.test(lines[i] ?? '')) {
        body.push(lines[i] ?? '')
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push({ type: 'pre', ...(lang ? { lang } : {}), text: body.join('\n') })
      continue
    }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line)
    if (heading?.[1] && heading[2]) {
      const level = heading[1].length as 1 | 2 | 3 | 4
      blocks.push({ type: 'h', level, children: parseInline(heading[2].trim()) })
      i += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i] ?? '')) {
        quoted.push((lines[i] ?? '').replace(/^>\s?/, ''))
        i += 1
      }
      blocks.push({ type: 'quote', children: parseInline(quoted.join('\n')) })
      continue
    }

    if (/^\|(.+)\|$/.test(line.trim()) && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const heads = splitTableRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\|(.+)\|$/.test((lines[i] ?? '').trim())) {
        rows.push(splitTableRow(lines[i] ?? ''))
        i += 1
      }
      blocks.push({
        type: 'table',
        heads: heads.map(parseInline),
        rows: rows.map((row) => row.map(parseInline))
      })
      continue
    }

    if (/^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line)
      const items: string[] = []
      while (i < lines.length) {
        const current = lines[i] ?? ''
        if (!current.trim()) break
        const item = ordered ? /^\d+[.)]\s+(.*)$/.exec(current) : /^[-*+]\s+(.*)$/.exec(current)
        if (!item) break
        items.push(item[1] ?? '')
        i += 1
      }
      blocks.push({
        type: ordered ? 'ol' : 'ul',
        items: items.map(parseInline)
      })
      continue
    }

    const para: string[] = []
    while (i < lines.length) {
      const current = lines[i] ?? ''
      if (!current.trim()) break
      if (/^(#{1,4})\s+/.test(current) || /^```/.test(current) || /^[-*+]\s+/.test(current) || /^\d+[.)]\s+/.test(current) || /^>\s?/.test(current) || /^---+$/.test(current.trim())) {
        break
      }
      para.push(current)
      i += 1
    }
    blocks.push({ type: 'p', children: parseInline(para.join('\n')) })
  }

  return blocks
}

export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let remaining = source

  const pushText = (value: string) => {
    if (!value) return
    const last = nodes.at(-1)
    if (last?.type === 'text') last.value += value
    else nodes.push({ type: 'text', value })
  }

  while (remaining.length > 0) {
    if (remaining.startsWith('`')) {
      const end = remaining.indexOf('`', 1)
      if (end > 0) {
        nodes.push({ type: 'code', value: remaining.slice(1, end) })
        remaining = remaining.slice(end + 1)
        continue
      }
    }

    if (remaining.startsWith('[') ) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(remaining)
      if (link?.[1] != null && link[2]) {
        nodes.push({ type: 'link', href: link[2], children: parseInline(link[1]) })
        remaining = remaining.slice(link[0].length)
        continue
      }
    }

    if (remaining.startsWith('**') || remaining.startsWith('__')) {
      const delim = remaining.slice(0, 2)
      const end = remaining.indexOf(delim, 2)
      if (end > 2) {
        nodes.push({ type: 'strong', children: parseInline(remaining.slice(2, end)) })
        remaining = remaining.slice(end + 2)
        continue
      }
    }

    if (remaining.startsWith('*') || remaining.startsWith('_')) {
      const delim = remaining[0] ?? ''
      const end = remaining.indexOf(delim, 1)
      if (end > 1 && remaining[end + 1] !== delim) {
        nodes.push({ type: 'em', children: parseInline(remaining.slice(1, end)) })
        remaining = remaining.slice(end + 1)
        continue
      }
    }

    const next = remaining.search(/(`|\*\*|__|\*|_|\[)/)
    if (next === -1) {
      pushText(remaining)
      break
    }
    if (next === 0) {
      pushText(remaining[0] ?? '')
      remaining = remaining.slice(1)
      continue
    }
    pushText(remaining.slice(0, next))
    remaining = remaining.slice(next)
  }

  return nodes
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

export function looksLikeMarkdown(text: string): boolean {
  return /(^|\n)#{1,4}\s+/.test(text)
    || /(^|\n)[-*+]\s+\S/.test(text)
    || /(^|\n)\d+[.)]\s+\S/.test(text)
    || /```/.test(text)
    || /\*\*[^*\n]+\*\*/.test(text)
    || /`[^`\n]+`/.test(text)
    || /\[[^\]]+\]\([^)]+\)/.test(text)
    || /(^|\n)\|(.+)\|/.test(text)
}
