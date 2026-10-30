import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { EffortLevel } from '../../../shared/protocol'
import { useWide } from '../lib/layout'
import { C } from '../lib/theme'
import type { Attachment } from '../lib/images'
import { AttachButton, AttachPreview } from './Attachments'
import Icon from './Icon'
import { effortLabel } from './ModelSheet'

// Kolom ketik ala aplikasi Claude: kartu bulat berisi input teks, lalu baris tombol
// (lampirkan, chip model+upaya yang membuka ModelSheet, kirim/hentikan).
export default function Composer({
  value, onChangeText, onSend, onStop, busy, canSend, placeholder, autoFocus,
  modelText, effort, onOpenModel,
  attachItems, onRemoveAttach, onAttach, attachBusy,
}: {
  value: string
  onChangeText: (t: string) => void
  onSend: () => void
  onStop?: () => void
  busy: boolean
  canSend: boolean
  placeholder: string
  autoFocus?: boolean
  modelText: string
  effort?: EffortLevel
  onOpenModel: () => void
  attachItems: Attachment[]
  onRemoveAttach: (uri: string) => void
  onAttach: () => void
  attachBusy: boolean
}) {
  const showStop = busy && !!onStop
  const wide = useWide()
  // browser desktop: Enter mengirim, Shift+Enter baris baru (seperti kebanyakan aplikasi chat)
  const onKeyPress = wide
    ? (e: { nativeEvent: { key: string; shiftKey?: boolean; isComposing?: boolean }; preventDefault: () => void }) => {
        if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          if (canSend && !busy) onSend()
        }
      }
    : undefined
  return (
    <View style={s.card}>
      <AttachPreview items={attachItems} onRemove={onRemoveAttach} />
      <TextInput
        style={s.input}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        value={value}
        onChangeText={onChangeText}
        multiline
        autoFocus={autoFocus}
        onKeyPress={onKeyPress as never}
      />
      <View style={s.row}>
        <AttachButton onPress={onAttach} busy={attachBusy} />
        <Pressable style={s.chip} onPress={onOpenModel} hitSlop={4}>
          <Text style={s.chipText} numberOfLines={1}>
            {modelText}{effort ? `  ${effortLabel(effort)}` : ''}
          </Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {showStop ? (
          <Pressable style={[s.send, s.stop]} onPress={() => onStop?.()}>
            <Icon name="stop" size={14} color={C.bg} />
          </Pressable>
        ) : (
          <Pressable style={[s.send, !canSend && s.sendOff]} disabled={!canSend} onPress={onSend}>
            <Icon name="send" size={19} color={C.bg} />
          </Pressable>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: C.panel2, borderRadius: 26, marginHorizontal: 10, paddingTop: 10, paddingBottom: 8, paddingHorizontal: 6 },
  input: { color: C.text, fontSize: 16, lineHeight: 21, maxHeight: 150, paddingHorizontal: 10, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  chip: { backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 190 },
  chipText: { color: C.text, fontSize: 14, fontWeight: '600' },
  send: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.35 },
  stop: { backgroundColor: C.err },
})
