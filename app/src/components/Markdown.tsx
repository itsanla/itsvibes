import { memo } from 'react'
import { View } from 'react-native'
import { useMarkdown } from 'react-native-marked'
import { C } from '../lib/theme'

// Jawaban Claude ditulis dalam markdown (tabel, blok kode, daftar)
function Markdown({ text }: { text: string }) {
  const elements = useMarkdown(text, {
    colorScheme: 'dark',
    theme: { colors: { text: C.text, link: C.link, code: C.code, border: C.border } },
    styles: {
      text: { fontSize: 15, lineHeight: 22 },
      paragraph: { paddingVertical: 2, backgroundColor: 'transparent' },
      codespan: { fontSize: 13, backgroundColor: C.code },
      code: { backgroundColor: C.code, borderRadius: 8, padding: 10 },
      table: { borderColor: C.border },
    },
  })
  return <View>{elements}</View>
}

export default memo(Markdown)
