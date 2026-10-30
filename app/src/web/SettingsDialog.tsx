import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { useClient } from '../lib/client'
import Notifier from '../lib/notifier'
import { Dialog, copyText, setUI } from './ui'

export default function SettingsDialog() {
  const c = useClient()
  const [, tick] = useState(0)
  const [code, setCode] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 2000)
    return () => clearInterval(t)
  }, [])
  const close = () => setUI({ settings: false })
  const st = Notifier?.status()
  const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

  return (
    <Dialog title="Pengaturan" onClose={close}>
      <div className="iv-sec">
        <h5>Server</h5>
        <div className="iv-line"><span>Alamat</span><span>{c.url}</span></div>
        <div className="iv-line"><span>Koneksi</span><span>{c.conn === 'online' ? 'Tersambung' : c.conn === 'unauthorized' ? 'Token tidak berlaku' : c.conn === 'connecting' ? 'Menyambung…' : 'Terputus'}</span></div>
      </div>

      <div className="iv-sec">
        <h5>Notifikasi browser</h5>
        <p>Notifikasi muncul saat Claude selesai, butuh izin, atau error, selama tab itsvibes terbuka (boleh di latar belakang).</p>
        <div className="iv-line"><span>Status</span><span>{!st?.enabled ? 'Mati' : st.connected ? 'Aktif, tersambung' : 'Aktif, menyambung…'}</span></div>
        <div className="iv-line"><span>Izin browser</span><span>{perm === 'granted' ? 'Diizinkan' : perm === 'denied' ? 'Ditolak' : perm === 'default' ? 'Belum ditanya' : 'Tidak didukung'}</span></div>
        {perm === 'denied' ? <p style={{ marginTop: 8 }}>Izin ditolak di browser. Ubah lewat ikon gembok di sebelah alamat, lalu muat ulang halaman.</p> : null}
        <div style={{ marginTop: 8 }}>
          <button className="iv-btn" onClick={() => void c.setNotifier(!st?.enabled)}>{st?.enabled ? 'Matikan notifikasi' : 'Nyalakan notifikasi'}</button>
        </div>
      </div>

      <div className="iv-sec">
        <h5>Daftar sesi</h5>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={c.showAutomated} onChange={e => c.setShowAutomated(e.target.checked)} />
          Tampilkan sesi otomatis (Hermes, claude -p)
        </label>
      </div>

      <div className="iv-sec">
        <h5>Perangkat</h5>
        <p>Untuk memasangkan browser atau HP lain, buat kode di sini lalu masukkan di layar pairing perangkat itu. Tidak perlu membuka terminal Bima.</p>
        {code ? (
          <>
            <div className="iv-bigcode">{code}</div>
            <p style={{ textAlign: 'center' }}>Berlaku 10 menit, sekali pakai.</p>
            <div style={{ textAlign: 'center' }}><button className="iv-btn" onClick={() => { copyText(code); c.showToast('Kode disalin') }}>Salin kode</button></div>
          </>
        ) : (
          <button className="iv-btn" onClick={() => c.newPairCode().then(setCode, e => c.showToast(e instanceof Error ? e.message : String(e)))}>Buat kode pairing untuk perangkat lain</button>
        )}
        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '14px 0' }} />
        {confirm ? (
          <div>
            <p>Token dihapus dari browser ini. Untuk tersambung lagi perlu kode pairing baru.</p>
            <button className="iv-btn danger" onClick={() => { setUI({ settings: false }); void c.logout().then(() => router.replace('/pair')) }}>Ya, putuskan</button>{' '}
            <button className="iv-btn" onClick={() => setConfirm(false)}>Batal</button>
          </div>
        ) : (
          <button className="iv-btn danger" onClick={() => setConfirm(true)}>Putuskan perangkat ini</button>
        )}
      </div>
      <p style={{ textAlign: 'center', color: 'var(--faint)', fontSize: 12 }}>itsvibes {Constants.expoConfig?.version ?? ''} (web desktop)</p>
    </Dialog>
  )
}
