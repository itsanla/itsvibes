# itsvibes

Aplikasi Android untuk mengobrol dengan Claude Code yang berjalan di VPS Bima, dari mana saja.

- Lepas dari akun claude.ai di HP: HP hanya login ke itsvibes, Claude Code di Bima memakai login langganannya sendiri.
- Semua sesi di `~/.claude/projects` terlihat dan bisa dilanjutkan, termasuk sesi lama dari `/resume` dan sesi dari laptop yang tersinkron lewat `bsync claude`.
- Jawaban mengalir langsung, izin tool, pertanyaan pilihan (AskUserQuestion) dan persetujuan rencana dijawab dari HP.
- Beberapa sesi bisa berjalan bersamaan; notifikasi saat selesai, butuh izin, atau error walau aplikasi ditutup.
- Versi web di https://itsvibes.anla.my.id/ (dari browser mana pun, tanpa SSH ke Bima): daftar sesi di kiri, percakapan di kanan, Enter mengirim, Ctrl+V menempel gambar, notifikasi browser.

## Susunan

```
shared/protocol.ts   tipe pesan yang dipakai server dan aplikasi
server/              itsvibes-server (Node 24, TypeScript tanpa build, Agent SDK resmi)
app/                 aplikasi Expo (SDK 58, React Native 0.88, Expo Router)
app/modules/itsvibes-notifier   service Android native untuk notifikasi di latar belakang
deploy/              unit systemd, skrip build APK (build-apk.sh) dan web (build-web.sh)
```

```
HP (itsvibes) ⇄ https/wss itsvibes.anla.my.id (Traefik) ⇄ itsvibes-server 10.0.1.1:6700 ⇄ proses claude (binary resmi)
```

Setiap sesi yang aktif adalah satu proses Claude Code yang dijalankan lewat `@anthropic-ai/claude-agent-sdk` dengan
`pathToClaudeCodeExecutable` ke binary yang terpasang di Bima, jadi CLAUDE.md, memory, MCP, skill, dan settings sama
dengan `claude` di terminal. Sesi yang menganggur 30 menit dihentikan; isinya tetap di JSONL dan dilanjutkan otomatis
saat ada pesan baru.

## Server

```bash
cd server && npm install
npm start                 # jalan di 10.0.1.1:6700 (ITSVIBES_HOST, ITSVIBES_PORT)
itsvibes-pair             # alias di ~/.bashrc Bima: kode pairing 6 digit, berlaku 10 menit
```

Di Bima berjalan sebagai service user `itsvibes.service` (`deploy/itsvibes.service`):

```bash
systemctl --user restart itsvibes
journalctl --user -u itsvibes -f
```

- Perangkat terpasang tercatat di `~/.config/itsvibes/devices.json` (hanya hash token). Hapus entri untuk mencabut.
- Domain dibuat dengan `dns create itsvibes.anla.my.id --port 6700` (record Cloudflare + rute Traefik + Let's Encrypt).
- Uji ujung ke ujung dengan Claude sungguhan (memakai kuota): `test/e2e.ts`, lihat komentar di berkasnya.

## Aplikasi

```bash
cd app && npm install
npm run typecheck && npm run lint
../deploy/build-apk.sh    # APK rilis arm64-v8a ke ~/.local/state/itsvibes/apk/
```

APK bisa diunduh di HP dari https://itsvibes.anla.my.id/download. Keystore rilis ada di
`~/.config/itsvibes/release.keystore` (sandi di `signing.env`); update aplikasi harus ditandatangani keystore yang sama,
jadi jangan sampai hilang.

## Versi web (desktop)

Web khusus desktop: pola kerjanya desktop memakai web, HP memakai aplikasi Android. Kode yang sama (Expo,
`expo export -p web`) tetapi antarmukanya terpisah lewat berkas `*.web.tsx` (rute) dan `app/src/web/` (komponen DOM
murni + CSS), sehingga aplikasi Android tidak tersentuh. Logika bersama ada di `src/lib/` (client, protokol, grup tool).

```bash
deploy/build-web.sh      # hasil ke ~/.local/state/itsvibes/web, langsung tampil tanpa restart service
```

- Tata letak: sidebar sesi (dikelompokkan Perlu jawaban / Berjalan / Hari ini / Kemarin / ..., bisa diseret lebar dan
  disembunyikan), kolom percakapan 820 px, panel Penggunaan di kanan (konteks per kategori + kuota paket).
- Menu mengambang (bukan bottom sheet): model + Upaya dalam satu menu, mode izin, folder kerja sesi baru; Pengaturan dan
  pintasan berupa dialog. Blok tool diperluas di tempat dengan tampilan diff merah/hijau untuk Edit/Write.
- Pintasan: Enter kirim, Shift+Enter baris baru, Esc hentikan, Ctrl+K cari, Ctrl+Shift+O sesi baru, Ctrl+B sidebar,
  Ctrl+\ panel, `/` fokus kolom ketik, `?` bantuan. Ctrl+V atau seret-lepas untuk lampiran gambar.
- Judul tab menampilkan "(N)" untuk permintaan yang menunggu jawaban dan "●" saat Claude bekerja.
- Token di localStorage (`src/lib/storage.web.ts`); WebSocket mengirim token lewat query karena browser tidak bisa
  memasang header pada WebSocket (server menerima header maupun query).
- Memasangkan browser baru: itsvibes yang sudah terpasang, Pengaturan, "Buat kode pairing untuk perangkat lain"
  (`POST /api/pair-code`), atau `itsvibes-pair` di Bima. Kode berlaku 10 menit.
- Notifikasi browser (`src/lib/notifier.web.ts`): WebSocket `role=notifier` + Notification API, aktif selama tab terbuka.
- Uji tanpa perangkat: Playwright + Chromium (`npm i playwright` di folder sementara) terhadap server uji
  (`ITSVIBES_PORT=6799 ITSVIBES_WEB=<folder build>`), screenshot dibaca langsung.

## Catatan

- Sesi baru yang dibuat dari HP tercatat `entrypoint: sdk-ts`, sehingga menu `/resume` di terminal tidak
  menampilkannya. Sesi tetap bisa dibuka dengan `claude --resume <id>` (menu sesi di aplikasi bisa menyalin perintahnya).
  Sesi lama yang dilanjutkan dari HP tetap tampil di `/resume`.
- Jangan membuka sesi yang sama di terminal dan HP bersamaan. Server menolak melanjutkan sesi yang sedang terbuka di
  terminal Bima; untuk laptop, `bsync claude` akan memisahkannya jadi dua sesi.
- Pemakaian lewat Agent SDK bisa dihitung berbeda dengan pemakaian interaktif oleh Anthropic. Pantau `/usage`.

## Sumber AI

Dipilih dari panel Penggunaan atau Pengaturan, berlaku untuk seluruh server:

- Personal: login Claude Code bawaan (`~/.claude`).
- Produk: login kedua. Sekali saja di server: `CLAUDE_CONFIG_DIR=~/.config/itsvibes/accounts/produk claude auth login`.
- Merapi: gateway berformat Anthropic. Key di `~/.config/itsvibes/merapi.env` (`ITSVIBES_MERAPI_KEY=...`, mode 600), tidak pernah di repo.

## Browser bersama

Server menyalakan satu Chromium berjendela di layar virtual Xvfb (`:77`) dengan profil tetap
`~/.config/itsvibes/browser-profile` (cookie dan login bertahan, termasuk cookie sesi karena sesi tab dipulihkan).
Dua pihak memakainya:

- Claude, lewat Playwright MCP (`@playwright/mcp`, `--cdp-endpoint`) yang otomatis terpasang di setiap sesi sebagai server `browser`.
- Aan, lewat halaman `/browser` (WebSocket `/ws/browser`): frame JPEG dari screencast CDP, klik, ketik, scroll, tab, dan kolom alamat.
  Kartu "Browser" di halaman sesi menampilkan pratinjau selagi Claude memakainya dan membuka `/browser` di tab baru.

Port CDP (`9333`) hanya di localhost. Chromium berjalan dengan `--no-sandbox` karena sandbox ditolak sistem (namespace pengguna);
`ITSVIBES_BROWSER=0` mematikan seluruh fitur. Layar browser hanya ada di versi web, aplikasi Android belum.
