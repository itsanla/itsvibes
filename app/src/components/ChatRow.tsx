import { memo, useEffect, useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ChatItem } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import { C } from '../lib/theme'
import Markdown from './Markdown'
import Sheet from './Sheet'

// Pesan Claude, pesan pengguna, blok berpikir, dan catatan sistem. Langkah tool (kind 'tool' /
// 'tool_result') dirender terpisah lewat ToolGroup, jadi tidak muncul di sini.
// gambar yang diunggah ke satu pesan, diambil lagi dari riwayat sesi di Bima; ketuk untuk memperbesar
function UserImages({ sessionId, uuid, count }: { sessionId: string; uuid: string; count: number }) {
  const c = useClient()
  const [uris, setUris] = useState<string[] | null>(null)
  const [big, setBig] = useState<string | null>(null)
  const [ratio, setRatio] = useState(1)
  useEffect(() => {
    let dead = false
    c.userImages(sessionId, uuid).then(u => !dead && setUris(u), () => !dead && setUris([]))
    return () => {
      dead = true
    }
  }, [c, sessionId, uuid])
  if (uris && !uris.length) return <Text style={s.note}>{count} gambar</Text>
  return (
    <>
      <View style={s.thumbs}>
        {(uris ?? Array.from({ length: count }, () => '')).map((u, i) => u ? (
          <Pressable key={i} onPress={() => { setRatio(1); setBig(u) }} style={s.thumb}>
            <Image source={{ uri: u }} style={s.thumbImg} />
          </Pressable>
        ) : (
          <View key={i} style={[s.thumb, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="small" color={C.accent} /></View>
        ))}
      </View>
      <Sheet visible={big !== null} onClose={() => setBig(null)} title="Gambar">
        {big ? (
          <Image
            source={{ uri: big }}
            style={[s.big, { aspectRatio: ratio }]}
            resizeMode="contain"
            onLoad={e => {
              const { width, height } = e.nativeEvent.source
              if (width && height) setRatio(width / height)
            }}
          />
        ) : null}
      </Sheet>
    </>
  )
}

function ChatRow({ item, sessionId }: { item: ChatItem; sessionId: string }) {
  const [open, setOpen] = useState(false)
  switch (item.k) {
    case 'user':
      return (
        <View style={[s.row, s.right]}>
          <View style={s.userBubble}>
            <Text selectable style={s.text}>{item.text}</Text>
            {item.images ? <UserImages sessionId={sessionId} uuid={item.id} count={item.images} /> : null}
          </View>
        </View>
      )
    case 'assistant':
      return (
        <View style={s.row}>
          <View style={s.assistant}>
            <Markdown text={item.text} />
          </View>
        </View>
      )
    case 'thinking':
      return (
        <Pressable onPress={() => setOpen(!open)} style={s.row}>
          <Text style={s.thinking} numberOfLines={open ? undefined : 1}>
            {open ? item.text : `Berpikir: ${item.text.replace(/\s+/g, ' ')}`}
          </Text>
        </Pressable>
      )
    case 'system':
      return (
        <View style={[s.row, { alignItems: 'center' }]}>
          <Text style={s.system}>{item.text}</Text>
        </View>
      )
    case 'tool':
    case 'tool_result':
      return null
  }
}

export default memo(ChatRow)

const s = StyleSheet.create({
  row: { paddingHorizontal: 14, paddingVertical: 4 },
  right: { alignItems: 'flex-end' },
  userBubble: { backgroundColor: C.user, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, maxWidth: '88%' },
  assistant: { paddingHorizontal: 2 },
  text: { color: C.text, fontSize: 15, lineHeight: 21 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  thumb: { width: 84, height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: C.code },
  thumbImg: { width: '100%', height: '100%' },
  big: { width: '100%', borderRadius: 14, backgroundColor: C.code },
  note: { color: C.dim, fontSize: 12, marginTop: 4 },
  thinking: { color: C.faint, fontStyle: 'italic', fontSize: 13 },
  system: { color: C.faint, fontSize: 12, textAlign: 'center' },
})
