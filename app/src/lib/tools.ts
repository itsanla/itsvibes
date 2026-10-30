import type { Tool } from './group'

export interface ToolKind { icon: string; noun: string; doing: string; done: string; file?: boolean }

// kata kerja dan pengelompokan langkah tool, sama dengan aplikasi Claude ("2 perintah dijalankan, 1 file diedit")
export function kindOf(name: string): ToolKind {
  if (/^(Bash|BashOutput|KillShell|KillBash|PowerShell)$/.test(name)) return { icon: 'terminal', noun: 'perintah dijalankan', doing: 'Menjalankan', done: 'Selesai menjalankan' }
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(name)) return { icon: 'pencil', noun: 'file diedit', doing: 'Mengedit', done: 'Selesai mengedit', file: true }
  if (name === 'Read') return { icon: 'file', noun: 'file dibaca', doing: 'Membaca', done: 'Selesai membaca', file: true }
  if (/^(Grep|Glob|LS)$/.test(name)) return { icon: 'search', noun: 'pencarian', doing: 'Mencari', done: 'Selesai mencari' }
  if (name === 'WebSearch') return { icon: 'globe', noun: 'penelusuran web', doing: 'Mencari di web', done: 'Selesai mencari di web' }
  if (name === 'WebFetch') return { icon: 'globe', noun: 'halaman dibuka', doing: 'Membuka', done: 'Selesai membuka' }
  if (/^(Task|Agent)$/.test(name)) return { icon: 'agent', noun: 'agen dijalankan', doing: 'Menjalankan agen', done: 'Agen selesai' }
  if (/^(TodoWrite|TaskCreate|TaskUpdate)$/.test(name)) return { icon: 'list', noun: 'daftar tugas diperbarui', doing: 'Memperbarui tugas', done: 'Daftar tugas diperbarui' }
  if (name === 'Skill') return { icon: 'agent', noun: 'skill dimuat', doing: 'Memuat skill', done: 'Skill dimuat' }
  return { icon: 'tool', noun: name.startsWith('mcp__') ? 'alat MCP dipakai' : 'alat dipakai', doing: 'Memakai', done: 'Selesai memakai' }
}

const base = (p: string) => p.split('/').filter(Boolean).pop() ?? p

export function toolLabel(t: Tool): string {
  const k = kindOf(t.name)
  if (k.file && t.summary.includes('/')) return base(t.summary)
  if (t.name === 'WebFetch') return t.summary.replace(/^https?:\/\//, '').split('/')[0]
  if (t.name.startsWith('mcp__')) return t.name.split('__').slice(1).join(' · ')
  return t.summary
}

export function summarize(tools: Tool[]): string {
  const counts = new Map<string, number>()
  for (const t of tools) {
    const n = kindOf(t.name).noun
    counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  const text = [...counts].map(([n, c]) => `${c} ${n}`).join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
