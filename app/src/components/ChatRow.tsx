import { memo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { ChatItem } from '../../../shared/protocol'
import { C } from '../lib/theme'
import Markdown from './Markdown'

// Pesan Claude, pesan pengguna, blok berpikir, dan catatan sistem. Langkah tool (kind 'tool' /
// 'tool_result') dirender terpisah lewat ToolGroup, jadi tidak muncul di sini.
function ChatRow({ item }: { item: ChatItem }) {
  const [open, setOpen] = useState(false)
  switch (item.k) {
    case 'user':
      return (
        <View style={[s.row, s.right]}>
          <View style={s.userBubble}>
            <Text selectable style={s.text}>{item.text}</Text>
            {item.images ? <Text style={s.note}>{item.images} gambar</Text> : null}
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
  note: { color: C.dim, fontSize: 12, marginTop: 4 },
  thinking: { color: C.faint, fontStyle: 'italic', fontSize: 13 },
  system: { color: C.faint, fontSize: 12, textAlign: 'center' },
})
