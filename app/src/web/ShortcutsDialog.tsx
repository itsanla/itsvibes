import { Dialog, setUI } from './ui'

const ROWS: [string[], string][] = [
  [['Enter'], 'Kirim pesan'],
  [['Shift', 'Enter'], 'Baris baru'],
  [['Esc'], 'Hentikan Claude yang sedang bekerja (saat kolom ketik aktif)'],
  [['Ctrl', 'K'], 'Cari sesi'],
  [['Ctrl', 'Shift', 'O'], 'Sesi baru'],
  [['Ctrl', 'B'], 'Tampilkan atau sembunyikan sidebar'],
  [['Ctrl', '\\'], 'Tampilkan atau sembunyikan panel penggunaan'],
  [['/'], 'Fokus ke kolom ketik'],
  [['Ctrl', 'V'], 'Tempel gambar dari clipboard'],
  [['?'], 'Bantuan ini'],
]

export default function ShortcutsDialog() {
  return (
    <Dialog title="Pintasan keyboard" onClose={() => setUI({ shortcuts: false })} width={500}>
      <table className="iv-table">
        <tbody>
          {ROWS.map(([keys, what]) => (
            <tr key={what}>
              <td>{keys.map(k => <span key={k} className="iv-key">{k}</span>)}</td>
              <td>{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: 'var(--faint)', fontSize: 12 }}>Di Mac, Ctrl diganti Cmd.</p>
    </Dialog>
  )
}
