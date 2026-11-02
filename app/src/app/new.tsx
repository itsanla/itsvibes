import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EffortLevel } from '../../../shared/protocol'
import { AttachSheet, useAttachments } from '../components/Attachments'
import Composer from '../components/Composer'
import ModelSheet, { modelLabel } from '../components/ModelSheet'
import { modelsFor } from '../lib/models'
import { useClient } from '../lib/client'
import { COLUMN, useWide } from '../lib/layout'
import { C } from '../lib/theme'

// Sesi baru selalu dibuat di home Bima (~); server memakai folder itu kalau aplikasi tidak menyebut folder lain
export default function NewSession() {
  const c = useClient()
  const insets = useSafeAreaInsets()
  const wide = useWide()
  const att = useAttachments()
  const [text, setText] = useState('')
  const [model, setModel] = useState<string>()
  const [effort, setEffort] = useState<EffortLevel>()
  const [modelOpen, setModelOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    c.requestModels()
  }, [c])

  const canStart = (!!text.trim() || att.items.length > 0) && !busy
  const start = async () => {
    setBusy(true)
    try {
      const id = await c.send(text.trim(), { images: att.items, model, effort })
      router.replace(`/session/${id}`)
    } catch (e) {
      c.showToast(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.body}>
        <Text style={s.where}>Folder kerja: ~ (home Bima)</Text>
      </View>
      <View style={[{ paddingBottom: insets.bottom + 10, paddingTop: 6 }, wide && COLUMN]}>
        <Composer
          value={text}
          onChangeText={setText}
          onSend={start}
          busy={false}
          canSend={canStart}
          placeholder="Pesan pertama untuk Claude"
          autoFocus
          modelText={modelLabel(model, c.models)}
          effort={effort}
          onOpenModel={() => { c.requestModels(); setModelOpen(true) }}
          attachItems={att.items}
          onRemoveAttach={att.remove}
          onAttach={att.ask}
          attachBusy={att.busy}
        />
        {busy ? <ActivityIndicator style={{ marginTop: 10 }} color={C.accent} /> : null}
      </View>

      <AttachSheet visible={att.picker} onClose={att.closePicker} onPick={att.pick} />

      <ModelSheet
        visible={modelOpen}
        onClose={() => setModelOpen(false)}
        models={modelsFor(c.models, c.settings?.source)}
        model={model}
        effort={effort}
        onModel={setModel}
        onEffort={v => setEffort(v === 'default' ? undefined : v)}
      />
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  body: { flex: 1, padding: 16 },
  where: { color: C.dim, fontSize: 14 },
})
