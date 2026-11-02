import { useEffect, useState } from 'react'
import { Animated, Easing, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ShellTask } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import { C, mono } from '../lib/theme'
import Icon from './Icon'
import Sheet from './Sheet'

// Lencana di atas kolom pesan: browser yang sedang dipakai Claude dan shell latar belakang yang masih hidup.
export default function SessionBadges({ sessionId, browser, shells }: { sessionId: string; browser: boolean; shells: ShellTask[] }) {
  const c = useClient()
  const [open, setOpen] = useState(false)
  if (!browser && !shells.length) return null
  return (
    <View style={s.row}>
      {browser ? (
        <Pressable style={s.badge} onPress={() => void Linking.openURL(`${c.url}/browser?s=${sessionId}`)}>
          <View style={s.dot} />
          <Icon name="globe" size={15} color={C.dim} />
          <Text style={s.text}>Browser aktif</Text>
        </Pressable>
      ) : null}
      {shells.length ? (
        <Pressable style={s.badge} onPress={() => setOpen(true)}>
          <View style={s.dot} />
          <Icon name="terminal" size={15} color={C.dim} />
          <Text style={s.text}>{shells.length} shell aktif</Text>
        </Pressable>
      ) : null}
      <Sheet visible={open && shells.length > 0} onClose={() => setOpen(false)} title="Shell aktif">
        <Text style={s.sub}>{shells.length} berjalan di latar belakang</Text>
        {shells.map(x => (
          <View key={x.id} style={s.shell}>
            <View style={s.shellTop}>
              <Icon name="terminal" size={16} color={C.dim} />
              <Text style={s.shellKind}>{x.type === 'local_bash' ? 'Shell' : 'Monitor'}</Text>
              <Text style={s.shellId} numberOfLines={1}>{x.id}</Text>
            </View>
            <Text selectable style={s.code}>{x.description}</Text>
          </View>
        ))}
      </Sheet>
    </View>
  )
}

const clock = (ms: number) => {
  const sec = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

// Compact tidak melaporkan persentase, jadi batangnya bergerak terus dan waktu berjalan menunjukkan prosesnya hidup
export function CompactBar({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  const [x] = useState(() => new Animated.Value(0))
  const [w, setW] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }))
    loop.start()
    return () => loop.stop()
  }, [x])
  return (
    <View style={s.compact}>
      <View style={s.compactTop}>
        <Text style={s.compactTitle}>Meringkas percakapan (compact)</Text>
        <Text style={s.compactTime}>{clock(now - since)}</Text>
      </View>
      <View style={s.track} onLayout={e => setW(e.nativeEvent.layout.width)}>
        <Animated.View style={[s.fill, { width: w * 0.35, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.35, w] }) }] }]} />
      </View>
      <Text style={s.compactNote}>Claude tidak macet. Ia sedang merangkum riwayat supaya konteks muat, lalu lanjut sendiri.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ok },
  text: { color: C.text, fontSize: 13 },
  sub: { color: C.dim, fontSize: 14, marginBottom: 12, marginLeft: 6 },
  shell: { backgroundColor: C.card, borderRadius: 18, padding: 14, marginBottom: 10, gap: 8 },
  shellTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shellKind: { color: C.text, fontSize: 15, fontWeight: '700' },
  shellId: { color: C.faint, fontFamily: mono, fontSize: 12, flex: 1 },
  code: { color: C.dim, fontFamily: mono, fontSize: 12, backgroundColor: C.code, padding: 10, borderRadius: 8 },
  compact: { marginHorizontal: 14, marginBottom: 8, backgroundColor: C.card, borderRadius: 16, padding: 12, gap: 8 },
  compactTop: { flexDirection: 'row', justifyContent: 'space-between' },
  compactTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  compactTime: { color: C.dim, fontSize: 13, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: '#3a3a3a', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: C.accent },
  compactNote: { color: C.dim, fontSize: 12.5, lineHeight: 17 },
})
