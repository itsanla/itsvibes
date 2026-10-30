import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { SessionSummary } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import { useWide } from '../lib/layout'
import { STATUS, shortPath, timeAgo } from '../lib/format'
import { C } from '../lib/theme'

const rank = (s: SessionSummary) => (s.pending > 0 || s.status === 'waiting' ? 0 : s.status === 'running' || s.status === 'starting' ? 1 : 2)

// Daftar semua sesi dengan pencarian. Dipakai sebagai layar utama di HP dan sebagai sidebar di browser lebar.
export default function SessionList({ activeId, fab }: { activeId?: string; fab?: boolean }) {
  const c = useClient()
  const insets = useSafeAreaInsets()
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return c.sessions
      .filter(s => !needle || s.title.toLowerCase().includes(needle) || s.cwd.toLowerCase().includes(needle))
      .sort((a, b) => rank(a) - rank(b) || b.mtime - a.mtime)
  }, [c.sessions, q])

  return (
    <View style={{ flex: 1 }}>
      {c.conn === 'unauthorized' ? (
        <Pressable style={s.banner} onPress={() => router.push('/pair')}>
          <Text style={s.bannerText}>Token perangkat ini tidak berlaku lagi. Ketuk untuk pairing ulang.</Text>
        </Pressable>
      ) : null}
      <TextInput style={s.search} placeholder="Cari sesi atau folder" placeholderTextColor={C.faint} value={q} onChangeText={setQ} />
      <FlatList
        data={list}
        keyExtractor={x => x.id}
        refreshControl={<RefreshControl refreshing={c.sessionsLoading} onRefresh={() => c.refreshSessions()} tintColor={C.accent} colors={[C.accent]} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + (fab ? 96 : 16) }}
        renderItem={({ item }) => <Row s={item} active={item.id === activeId} />}
        ListEmptyComponent={c.sessionsLoading ? undefined : <Text style={s.empty}>Belum ada sesi.</Text>}
        ListFooterComponent={
          <View style={s.footer}>
            <Text style={s.footerText}>Tampilkan sesi otomatis (Hermes, claude -p)</Text>
            <Switch value={c.showAutomated} onValueChange={v => c.setShowAutomated(v)} />
          </View>
        }
      />
      {fab ? (
        <Pressable style={[s.fab, { bottom: insets.bottom + 24 }]} onPress={() => router.push('/new')}>
          <Text style={s.fabText}>+</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function Row({ s: x, active }: { s: SessionSummary; active: boolean }) {
  const st = STATUS[x.status]
  // browser lebar: satu percakapan di panel kanan; layar yang ditumpuk akan tetap terpasang di latar
  const wide = useWide()
  return (
    <Pressable
      style={({ pressed }) => [s.row, active && s.rowActive, pressed && { backgroundColor: C.panel }]}
      onPress={() => (wide ? router.replace(`/session/${x.id}`) : router.push(`/session/${x.id}`))}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{x.title}</Text>
        <Text style={s.rowSub} numberOfLines={1}>
          {shortPath(x.cwd) || x.project} · {timeAgo(x.mtime)}{x.automated ? ' · otomatis' : ''}
        </Text>
      </View>
      {x.pending > 0 ? (
        <View style={s.badge}><Text style={s.badgeText}>{x.pending}</Text></View>
      ) : st.label ? (
        <Text style={[s.status, { color: st.color }]}>{st.label}</Text>
      ) : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  banner: { backgroundColor: '#3a1f1f', padding: 12 },
  bannerText: { color: C.err },
  search: { color: C.text, backgroundColor: C.panel, margin: 10, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomColor: C.border, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  rowActive: { backgroundColor: C.panel2, borderLeftColor: C.accent },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: C.dim, fontSize: 12, marginTop: 3 },
  status: { fontSize: 12, fontWeight: '600' },
  badge: { backgroundColor: C.warn, borderRadius: 11, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#0f1115', fontWeight: '800', fontSize: 12 },
  empty: { color: C.dim, textAlign: 'center', marginTop: 40 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  footerText: { color: C.dim, fontSize: 13, flex: 1 },
  fab: { position: 'absolute', right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  fabText: { color: '#0f1115', fontSize: 30, fontWeight: '700', marginTop: -2 },
})
