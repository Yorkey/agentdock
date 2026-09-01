import type { Conversation } from '@agentdock/core'
import type { SourceInfo } from '@agentdock/plugin-registry/types'
import { workspaceKey, workspaceLabel } from './format.ts'

export type TreeSelection =
  | { kind: 'all' }
  | { kind: 'source'; sourceId: string }
  | { kind: 'workspace'; sourceId: string; workspace: string }

export interface WorkspaceNode {
  workspace: string
  label: string
  count: number
  conversations: Conversation[]
}

export interface SourceNode {
  id: string
  label: string
  count: number
  workspaces: WorkspaceNode[]
}

export type SidebarRow =
  | { kind: 'source'; key: string; source: SourceNode }
  | { kind: 'workspace'; key: string; workspace: WorkspaceNode }
  | { kind: 'session'; key: string; conversation: Conversation; nested: boolean }

export function sourceRowKey(sourceId: string): string {
  return `s:${sourceId}`
}

export function workspaceRowKey(sourceId: string, workspace: string): string {
  return `w:${sourceId}:${workspace}`
}

export function sessionRowKey(conversationId: string): string {
  return `c:${conversationId}`
}

/** 按折叠状态把工作区树拍成虚拟列表行。折叠的 source / workspace 不展开子行。 */
export function flattenSidebarRows(tree: SourceNode[], collapsed: ReadonlySet<string>): SidebarRow[] {
  const rows: SidebarRow[] = []
  for (const source of tree) {
    const sourceKey = sourceRowKey(source.id)
    rows.push({ kind: 'source', key: sourceKey, source })
    if (collapsed.has(sourceKey)) continue
    for (const workspace of source.workspaces) {
      const wsKey = workspaceRowKey(source.id, workspace.workspace)
      rows.push({ kind: 'workspace', key: wsKey, workspace })
      if (collapsed.has(wsKey)) continue
      for (const conversation of workspace.conversations) {
        rows.push({
          kind: 'session',
          key: sessionRowKey(conversation.id),
          conversation,
          nested: true
        })
      }
    }
  }
  return rows
}

export function flattenSearchRows(hits: Conversation[]): SidebarRow[] {
  return hits.map((conversation) => ({
    kind: 'session',
    key: sessionRowKey(conversation.id),
    conversation,
    nested: false
  }))
}

export function buildSourceTree(
  sources: SourceInfo[],
  conversations: Conversation[]
): SourceNode[] {
  const labelById = new Map(sources.map((source) => [source.id, source.label]))
  const grouped = new Map<string, Map<string, Conversation[]>>()

  for (const conversation of conversations) {
    let workspaces = grouped.get(conversation.sourceId)
    if (!workspaces) {
      workspaces = new Map()
      grouped.set(conversation.sourceId, workspaces)
    }
    const key = workspaceKey(conversation.workspace)
    const list = workspaces.get(key) ?? []
    list.push(conversation)
    workspaces.set(key, list)
  }

  const ids: string[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    ids.push(source.id)
    seen.add(source.id)
  }
  for (const id of grouped.keys()) {
    if (!seen.has(id)) ids.push(id)
  }

  return ids.map((id) => {
    const workspaces = grouped.get(id) ?? new Map()
    const workspaceNodes: WorkspaceNode[] = [...workspaces.entries()]
      .map(([workspace, list]) => ({
        workspace,
        label: workspaceLabel(workspace || undefined),
        count: list.length,
        conversations: sortByUpdatedAt(list)
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh'))
    const count = workspaceNodes.reduce((sum, node) => sum + node.count, 0)
    return {
      id,
      label: labelById.get(id) ?? id,
      count,
      workspaces: workspaceNodes
    }
  })
}

export function filterByTree(
  conversations: Conversation[],
  selection: TreeSelection
): Conversation[] {
  if (selection.kind === 'all') return conversations
  if (selection.kind === 'source') {
    return conversations.filter((row) => row.sourceId === selection.sourceId)
  }
  return conversations.filter(
    (row) =>
      row.sourceId === selection.sourceId && workspaceKey(row.workspace) === selection.workspace
  )
}

export function sortByUpdatedAt(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    const updated = b.updatedAt - a.updatedAt
    if (updated !== 0) return updated
    return b.createdAt - a.createdAt
  })
}

export function sourceLabelOf(
  sources: SourceInfo[],
  sourceId: string,
  fallback?: string
): string {
  return sources.find((source) => source.id === sourceId)?.label ?? fallback ?? sourceId
}

export function selectionEquals(a: TreeSelection, b: TreeSelection): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'all' || b.kind === 'all') return true
  if (a.kind === 'source' && b.kind === 'source') return a.sourceId === b.sourceId
  if (a.kind === 'workspace' && b.kind === 'workspace') {
    return a.sourceId === b.sourceId && a.workspace === b.workspace
  }
  return false
}
