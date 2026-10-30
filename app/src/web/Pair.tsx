import { router } from 'expo-router'
import { useState } from 'react'
import { DEFAULT_URL, useClient } from '../lib/client'

export default function Pair() {
  const c = useClient()
  const [url, setUrl] = useState(c.url || DEFAULT_URL)
  const [code, setCode] = useState('')
  const [name, setName] = useState(() => `Browser desktop (${navigator.platform || 'web'})`)
  const [adv, setAdv] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (code.length !== 6 || busy) return
    setBusy(true)
    setError('')
    try {
      await c.pair(url, code, name)
      router.replace('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="iv-center" style={{ padding: 24 }}>
      <form className="iv-pair" onSubmit={e => { e.preventDefault(); void submit() }}>
        <h2>Pasangkan dengan Bima</h2>
        <p>Masukkan kode pairing 6 digit untuk menyambungkan browser ini.</p>
        <p style={{ fontSize: 13 }}>
          Buat kodenya di itsvibes yang sudah terpasang (Pengaturan, lalu <b>Buat kode pairing untuk perangkat lain</b>), atau jalankan <code>itsvibes-pair</code> di terminal Bima.
        </p>
        <label htmlFor="iv-code">Kode 6 digit</label>
        <input id="iv-code" className="code" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        <label htmlFor="iv-name">Nama perangkat</label>
        <input id="iv-name" value={name} onChange={e => setName(e.target.value)} />
        {adv ? (
          <>
            <label htmlFor="iv-url">Alamat server</label>
            <input id="iv-url" value={url} onChange={e => setUrl(e.target.value)} />
          </>
        ) : (
          <p style={{ margin: '10px 0 0', fontSize: 12 }}><button type="button" className="iv-tools-head" onClick={() => setAdv(true)}>Lanjutan: ubah alamat server</button></p>
        )}
        {error ? <p className="err">{error}</p> : null}
        <button className="iv-btn primary" type="submit" disabled={code.length !== 6 || busy} style={{ width: '100%', marginTop: 18, padding: 11 }}>
          {busy ? 'Menyambung…' : 'Sambungkan'}
        </button>
      </form>
    </div>
  )
}
