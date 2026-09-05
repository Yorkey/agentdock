import type { SkillMetadata } from '@agentdock/core'

/**
 * 轻量且安全的 YAML Frontmatter 解析器，专为 Agent Skill 设计。
 * 支持提取 name, description, version, author, tools, tags 等字段。
 */
export function parseSkillContent(raw: string, fallbackName: string): {
  metadata: SkillMetadata
  markdownBody: string
} {
  const normalized = raw.replace(/\r\n/g, '\n')
  const trimmed = normalized.trimStart()

  if (trimmed.startsWith('---')) {
    const endIdx = trimmed.indexOf('\n---', 3)
    if (endIdx !== -1) {
      const yamlChunk = trimmed.slice(3, endIdx).trim()
      const markdownBody = trimmed.slice(endIdx + 4).trim()
      const metadata = parseSimpleYaml(yamlChunk)
      if (!metadata.name) {
        metadata.name = extractMarkdownHeading(markdownBody) || fallbackName
      }
      if (!metadata.description) {
        metadata.description = extractMarkdownDescription(markdownBody)
      }
      return { metadata, markdownBody }
    }
  }

  // 没有 frontmatter，尝试从 markdown 正文提取
  const heading = extractMarkdownHeading(normalized)
  const description = extractMarkdownDescription(normalized)
  return {
    metadata: {
      name: heading || fallbackName,
      description: description || ''
    },
    markdownBody: normalized
  }
}

function parseSimpleYaml(yamlText: string): SkillMetadata {
  const result: SkillMetadata = {}
  const lines = yamlText.split('\n')
  let currentKey = ''
  let inArray = false
  const arrayAcc: string[] = []
  let inMultiline = false
  let multilineType: 'folded' | 'literal' = 'folded'
  const multilineAcc: string[] = []

  const commitCurrent = () => {
    if (inArray && currentKey) {
      result[currentKey] = [...arrayAcc]
      arrayAcc.length = 0
      inArray = false
    }
    if (inMultiline && currentKey) {
      const text =
        multilineType === 'literal'
          ? multilineAcc.join('\n').trim()
          : multilineAcc.join(' ').replace(/\s+/g, ' ').trim()
      result[currentKey] = text
      multilineAcc.length = 0
      inMultiline = false
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      if (inMultiline) {
        multilineAcc.push('')
      }
      continue
    }

    const isIndented = line.startsWith(' ') || line.startsWith('\t')

    if (inMultiline && isIndented) {
      multilineAcc.push(trimmed)
      continue
    }

    if (inArray && trimmed.startsWith('- ')) {
      const val = cleanYamlValue(trimmed.slice(2))
      if (val) arrayAcc.push(val)
      continue
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx !== -1) {
      commitCurrent()
      const rawKey = line.slice(0, colonIdx).trim()
      const rawVal = line.slice(colonIdx + 1).trim()
      currentKey = rawKey

      if (rawVal === '>' || rawVal === '>-' || rawVal === '>+') {
        inMultiline = true
        multilineType = 'folded'
      } else if (rawVal === '|' || rawVal === '|-' || rawVal === '|+') {
        inMultiline = true
        multilineType = 'literal'
      } else if (rawVal === '') {
        inArray = true
      } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        const items = rawVal
          .slice(1, -1)
          .split(',')
          .map((item) => cleanYamlValue(item))
          .filter(Boolean)
        result[rawKey] = items
      } else {
        result[rawKey] = cleanYamlValue(rawVal)
      }
    } else if (inMultiline && !isIndented) {
      commitCurrent()
    }
  }
  commitCurrent()

  if (typeof result.description === 'string') {
    const d = result.description.trim()
    if (d === '>' || d === '|' || d === '>-' || d === '|-') {
      result.description = ''
    }
  }

  return result
}

function cleanYamlValue(val: string): string {
  const s = val.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

function extractMarkdownHeading(md: string): string {
  const match = md.match(/^#\s+(.+)$/m)
  return match && match[1] ? match[1].trim() : ''
}

function extractMarkdownDescription(md: string): string {
  const lines = md.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed === '>' || trimmed === '|' || trimmed === '---') continue
    if (trimmed.startsWith('#')) continue
    if (trimmed.startsWith('>')) {
      const stripped = trimmed.replace(/^>\s*/, '').trim()
      if (stripped) return stripped
      continue
    }
    if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('|')) continue
    if (trimmed.startsWith('```')) continue
    return trimmed
  }
  return ''
}
