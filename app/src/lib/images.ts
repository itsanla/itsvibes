import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import type { ImageAttachment } from '../../../shared/protocol'

// doc terisi untuk berkas non-gambar yang sudah diunggah ke Bima: yang dikirim ke Claude hanya path-nya
export interface Attachment extends ImageAttachment { uri: string; doc?: { name: string; path: string } }

// sisi terpanjang yang disarankan Anthropic; foto kamera 12 MP jadi beberapa ratus KB saja
const MAX_EDGE = 1568
export const MAX_IMAGES = 6

async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<Attachment> {
  const ctx = ImageManipulator.manipulate(asset.uri)
  if (Math.max(asset.width, asset.height) > MAX_EDGE) {
    ctx.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE })
  }
  const img = await ctx.renderAsync()
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true })
  return { uri: out.uri, mediaType: 'image/jpeg', data: out.base64 ?? '' }
}

export async function pickImages(source: 'library' | 'camera', remaining: number): Promise<Attachment[]> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) throw new Error('Izin kamera ditolak')
  }
  const res = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 1,
      })
  if (res.canceled) return []
  return Promise.all(res.assets.slice(0, remaining).map(shrink))
}

// Web: gambar dari clipboard (Ctrl+V) berupa File, diperkecil dengan jalur yang sama seperti foto dari galeri
export async function attachFile(file: File): Promise<Attachment> {
  const uri = URL.createObjectURL(file)
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Gambar tidak bisa dibaca'))
    img.src = uri
  })
  return shrink({ uri, ...size } as ImagePicker.ImagePickerAsset)
}

export const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.md,.json,.zip'

// Unggah satu berkas dokumen; lampirannya hanya berisi path di server (tanpa isi) supaya riwayat tidak membengkak
export async function pickDocs(remaining: number): Promise<Attachment[]> {
  const DocumentPicker = await import('expo-document-picker')
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true })
  if (res.canceled) return []
  return Promise.all(
    res.assets.slice(0, remaining).map(async a => {
      const blob = await (await fetch(a.uri)).blob()
      return attachDoc(blob, a.name, a.uri)
    }),
  )
}

export async function attachDoc(blob: Blob, name: string, uri: string): Promise<Attachment> {
  const { client } = await import('./client')
  const up = await client.uploadFile(blob, name)
  return { uri, mediaType: 'image/jpeg', data: '', doc: { name: up.name, path: up.path } }
}
