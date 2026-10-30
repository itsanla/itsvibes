import { Platform, useWindowDimensions } from 'react-native'

// Di browser dengan jendela lebar, daftar sesi tampil permanen di kiri dan percakapan di kanan.
export const WIDE_MIN = 900

export function useWide(): boolean {
  const { width } = useWindowDimensions()
  return Platform.OS === 'web' && width >= WIDE_MIN
}

// kolom isi dibatasi supaya baris teks di layar lebar tidak terlalu panjang
export const COLUMN = { width: '100%', maxWidth: 860, alignSelf: 'center' } as const
export const COLUMN_NARROW = { width: '100%', maxWidth: 640, alignSelf: 'center' } as const
