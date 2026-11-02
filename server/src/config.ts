import os from 'node:os'
import path from 'node:path'

const home = os.homedir()

export const VERSION = '1.7.0'
// Traefik (coolify-proxy) menjangkau host lewat gateway jaringan coolify, jadi port ini tidak perlu terbuka ke internet
export const HOST = process.env.ITSVIBES_HOST ?? '10.0.1.1'
export const PORT = Number(process.env.ITSVIBES_PORT ?? 6700)
export const CLAUDE_BIN = process.env.ITSVIBES_CLAUDE ?? path.join(home, '.local/bin/claude')
export const PROJECTS_DIR = path.join(home, '.claude/projects')
export const LIVE_DIR = path.join(home, '.claude/sessions')
export const CONFIG_DIR = process.env.ITSVIBES_CONFIG ?? path.join(home, '.config/itsvibes')
export const STATE_DIR = process.env.ITSVIBES_STATE ?? path.join(home, '.local/state/itsvibes')
export const APK_DIR = path.join(STATE_DIR, 'apk')
// hasil `expo export -p web` (deploy/build-web.sh); kosong = versi web belum dipasang
export const WEB_DIR = process.env.ITSVIBES_WEB ?? path.join(STATE_DIR, 'web')
export const DEFAULT_CWD = process.env.ITSVIBES_CWD ?? home
// sesi yang menganggur selama ini diringkas lalu dihentikan; 40 menit masih di dalam cache 1 jam, jadi compact-nya murah.
// isinya tetap di JSONL dan dilanjutkan saat ada pesan baru
export const IDLE_MS = Number(process.env.ITSVIBES_IDLE_MIN ?? 40) * 60_000
// compact saat sesi berakhir hanya kalau konteks minimal sebesar ini; sesi hampir kosong sudah sekitar 20-50k (system prompt dan tool)
export const MIN_COMPACT_TOKENS = Number(process.env.ITSVIBES_MIN_COMPACT ?? 60_000)

// browser bersama untuk Claude dan Aan (browser.ts): Chromium berjendela di layar virtual Xvfb, profil tetap
export const BROWSER_DISPLAY = Number(process.env.ITSVIBES_BROWSER_DISPLAY ?? 77)
export const BROWSER_PORT = Number(process.env.ITSVIBES_BROWSER_PORT ?? 9333)
export const BROWSER_PROFILE = process.env.ITSVIBES_BROWSER_PROFILE ?? path.join(CONFIG_DIR, 'browser-profile')
export const BROWSER_SIZE = { w: 1920, h: 1080 }
export const BROWSER_ENABLED = process.env.ITSVIBES_BROWSER !== '0'
