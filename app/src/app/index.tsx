import { Redirect, Stack, router } from 'expo-router'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Icon from '../components/Icon'
import NotifToggle from '../components/NotifToggle'
import SessionList from '../components/SessionList'
import { useClient } from '../lib/client'
import { useWide } from '../lib/layout'
import { C } from '../lib/theme'

export default function Sessions() {
  const c = useClient()
  const wide = useWide()

  if (!c.ready) return <View style={s.center}><ActivityIndicator color={C.accent} /></View>
  if (!c.paired) return <Redirect href="/pair" />

  // layar lebar: daftar sesi sudah ada di sidebar, di sini cukup petunjuk
  if (wide) {
    return (
      <View style={s.center}>
        <Text style={s.emptyTitle}>Pilih sesi di kiri</Text>
        <Text style={s.emptySub}>atau mulai percakapan baru dengan Claude di Bima</Text>
        <Pressable style={s.newBtn} onPress={() => router.replace('/new')}>
          <Text style={s.newBtnText}>Sesi baru</Text>
        </Pressable>
      </View>
    )
  }

  const dot = c.conn === 'online' ? C.ok : c.conn === 'connecting' ? C.warn : C.err
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={s.titleRow}>
              <View style={[s.dot, { backgroundColor: dot }]} />
              <Text style={s.title}>itsvibes</Text>
            </View>
          ),
          headerRight: () => (
            <View style={s.headerRight}>
              <NotifToggle />
              <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
                <Icon name="settings" size={22} />
              </Pressable>
            </View>
          ),
        }}
      />
      <SessionList fab />
    </View>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  title: { color: C.text, fontSize: 18, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  emptyTitle: { color: C.text, fontSize: 20, fontWeight: '700' },
  emptySub: { color: C.dim, fontSize: 14 },
  newBtn: { marginTop: 14, backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 11 },
  newBtnText: { color: C.bg, fontWeight: '800', fontSize: 15 },
})
