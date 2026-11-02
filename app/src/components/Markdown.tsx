import { memo, type ReactNode, useMemo } from 'react'
import { Text, type TextStyle, View } from 'react-native'
import { Renderer, useMarkdown } from 'react-native-marked'
import { linkifyMarkdown } from '../lib/filepaths'
import { C } from '../lib/theme'
import { useOpenFile } from './FileViewer'

// tautan ivfile: (path gambar/PDF) membuka pratinjau; tautan lain tetap lewat perilaku bawaan
class FileRenderer extends Renderer {
  private open: (path: string) => void
  constructor(open: (path: string) => void) {
    super()
    this.open = open
  }
  link(children: string | ReactNode[], href: string, styles?: TextStyle, title?: string): ReactNode {
    if (!href.startsWith('ivfile:')) return super.link(children, href, styles, title)
    return <Text key={href + String(Math.random())} style={styles} onPress={() => this.open(href.slice(7))}>{children}</Text>
  }
}

// Jawaban Claude ditulis dalam markdown (tabel, blok kode, daftar)
function Markdown({ text }: { text: string }) {
  const open = useOpenFile()
  const renderer = useMemo(() => new FileRenderer(open), [open])
  const elements = useMarkdown(linkifyMarkdown(text), {
    colorScheme: 'dark',
    renderer,
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
