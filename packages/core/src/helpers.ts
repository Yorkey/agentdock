import type { Part } from './types.ts'

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const FNV_OFFSET_ALT = 0x6c62272e07bb0142n

function fnv1a64(input: string, offset: bigint): bigint {
  let hash = offset
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i))
    hash = BigInt.asUintN(64, hash * FNV_PRIME)
  }
  return hash
}

/** Stable 32-char hex id. Pure TS (no node:crypto) so renderer typecheck can import core. */
export function hashId(...parts: string[]): string {
  const input = parts.join('\u0000')
  const a = fnv1a64(input, FNV_OFFSET)
  const b = fnv1a64(input, FNV_OFFSET_ALT)
  return a.toString(16).padStart(16, '0') + b.toString(16).padStart(16, '0')
}

export function makeConversationId(sourceId: string, sourcePath: string): string {
  return hashId(sourceId, sourcePath)
}

export function truncateTitle(text: string, maxLength = 80): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  if (maxLength <= 1) return '…'
  return `${normalized.slice(0, maxLength - 1)}…`
}

export function partsToSearchText(parts: Part[]): string {
  const chunks: string[] = []
  for (const part of parts) {
    switch (part.kind) {
      case 'text':
      case 'reasoning':
        chunks.push(part.text)
        break
      case 'tool_call':
        chunks.push(part.name)
        break
      case 'tool_result':
        chunks.push(part.output)
        break
      case 'diff':
        chunks.push(part.path, part.patch)
        break
      default:
        break
    }
  }
  return chunks.filter(Boolean).join('\n')
}
