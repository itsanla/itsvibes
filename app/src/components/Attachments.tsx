import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { client } from '../lib/client'
import { type Attachment, MAX_IMAGES, attachFile, pickImages } from '../lib/images'
import { C } from '../lib/theme'
import Icon from './Icon'
import Sheet, { Group, Row } from './Sheet'

export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(false)

  const pick = (source: 'library' | 'camera') => {
    setPicker(false)
    setBusy(true)
    pickImages(source, MAX_IMAGES - items.length)
      .then(added => setItems(cur => [...cur, ...added].slice(0, MAX_IMAGES)))
      .catch(e => client.showToast(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false))
  }

  const ask = () => {
    if (items.length >= MAX_IMAGES) return client.showToast(`Maksimal ${MAX_IMAGES} foto per pesan`)
    // browser: langsung buka pemilih berkas, kamera tidak relevan di laptop
    if (Platform.OS === 'web') pick('library')
    else setPicker(true)
  }

  // Web: Ctrl+V dengan gambar di clipboard (misalnya tangkapan layar) menambah lampiran, hanya di layar yang aktif
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') return
      const onPaste = (e: ClipboardEvent) => {
        const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
        if (!files.length) return
        e.preventDefault()
        Promise.all(files.map(attachFile))
          .then(added => setItems(cur => [...cur, ...added].slice(0, MAX_IMAGES)))
          .catch(err => client.showToast(err instanceof Error ? err.message : String(err)))
      }
      document.addEventListener('paste', onPaste)
      return () => document.removeEventListener('paste', onPaste)
    }, []),
  )

  return {
    items, busy, ask, picker, pick,
    closePicker: () => setPicker(false),
    clear: () => setItems([]),
    remove: (uri: string) => setItems(cur => cur.filter(i => i.uri !== uri)),
  }
}

export function AttachButton({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  return (
    <Pressable style={s.btn} onPress={onPress} disabled={busy} hitSlop={6}>
      {busy ? <ActivityIndicator color={C.dim} size="small" /> : <Icon name="plus" size={20} color={C.text} />}
    </Pressable>
  )
}

export function AttachPreview({ items, onRemove }: { items: Attachment[]; onRemove: (uri: string) => void }) {
  if (!items.length) return null
  return (
    <ScrollView horizontal style={s.row} contentContainerStyle={{ gap: 8, paddingHorizontal: 6 }} keyboardShouldPersistTaps="handled">
      {items.map(i => (
        <View key={i.uri}>
          <Image source={{ uri: i.uri }} style={s.thumb} />
          <Pressable style={s.remove} onPress={() => onRemove(i.uri)} hitSlop={8}>
            <Icon name="close" size={12} color={C.bg} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  )
}

// bottom sheet "Kirim foto" dengan pilihan Kamera / Galeri, menggantikan Alert bawaan
export function AttachSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (source: 'camera' | 'library') => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Kirim foto" scroll={false}>
      <Group>
        <Row first title="Kamera" onPress={() => onPick('camera')} right={<Icon name="camera" size={22} color={C.dim} />} />
        <Row last title="Galeri" onPress={() => onPick('library')} right={<Icon name="image" size={22} color={C.dim} />} />
      </Group>
    </Sheet>
  )
}

const s = StyleSheet.create({
  btn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  row: { flexGrow: 0, paddingTop: 4, paddingBottom: 6 },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: C.panel2 },
  remove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: C.err, alignItems: 'center', justifyContent: 'center' },
})
