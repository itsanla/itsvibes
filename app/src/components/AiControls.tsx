import { Pressable, StyleSheet, Text, View } from 'react-native'
import { COMPACT_WINDOWS } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import { windowLabel } from '../lib/format'
import { C } from '../lib/theme'
import { SectionLabel } from './Sheet'

function Seg({ items }: { items: { key: string; label: string; on: boolean; off?: boolean; onPress: () => void }[] }) {
  return (
    <View style={s.seg}>
      {items.map(i => (
        <Pressable key={i.key} onPress={i.onPress} style={[s.item, i.on && s.itemOn, i.off && { opacity: 0.5 }]}>
          <Text style={[s.text, i.on && s.textOn]}>{i.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

// Pilihan sumber AI dan ukuran autocompact, dipakai di sheet penggunaan dan layar pengaturan
export default function AiControls() {
  const c = useClient()
  const v = c.settings
  if (!v) return null
  const active = v.sources.find(x => x.id === v.source)
  return (
    <View>
      <SectionLabel>Sumber AI</SectionLabel>
      <Seg items={v.sources.map(x => ({ key: x.id, label: x.label, on: x.id === v.source, off: !x.ready, onPress: () => c.setSource(x.id) }))} />
      <Text style={s.note}>{active?.hint}. Setelah ganti sumber, pesan berikutnya menulis ulang seluruh konteks ke cache.</Text>
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
  note: { color: C.dim, fontSize: 13, lineHeight: 18, marginTop: 8, marginBottom: 6, marginLeft: 6 },
})
