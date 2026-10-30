import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useClient } from '../lib/client'
import { C } from '../lib/theme'

export default function Toast() {
  const c = useClient()
  const insets = useSafeAreaInsets()
  if (!c.toast) return null
  return (
    <View pointerEvents="none" style={[s.wrap, { bottom: insets.bottom + 80 }]}>
      <Text style={s.text}>{c.toast}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, backgroundColor: C.panel2, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: 12 },
  text: { color: C.text, fontSize: 14 },
})
