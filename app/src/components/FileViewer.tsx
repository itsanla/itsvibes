import { type ReactNode, createContext, useContext, useEffect, useState } from 'react'
import { ActivityIndicator, Image, Linking, type StyleProp, StyleSheet, Text, type TextStyle } from 'react-native'
import { useClient } from '../lib/client'
import { isPdf, splitPaths } from '../lib/filepaths'
import { C } from '../lib/theme'
import Sheet, { Group, Row } from './Sheet'

// Satu pratinjau berkas per layar sesi: komponen mana pun memanggil open(path) lewat konteks.
const OpenFile = createContext<(path: string) => void>(() => {})
export const useOpenFile = () => useContext(OpenFile)

export function FileViewerProvider({ cwd, children }: { cwd?: string; children: ReactNode }) {
  const [path, setPath] = useState<string | null>(null)
  return (
    <OpenFile.Provider value={setPath}>
      {children}
      {path ? <FileSheet path={path} cwd={cwd} onClose={() => setPath(null)} /> : null}
    </OpenFile.Provider>
  )
}

function FileSheet({ path, cwd, onClose }: { path: string; cwd?: string; onClose: () => void }) {
  const c = useClient()
  const pdf = isPdf(path)
  const [img, setImg] = useState<{ uri: string; name: string } | null>(null)
  const [ratio, setRatio] = useState(1)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (pdf) return
    let dead = false
    c.fetchFileData(path, cwd).then(
      r => !dead && setImg(r),
      e => !dead && setErr(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      dead = true
    }
  }, [c, path, cwd, pdf])
  return (
    <Sheet visible onClose={onClose} title={img?.name ?? path.split('/').pop() ?? path}>
      <Text style={s.path} selectable>{path}</Text>
      {pdf ? (
        <Group>
          <Row first last title="Buka PDF di browser" subtitle="PDF dibuka oleh aplikasi pembaca di HP" onPress={() => void Linking.openURL(c.fileUrl(path, cwd))} />
        </Group>
      ) : err ? (
        <Text style={s.err}>{err}</Text>
      ) : !img ? (
        <ActivityIndicator style={{ margin: 24 }} color={C.accent} />
      ) : (
        <Image
          source={{ uri: img.uri }}
          style={[s.img, { aspectRatio: ratio }]}
          resizeMode="contain"
          onLoad={e => {
            const { width, height } = e.nativeEvent.source
            if (width && height) setRatio(width / height)
          }}
        />
      )}
    </Sheet>
  )
}

// teks polos dengan path gambar/PDF yang bisa diketuk (keluaran tool, perintah)
export function LinkedText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const open = useOpenFile()
  return (
    <Text selectable style={style}>
      {splitPaths(text).map((p, i) =>
        typeof p === 'string' ? p : <Text key={i} style={s.link} onPress={() => open(p.path)}>{p.path}</Text>,
      )}
    </Text>
  )
}

const s = StyleSheet.create({
  path: { color: C.dim, fontSize: 13, marginBottom: 12 },
  img: { width: '100%', borderRadius: 14, backgroundColor: C.code },
  err: { color: C.err, fontSize: 15, lineHeight: 21, marginVertical: 12 },
  link: { color: C.link, textDecorationLine: 'underline' },
})
