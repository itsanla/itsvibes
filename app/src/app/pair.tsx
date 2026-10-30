import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native'
import { DEFAULT_URL, useClient } from '../lib/client'
import { COLUMN_NARROW } from '../lib/layout'
import { C, mono } from '../lib/theme'

export default function Pair() {
  const c = useClient()
  const [url, setUrl] = useState(c.url || DEFAULT_URL)
  const [code, setCode] = useState('')
  const [name, setName] = useState('Samsung S21+')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await c.pair(url, code, name)
      router.replace('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={[s.wrap, COLUMN_NARROW]} keyboardShouldPersistTaps="handled">
      <Text style={s.lead}>Buat kode pairing di terminal Bima:</Text>
      <Text selectable style={s.cmd}>itsvibes-pair</Text>
      <Text style={s.lead}>
        atau di itsvibes yang sudah terpasang di perangkat lain: Pengaturan, lalu Buat kode pairing untuk perangkat lain.
        Kode berlaku 10 menit dan hanya bisa dipakai sekali.
      </Text>
      <Text style={s.label}>Alamat server</Text>
      <TextInput style={s.input} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <Text style={s.label}>Kode 6 digit</Text>
      <TextInput style={[s.input, s.code]} value={code} onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} />
      <Text style={s.label}>Nama perangkat</Text>
      <TextInput style={s.input} value={name} onChangeText={setName} />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable style={[s.btn, (busy || code.length !== 6) && { opacity: 0.5 }]} disabled={busy || code.length !== 6} onPress={submit}>
        {busy ? <ActivityIndicator color="#0f1115" /> : <Text style={s.btnText}>Pasangkan</Text>}
      </Pressable>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  wrap: { padding: 20, gap: 6 },
  lead: { color: C.dim, fontSize: 14 },
  cmd: { color: C.accent, fontFamily: mono, fontSize: 16, backgroundColor: C.code, padding: 10, borderRadius: 8, marginVertical: 6 },
  label: { color: C.text, fontSize: 14, fontWeight: '600', marginTop: 14 },
  input: { color: C.text, backgroundColor: C.panel, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  code: { fontSize: 26, letterSpacing: 8, textAlign: 'center', fontFamily: mono },
  error: { color: C.err, marginTop: 10 },
  btn: { backgroundColor: C.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#0f1115', fontWeight: '800', fontSize: 16 },
})
