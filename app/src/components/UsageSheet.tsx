import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ContextInfo, PlanWindow } from '../../../shared/protocol'
import { useClient, type Usage } from '../lib/client'
import { C } from '../lib/theme'
import AiControls from './AiControls'
import Icon from './Icon'
import Sheet, { SectionLabel } from './Sheet'

const COLORS: Record<string, string> = {
  messages: '#5b9cf5', memory_files: '#e8703a', system_tools: '#3fb27f', skills: '#e0a526', custom_agents: '#b07cf0',
  system_prompt: '#9a9a9a', mcp_tools: '#7fb3d5', mcp_instructions: '#9a9a9a', autocompact_buffer: '#5a5a5a',
  compact_buffer: '#5a5a5a', free_space: '#333333',
}
const colorOf = (id?: string, kind?: string) => COLORS[id ?? ''] ?? (kind === 'free' ? '#333' : '#8a8a8a')

export const fmtTokens = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n))

function resetIn(iso: string | null) {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Segera diatur ulang'
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4)
  return `Diatur ulang dalam ${h ? `${h} jam ` : ''}${m} mnt`
}

function Bar({ parts }: { parts: { pct: number; color: string }[] }) {
  return (
    <View style={s.bar}>
      {parts.map((p, i) => <View key={i} style={{ width: `${Math.max(0, p.pct)}%`, backgroundColor: p.color }} />)}
    </View>
  )
}

function ContextCard({ ctx }: { ctx: ContextInfo }) {
  const [open, setOpen] = useState(false)
  const used = ctx.categories.filter(c => c.kind !== 'deferred')
  return (
    <View style={s.card}>
      <Pressable onPress={() => setOpen(!open)} style={s.cardHead}>
        <View style={s.line}>
          <Text style={s.cardTitle}>Jendela konteks</Text>
          <Text style={s.cardValue}>{Math.round(ctx.percentage)}% terpakai  <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} color={C.dim} /></Text>
        </View>
        <Bar parts={used.filter(c => c.kind !== 'free').map(c => ({ pct: (c.tokens / ctx.max) * 100, color: colorOf(c.id, c.kind) }))} />
        <Text style={s.cardSub}>{fmtTokens(ctx.total)} dari {fmtTokens(ctx.max)} token</Text>
      </Pressable>
      {open ? (
        <View style={s.detail}>
          {ctx.categories.map(c => (
            <View key={c.id ?? c.name} style={s.catRow}>
              <View style={[s.dot, { backgroundColor: colorOf(c.id, c.kind) }]} />
              <Text style={s.catName} numberOfLines={1}>{c.name}</Text>
              <Text style={s.catNum}>{fmtTokens(c.tokens)}</Text>
              <Text style={s.catPct}>{c.kind === 'deferred' ? '—' : `${((c.tokens / ctx.max) * 100).toFixed(1)}%`}</Text>
            </View>
          ))}
          {ctx.mcpTools ? <Text style={s.cardSub}>Alat MCP: {ctx.mcpTools}</Text> : null}
        </View>
      ) : null}
    </View>
  )
}

function PlanCard({ w }: { w: PlanWindow }) {
  const pct = w.utilization ?? 0
  return (
    <View style={[s.card, s.cardHead]}>
      <View style={s.line}>
        <Text style={s.cardTitle}>{w.label}</Text>
        <Text style={s.cardValue}>{w.utilization === null ? '-' : `${Math.round(pct)}% terpakai`}</Text>
      </View>
      <View style={[s.bar, { backgroundColor: '#0f2747' }]}>
        <View style={{ width: `${Math.min(100, pct)}%`, backgroundColor: C.blue }} />
      </View>
      <Text style={s.cardSub}>{resetIn(w.resetsAt)}</Text>
    </View>
  )
}

export default function UsageSheet({ visible, onClose, usage, loading, running, onRefresh }: {
  visible: boolean
  onClose: () => void
  usage?: Usage
  loading: boolean
  running: boolean
  onRefresh: () => void
}) {
  const plan = useClient().plan
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Penggunaan"
      right={
        <Pressable onPress={onRefresh} hitSlop={12}>
          {loading ? <ActivityIndicator color={C.text} /> : <Icon name="refresh" size={26} />}
        </Pressable>
      }
    >
      <AiControls />
      <SectionLabel>Konteks</SectionLabel>
      {usage?.context ? (
        <ContextCard ctx={usage.context} />
      ) : (
        <View style={[s.card, s.cardHead]}>
          <Text style={s.cardSub}>{running ? 'Memuat konteks…' : 'Konteks terlihat saat sesi ini sedang berjalan. Kirim pesan untuk melanjutkannya.'}</Text>
        </View>
      )}
      {plan?.session ? (
        <>
          <SectionLabel>Penggunaan paket</SectionLabel>
          <PlanCard w={plan.session} />
        </>
      ) : null}
      {plan?.weekly.length ? (
        <>
          <SectionLabel>Batas mingguan</SectionLabel>
          {plan.weekly.map(w => <PlanCard key={w.label} w={w} />)}
        </>
      ) : null}
      {!usage && !loading ? <Text style={s.cardSub}>Belum ada data. Ketuk muat ulang.</Text> : null}
    </Sheet>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 22, marginBottom: 14, overflow: 'hidden' },
  cardHead: { padding: 18, gap: 10 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: C.text, fontSize: 18 },
  cardValue: { color: C.dim, fontSize: 16 },
  cardSub: { color: C.dim, fontSize: 14 },
  bar: { height: 9, borderRadius: 5, backgroundColor: '#3a3a3a', flexDirection: 'row', overflow: 'hidden' },
  detail: { borderTopColor: C.bg, borderTopWidth: 2, padding: 18, gap: 12 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  catName: { color: C.text, fontSize: 15, flex: 1 },
  catNum: { color: C.dim, fontSize: 15, width: 64, textAlign: 'right' },
  catPct: { color: C.dim, fontSize: 15, width: 56, textAlign: 'right' },
})
