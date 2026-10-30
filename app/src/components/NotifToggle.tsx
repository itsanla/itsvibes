import { Pressable, StyleSheet, Text } from 'react-native'
import { useClient } from '../lib/client'
import { C } from '../lib/theme'

// tombol "Notif aktif/mati": menyalakan atau mematikan notifikasi di perangkat ini
export default function NotifToggle() {
  const c = useClient()
  const on = c.notifierOn
  return (
    <Pressable
      hitSlop={8}
      style={[s.btn, { borderColor: on ? C.ok : C.border }]}
      onPress={() => {
        void c.setNotifier(!on)
        c.showToast(on ? 'Notifikasi dimatikan. Nyalakan lagi saat jauh dari laptop.' : 'Notifikasi aktif')
      }}
    >
      <Text style={[s.text, { color: on ? C.ok : C.faint }]}>{on ? 'Notif aktif' : 'Notif mati'}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  btn: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontSize: 12, fontWeight: '700' },
})
