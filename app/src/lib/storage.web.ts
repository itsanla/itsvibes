// Versi web dari storage.ts: localStorage milik origin itsvibes sendiri. Token hanya bisa dibaca oleh
// halaman dari origin ini, dan aplikasi tidak menampilkan HTML dari luar, jadi risikonya sama dengan
// token yang memang lewat di header setiap permintaan.
export const storage = {
  get: async (key: string): Promise<string | null> => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set: async (key: string, value: string): Promise<void> => {
    window.localStorage.setItem(key, value)
  },
  remove: async (key: string): Promise<void> => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // mode privat bisa menolak akses localStorage
    }
  },
}
