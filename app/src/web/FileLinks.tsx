import { createPortal } from 'react-dom'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { useClient } from '../lib/client'
import { splitPaths } from '../lib/filepaths'
import { Drawer, I } from './ui'

// folder kerja sesi, untuk menyelesaikan path relatif di sisi server
export const FileCwd = createContext<string | undefined>(undefined)

export function FileChip({ path, children }: { path: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <a
        href="#"
        className="iv-filelink"
        title="Lihat berkas"
        onClick={e => {
          e.preventDefault()
          setOpen(true)
        }}
      >
        {children ?? path}
      </a>
      {open ? createPortal(<span onClick={e => e.stopPropagation()}><FilePreview path={path} onClose={() => setOpen(false)} /></span>, document.body) : null}
    </>
  )
}

// teks polos dengan path yang bisa diklik
export function Linkified({ text }: { text: string }) {
  const parts = splitPaths(text)
  if (parts.length === 1 && typeof parts[0] === 'string') return <>{text}</>
  return <>{parts.map((p, i) => (typeof p === 'string' ? p : <FileChip key={i} path={p.path} />))}</>
}

function FilePreview({ path, onClose }: { path: string; onClose: () => void }) {
  const c = useClient()
  const cwd = useContext(FileCwd)
  const [f, setF] = useState<{ url: string; type: string; name: string } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let url = ''
    let dead = false
    c.fetchFile(path, cwd).then(
      r => {
        url = r.url
        if (dead) URL.revokeObjectURL(url)
        else setF(r)
      },
      e => !dead && setErr(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      dead = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [c, path, cwd])
  const pdf = f?.type === 'application/pdf'
  return (
    <Drawer title={f?.name ?? path.split('/').pop() ?? path} sub={path} onClose={onClose} wide>
      {err ? <div className="iv-sys">{err}</div> : !f ? <div className="iv-wait"><span className="iv-spin" /> Memuat…</div> : (
        <>
          <div className="iv-file-bar">
            <a href={f.url} target="_blank" rel="noreferrer"><I n="file" s={14} /> Buka di tab baru</a>
            <a href={f.url} download={f.name}>Unduh</a>
          </div>
          {pdf ? <iframe className="iv-file-pdf" src={f.url} title={f.name} /> : <img className="iv-file-img" src={f.url} alt={f.name} />}
        </>
      )}
    </Drawer>
  )
}
