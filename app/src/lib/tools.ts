import type { ChatItem } from '../../../shared/protocol'
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
  if (isBrowserTool(name)) return { icon: 'globe', noun: 'aksi browser', doing: 'Mengendalikan browser', done: 'Selesai mengendalikan browser' }
  return { icon: 'tool', noun: name.startsWith('mcp__') ? 'alat MCP dipakai' : 'alat dipakai', doing: 'Memakai', done: 'Selesai memakai' }
}

// alat Playwright MCP milik browser bersama (server/src/browser.ts)
export const isBrowserTool = (name: string) => name.startsWith('mcp__browser__')

const base = (p: string) => p.split('/').filter(Boolean).pop() ?? p

export function toolLabel(t: Tool): string {
  const k = kindOf(t.name)
  if (k.file && t.summary.includes('/')) return base(t.summary)
  if (t.name === 'WebFetch') return t.summary.replace(/^https?:\/\//, '').split('/')[0]
  if (isBrowserTool(t.name)) {
    const act = t.name.slice('mcp__browser__browser_'.length).replace(/_/g, ' ')
    try {
      const j = JSON.parse(t.input) as Record<string, unknown>
      const arg = [j.url, j.element, j.text, j.key, j.ref].find(v => typeof v === 'string' && v)
      if (arg) return `${act} · ${String(arg).replace(/^https?:\/\//, '')}`
    } catch {
      // masukan terpotong: cukup nama aksinya
    }
    return act
  }
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

// browser dianggap aktif sejak alat browser dipakai sampai Claude memanggil browser_close
export function browserActive(items: ChatItem[]): boolean {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it.k === 'tool' && isBrowserTool(it.name)) return it.name !== 'mcp__browser__browser_close'
  }
  return false
}
