import * as Clipboard from 'expo-clipboard'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { type ReactNode, useEffect, useState } from 'react'
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Sheet, { Group, Row } from '../components/Sheet'
import { COLUMN_NARROW } from '../lib/layout'
import { useClient } from '../lib/client'
import Notifier, { type NotifierStatus } from '../lib/notifier'
import { C, mono } from '../lib/theme'

const WEB = Platform.OS === 'web'

export default function Settings() {
  const c = useClient()
  const [ns, setNs] = useState<NotifierStatus | null>(() => Notifier?.status() ?? null)
  const [battery, setBattery] = useState<boolean | null>(() => Notifier?.isIgnoringBatteryOptimizations() ?? null)
  const [confirm, setConfirm] = useState(false)
  const [code, setCode] = useState<string | null>(null)

  const refresh = () => {
    setNs(Notifier?.status() ?? null)
    setBattery(Notifier?.isIgnoringBatteryOptimizations() ?? null)
  }
  useEffect(() => {
    const t = setInterval(refresh, 2000)
    const sub = AppState.addEventListener('change', refresh)
    return () => {
      clearInterval(t)
      sub.remove()
    }
  }, [])

  const siaga = ns?.enabled
  const makeCode = () => {
    c.newPairCode().then(setCode, e => c.showToast(e instanceof Error ? e.message : String(e)))
  }

  return (
    <ScrollView contentContainerStyle={[s.wrap, COLUMN_NARROW]}>
      <Section title="Server">
        <Line label="Alamat" value={c.url} />
        <Line label="Koneksi aplikasi" value={c.conn === 'online' ? 'Tersambung' : c.conn === 'unauthorized' ? 'Token tidak berlaku' : c.conn === 'connecting' ? 'Menyambung…' : 'Terputus'} />
      </Section>

      <Section title={WEB ? 'Notifikasi browser' : 'Notifikasi (mode siaga)'}>
        <Text style={s.help}>
          {WEB
            ? 'Notifikasi muncul saat Claude selesai, butuh izin, atau error, selama tab itsvibes terbuka (boleh di latar belakang). Browser akan meminta izin notifikasi saat dinyalakan.'
            : 'Mode siaga menjaga koneksi ke Bima di latar belakang supaya notifikasi selesai, butuh izin, dan error tetap masuk walau aplikasi ditutup.'}
        </Text>
        <Line label="Status" value={!Notifier ? 'Tidak tersedia di build ini' : !siaga ? 'Mati' : ns?.connected ? 'Aktif, tersambung' : 'Aktif, menyambung…'} />
        {Notifier ? (
          <Btn label={siaga ? 'Matikan notifikasi' : 'Nyalakan notifikasi'} onPress={() => {
            if (siaga) Notifier?.stop()
            else void c.startNotifier()
            setTimeout(refresh, 500)
          }} />
        ) : null}
        {!WEB && Notifier && battery === false ? (
          <>
            <Text style={s.help}>
              Samsung bisa menidurkan aplikasi di latar belakang sehingga notifikasi terlambat. Kecualikan itsvibes dari penghemat baterai, lalu di Pengaturan HP masukkan juga ke daftar aplikasi yang tidak pernah ditidurkan.
            </Text>
            <Btn label="Kecualikan dari penghemat baterai" onPress={() => Notifier?.requestIgnoreBatteryOptimizations()} />
          </>
        ) : !WEB && battery ? <Line label="Penghemat baterai" value="Sudah dikecualikan" /> : null}
      </Section>

      <Section title="Perangkat">
        <Text style={s.help}>
          Untuk memasangkan browser atau HP lain, buat kode di sini lalu masukkan di layar pairing perangkat itu. Tidak perlu membuka terminal Bima.
        </Text>
        <Btn label="Buat kode pairing untuk perangkat lain" onPress={makeCode} />
        <Btn label="Putuskan perangkat ini" danger onPress={() => setConfirm(true)} />
      </Section>
      <Text style={s.version}>itsvibes {Constants.expoConfig?.version ?? ''}{WEB ? ' (web)' : ''}</Text>

      <Sheet visible={code !== null} onClose={() => setCode(null)} title="Kode pairing">
        <Text style={s.code} selectable>{code}</Text>
        <Text style={s.help}>Berlaku 10 menit dan hanya bisa dipakai sekali. Masukkan di layar pairing perangkat yang ingin dipasangkan.</Text>
        <Group>
          <Row first last title="Salin kode" onPress={() => { void Clipboard.setStringAsync(code ?? ''); c.showToast('Kode disalin') }} />
        </Group>
      </Sheet>

      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Putuskan perangkat?">
        <Text style={s.help}>Token dihapus dari perangkat ini. Untuk tersambung lagi perlu kode pairing baru.</Text>
        <View style={{ height: 12 }} />
        <Group>
          <Row first title={<Text style={s.danger}>Putuskan</Text>} onPress={() => { setConfirm(false); void c.logout().then(() => router.replace('/pair')) }} />
          <Row last title="Batal" onPress={() => setConfirm(false)} />
        </Group>
      </Sheet>
    </ScrollView>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.line}>
      <Text style={s.lineLabel}>{label}</Text>
      <Text style={s.lineValue} selectable>{value}</Text>
    </View>
  )
}

function Btn({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable style={[s.btn, danger && { borderColor: C.err }]} onPress={onPress}>
      <Text style={[s.btnText, danger && { color: C.err }]}>{label}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  wrap: { padding: 14, gap: 14 },
  section: { backgroundColor: C.panel, borderRadius: 12, padding: 14, gap: 8 },
  sectionTitle: { color: C.accent, fontWeight: '700', fontSize: 13, textTransform: 'uppercase' },
  help: { color: C.dim, fontSize: 13, lineHeight: 19 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { color: C.dim, fontSize: 14 },
  lineValue: { color: C.text, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  btn: { borderColor: C.link, borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  btnText: { color: C.link, fontWeight: '700', fontSize: 14 },
  version: { color: C.faint, textAlign: 'center', fontSize: 12 },
  code: { color: C.text, fontFamily: mono, fontSize: 40, letterSpacing: 8, textAlign: 'center', marginVertical: 18 },
  danger: { color: C.err, fontSize: 17 },
})
