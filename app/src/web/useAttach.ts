import { type DragEvent, useCallback, useEffect, useState } from 'react'
import { client } from '../lib/client'
import { type Attachment, MAX_IMAGES, attachDoc, attachFile } from '../lib/images'

// Lampiran gambar di desktop: tombol pilih berkas, seret-lepas, dan tempel (Ctrl+V) dari clipboard
export function useAttach() {
  const [items, setItems] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)

  const add = useCallback((files: File[]) => {
    if (!files.length) return
    setBusy(true)
    Promise.all(files.map(f => (f.type.startsWith('image/') ? attachFile(f) : attachDoc(f, f.name, `doc:${f.name}:${f.size}:${Date.now()}`))))
      .then(added => setItems(cur => [...cur, ...added].slice(0, MAX_IMAGES)))
      .catch(e => client.showToast(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false))
  }, [])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
      if (!files.length) return
      e.preventDefault()
      add(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [add])

  return {
    items, busy, add,
    remove: (uri: string) => setItems(cur => cur.filter(i => i.uri !== uri)),
    clear: () => setItems([]),
  }
}

export function useDrop(onFiles: (files: File[]) => void) {
  const [drag, setDrag] = useState(false)
  const bind = {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      setDrag(true)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false)
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setDrag(false)
      onFiles(Array.from(e.dataTransfer.files))
    },
  }
  return { drag, bind }
}
