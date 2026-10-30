import type { ChatItem } from '../../../shared/protocol'

export type Tool = Extract<ChatItem, { k: 'tool' }>
export type ToolResult = Extract<ChatItem, { k: 'tool_result' }>
export type Node = { kind: 'tools'; tools: Tool[] } | { kind: 'item'; item: ChatItem }

// Baris 'tool' berurutan dikelompokkan jadi satu blok; 'tool_result' tidak dirender sendiri,
// hasilnya ditempel ke langkahnya lewat peta toolUseId -> hasil.
export function groupItems(items: ChatItem[]): { nodes: Node[]; results: Map<string, ToolResult> } {
  const nodes: Node[] = []
  const results = new Map<string, ToolResult>()
  for (const it of items) {
    if (it.k === 'tool_result') {
      results.set(it.toolUseId, it)
    } else if (it.k === 'tool') {
      const last = nodes[nodes.length - 1]
      if (last?.kind === 'tools') last.tools.push(it)
      else nodes.push({ kind: 'tools', tools: [it] })
    } else {
      nodes.push({ kind: 'item', item: it })
    }
  }
  return { nodes, results }
}
