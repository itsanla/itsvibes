import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ChatItem } from '../../../shared/protocol'
import { C, mono } from '../lib/theme'
import { LinkedText } from './FileViewer'
import Icon from './Icon'
import Sheet from './Sheet'

type Tool = Extract<ChatItem, { k: 'tool' }>
type Result = Extract<ChatItem, { k: 'tool_result' }>

interface Kind { icon: string; noun: string; doing: string; done: string; file?: boolean }

// pengelompokan dan kata kerja seperti di aplikasi Claude ("2 perintah dijalankan, 1 file diedit")
function kindOf(name: string): Kind {
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
const label = (t: Tool) => {
  const k = kindOf(t.name)
  if (k.file && t.summary.includes('/')) return base(t.summary)
  if (t.name === 'WebFetch') return t.summary.replace(/^https?:\/\//, '').split('/')[0]
  if (t.name.startsWith('mcp__')) return `${t.name.split('__').slice(1).join(' · ')}`
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

function Diff({ t }: { t: Tool }) {
  if (t.added === undefined && t.removed === undefined) return null
  return (
    <View style={s.diff}>
      <Text style={[s.diffText, { backgroundColor: C.addGreen, color: C.ok }]}>+{t.added ?? 0}</Text>
      <Text style={[s.diffText, { backgroundColor: C.delRed, color: C.err }]}>-{t.removed ?? 0}</Text>
    </View>
  )
}

function Step({ t, r, last, running }: { t: Tool; r?: Result; last: boolean; running: boolean }) {
  const [open, setOpen] = useState(false)
  const k = kindOf(t.name)
  const failed = r?.isError
  const pending = !r && running
  return (
    <View style={s.step}>
      <View style={s.rail}>
        <Icon name={k.icon} size={22} color={failed ? C.err : C.dim} />
        {!last ? <View style={s.railLine} /> : null}
      </View>
      <Pressable style={s.stepBody} onPress={() => setOpen(!open)}>
        <View style={s.stepHead}>
          <Text style={[s.verb, failed && { color: C.err }]}>{failed ? 'Gagal' : pending ? k.doing : k.done}</Text>
          <Text style={[s.target, k.file && { fontFamily: mono }]} numberOfLines={open ? undefined : 1}>{label(t)}</Text>
          <Diff t={t} />
          {pending ? <ActivityIndicator size="small" color={C.accent} /> : null}
        </View>
        {open ? (
          <>
            <LinkedText text={t.detail ?? t.input} style={s.code} />
            {r ? <LinkedText text={r.text || '(tanpa keluaran)'} style={[s.code, r.isError && { color: C.err }]} /> : null}
          </>
        ) : null}
      </Pressable>
    </View>
  )
}

// satu baris ringkasan di percakapan; ketuk untuk membuka linimasa langkah di bottom sheet
export default function ToolGroup({ tools, results, running }: { tools: Tool[]; results: Map<string, Result>; running: boolean }) {
  const [open, setOpen] = useState(false)
  const busy = running && tools.some(t => !results.has(t.id))
  const title = summarize(tools)
  return (
    <>
      <Pressable style={s.row} onPress={() => setOpen(true)}>
        {busy ? <ActivityIndicator size="small" color={C.accent} /> : null}
        <Text style={s.rowText} numberOfLines={1}>{title}</Text>
        <Icon name="chevronRight" size={18} color={C.faint} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        {tools.map((t, i) => <Step key={t.id} t={t} r={results.get(t.id)} last={i === tools.length - 1} running={running} />)}
      </Sheet>
    </>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  rowText: { color: C.dim, fontSize: 15, flexShrink: 1 },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 26, paddingTop: 2 },
  railLine: { width: 1.5, flex: 1, backgroundColor: C.border, marginVertical: 6, minHeight: 18 },
  stepBody: { flex: 1, paddingBottom: 18 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  verb: { color: C.text, fontSize: 16 },
  target: { color: C.dim, fontSize: 15, flexShrink: 1 },
  diff: { flexDirection: 'row', borderRadius: 6, overflow: 'hidden' },
  diffText: { fontSize: 13, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2 },
  code: { color: C.dim, fontFamily: mono, fontSize: 12, marginTop: 8, backgroundColor: C.code, padding: 10, borderRadius: 8 },
})
