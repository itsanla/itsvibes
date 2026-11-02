import { Pressable, StyleSheet, Text, View } from 'react-native'
import { COMPACT_WINDOWS, type SourceId } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import { windowLabel } from '../lib/format'
import { C } from '../lib/theme'
import { SectionLabel } from './Sheet'

function Seg({ items }: { items: { key: string; label: string; on: boolean; off?: boolean; mark?: boolean; onPress: () => void }[] }) {
  return (
    <View style={s.seg}>
      {items.map(i => (
        <Pressable key={i.key} onPress={i.onPress} style={[s.item, i.on && s.itemOn, i.off && { opacity: 0.5 }]}>
          <Text style={[s.text, i.on && s.textOn]}>{i.label}{i.mark ? ' •' : ''}</Text>
        </Pressable>
      ))}
    </View>
  )
}

// Pilihan sumber AI dan ukuran autocompact, dipakai di sheet penggunaan dan layar pengaturan.
// Dengan `pick`, memilih sumber hanya melihat kuotanya; sumber baru dipakai setelah tombol Terapkan.
export default function AiControls({ pick, onPick, sessionId }: { pick?: SourceId; onPick?: (id: SourceId) => void; sessionId?: string } = {}) {
  const c = useClient()
  const v = c.settings
  if (!v) return null
  const deferred = !!onPick && !!pick
  const used = c.sourceOf(sessionId) ?? v.source // sumber yang dipakai sesi ini
  const shown = deferred ? pick : v.source
  const active = v.sources.find(x => x.id === shown)
  const current = v.sources.find(x => x.id === used)
  const pending = deferred && pick !== used
  return (
    <View>
      <SectionLabel>Sumber AI</SectionLabel>
      <Seg
        items={v.sources.map(x => ({
          key: x.id, label: x.label, on: x.id === shown, off: !x.ready, mark: deferred && x.id === used,
          onPress: () => (deferred ? onPick(x.id) : c.setSource(x.id)),
        }))}
      />
      <Text style={s.note}>{active?.hint}. Setelah ganti sumber, pesan berikutnya menulis ulang seluruh konteks ke cache.</Text>
      {pending ? (
        <View style={s.apply}>
          <Text style={[s.note, { flex: 1, margin: 0 }]}>Baru melihat kuota {active?.label}. Sumber yang dipakai masih {current?.label} (•).</Text>
          <Pressable disabled={!active?.ready} onPress={() => c.setSource(pick, sessionId)} style={[s.applyBtn, !active?.ready && { opacity: 0.5 }]}>
            <Text style={s.applyText}>Terapkan</Text>
          </Pressable>
        </View>
      ) : null}
      {v.sources.filter(x => !x.ready).map(x => <Text key={x.id} style={s.note} selectable>{x.label}: {x.hint}</Text>)}
      <SectionLabel>Autocompact</SectionLabel>
      <Seg items={COMPACT_WINDOWS.map(n => ({ key: String(n), label: windowLabel(n), on: n === v.compactWindow, onPress: () => c.setCompactWindow(n) }))} />
      <Text style={s.note}>Juga diringkas otomatis saat sesi berakhir atau menganggur 40 menit.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: C.card },
  item: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  itemOn: { backgroundColor: C.panel2 },
  text: { color: C.dim, fontSize: 15, fontWeight: '600' },
  textOn: { color: C.text },
  apply: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 12, marginTop: 6, marginBottom: 6 },
  applyBtn: { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  applyText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  note: { color: C.dim, fontSize: 13, lineHeight: 18, marginTop: 8, marginBottom: 6, marginLeft: 6 },
})
