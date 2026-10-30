import { Stack, router, usePathname } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import Icon from '../components/Icon'
import NotifToggle from '../components/NotifToggle'
import SessionList from '../components/SessionList'
import Toast from '../components/Toast'
import { client, useClient } from '../lib/client'
import { useWide } from '../lib/layout'
import { C } from '../lib/theme'

export default function RootLayout() {
  useEffect(() => {
    void client.init()
  }, [])
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <StatusBar style="light" />
        <Shell />
        <Toast />
      </KeyboardProvider>
    </SafeAreaProvider>
  )
}

// Layar lebar di browser: sidebar daftar sesi permanen di kiri, halaman aktif di kanan.
function Shell() {
  const c = useClient()
  const wide = useWide()
  return (
    <View style={s.shell}>
      {wide && c.paired ? <Sidebar /> : null}
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.panel },
            headerTintColor: C.text,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: C.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'itsvibes', headerShown: !wide }} />
          <Stack.Screen name="pair" options={{ title: 'Pasangkan dengan Bima' }} />
          <Stack.Screen name="new" options={{ title: 'Sesi baru' }} />
          <Stack.Screen name="settings" options={{ title: 'Pengaturan' }} />
          <Stack.Screen name="session/[id]" options={{ headerShown: false }} />
        </Stack>
      </View>
    </View>
  )
}

function Sidebar() {
  const c = useClient()
  const active = /^\/session\/([^/]+)/.exec(usePathname())?.[1]
  const dot = c.conn === 'online' ? C.ok : c.conn === 'connecting' ? C.warn : C.err
  return (
    <View style={s.sidebar}>
      <View style={s.head}>
        <View style={[s.dot, { backgroundColor: dot }]} />
        <Text style={s.title}>itsvibes</Text>
        <View style={{ flex: 1 }} />
        <NotifToggle />
        <Pressable onPress={() => router.replace('/settings')} hitSlop={10}>
          <Icon name="settings" size={22} />
        </Pressable>
      </View>
      <Pressable style={s.newBtn} onPress={() => router.replace('/new')}>
        <Icon name="plus" size={18} color={C.bg} />
        <Text style={s.newText}>Sesi baru</Text>
      </Pressable>
      <SessionList activeId={active} />
    </View>
  )
}

const s = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  sidebar: { width: 340, backgroundColor: C.panel, borderRightColor: C.border, borderRightWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 14 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  title: { color: C.text, fontSize: 18, fontWeight: '700' },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 10, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 10 },
  newText: { color: C.bg, fontWeight: '800', fontSize: 15 },
})
