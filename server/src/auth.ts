import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { CONFIG_DIR } from './config.ts'

// Satu pengguna. Perangkat dipasangkan dengan kode 6 digit yang dibuat di Bima (`npm run pair`),
// lalu menerima token panjang yang disimpan di aplikasi. Token bisa dicabut dari devices.json.
const DEVICES = path.join(CONFIG_DIR, 'devices.json')
const PAIR = path.join(CONFIG_DIR, 'pair.json')

interface Device { name: string; hash: string; created: number; lastSeen?: number }

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

export function createPairCode(minutes = 10): string {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  writeJson(PAIR, { hash: sha(code), expires: Date.now() + minutes * 60_000, attempts: 0 })
  return code
}

export function redeemPairCode(code: string, name: string): string | null {
  const pair = readJson<{ hash: string; expires: number; attempts: number } | null>(PAIR, null)
  if (!pair || Date.now() > pair.expires || pair.attempts >= 5) return null
  if (!crypto.timingSafeEqual(Buffer.from(sha(code)), Buffer.from(pair.hash))) {
    writeJson(PAIR, { ...pair, attempts: pair.attempts + 1 })
    return null
  }
  fs.rmSync(PAIR, { force: true })
  const token = crypto.randomBytes(32).toString('base64url')
  const devices = readJson<Device[]>(DEVICES, [])
  devices.push({ name: name.slice(0, 60) || 'android', hash: sha(token), created: Date.now() })
  writeJson(DEVICES, devices)
  return token
}

let cache: { mtime: number; hashes: Set<string> } | null = null

export function checkToken(token: string | null | undefined): boolean {
  if (!token) return false
  let mtime = 0
  try {
    mtime = fs.statSync(DEVICES).mtimeMs
  } catch {
    return false
  }
  if (!cache || cache.mtime !== mtime) {
    cache = { mtime, hashes: new Set(readJson<Device[]>(DEVICES, []).map(d => d.hash)) }
  }
  return cache.hashes.has(sha(token))
}

export function bearer(header: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '')
  return m ? m[1] : null
}
