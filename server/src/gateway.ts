import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CLAUDE_BIN } from './config.ts'
import { CLAUDE_DIR, PRODUK_DIR, prepareProduk, sourceEnv, sourceList, sourceReady } from './sources.ts'
import type { SourceId } from '../../shared/protocol.ts'

// Gateway kredensial: Bima satu-satunya pemilik refresh token, mesin lain (laptop lewat `bclaude`) hanya menerima access token.
// Refresh token Claude Code berotasi tiap diperbarui, jadi dua mesin yang memegangnya saling membatalkan. Di sini hanya
// Claude Code milik Bima yang memperbaruinya; yang keluar dari server cuma access token (berlaku sekitar 8 jam).

export type OauthSource = Exclude<SourceId, 'merapi'>
export const OAUTH_SOURCES: OauthSource[] = ['personal', 'produk']

// token yang dikirim ke klien minimal masih berlaku selama ini; lebih pendek dari itu, diperbarui dulu
export const MIN_SERVE_MS = Number(process.env.ITSVIBES_GW_MIN_MIN ?? 60) * 60_000
const KEEPALIVE_MS = 20 * 60_000
const REFRESH_TIMEOUT_MS = 60_000

export class GatewayError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}

interface Oauth {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  refreshTokenExpiresAt?: number
  scopes?: string[]
  subscriptionType?: string
  rateLimitTier?: string
}

const dirOf = (id: OauthSource) => (id === 'produk' ? PRODUK_DIR : CLAUDE_DIR)
const fileOf = (id: OauthSource) => path.join(dirOf(id), '.credentials.json')
const short = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8)

function parseOauth(text: string): Oauth | null {
  try {
    const o = JSON.parse(text)?.claudeAiOauth
    if (typeof o?.accessToken !== 'string' || typeof o?.expiresAt !== 'number') return null
    return o as Oauth
  } catch {
    return null
  }
}

function readOauth(id: OauthSource): Oauth | null {
  try {
    return parseOauth(fs.readFileSync(fileOf(id), 'utf8'))
  } catch {
    return null
  }
}

function writeAtomic(file: string, text: string) {
  const tmp = `${file}.gw.tmp`
  fs.writeFileSync(tmp, text, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

function cleanEnv(id: OauthSource): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('ANTHROPIC_') && !k.startsWith('CLAUDE')) env[k] = v
  }
  return { ...env, ...sourceEnv(id) }
}

// samarkan string panjang mirip token sebelum masuk log
const mask = (t: string) => t.replace(/[A-Za-z0-9_\-.]{32,}/g, '<disamarkan>').replace(/\s+/g, ' ').trim().slice(0, 600)

// Pemicu pembaruan: satu panggilan haiku kecil lewat `claude -p`. Panggilan itu butuh token yang valid, jadi Claude Code
// menunggu pembaruan selesai dan menulis kredensial barunya sebelum keluar. `claude auth status` TIDAK dipakai: ia keluar
// dalam 0,3 detik sebelum pembaruan selesai (hanya 3 dari 6 percobaan berhasil), dan proses yang terputus di tengah
// pembaruan berisiko menghanguskan refresh token yang sudah dirotasi server. Tanpa pengaturan pengguna (hook, plugin, MCP).
function runRefresh(id: OauthSource): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-p', 'ok', '--model', 'haiku', '--no-session-persistence', '--setting-sources', 'project', '--strict-mcp-config', '--disable-slash-commands']
    if (process.env.ITSVIBES_GW_DEBUG) args.unshift('--debug')
    const child = spawn(CLAUDE_BIN, args, { env: cleanEnv(id), cwd: os.tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', d => (out += d))
    child.stderr.on('data', d => (out += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), REFRESH_TIMEOUT_MS)
    child.on('error', reject)
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(`claude -p keluar ${code}: ${mask(out)}`))
    })
  })
}

async function doRefresh(id: OauthSource): Promise<Oauth> {
  const file = fileOf(id)
  let original: string
  try {
    original = fs.readFileSync(file, 'utf8')
  } catch {
    throw new GatewayError(`Sumber ${id} belum login di Bima`, 409)
  }
  const old = parseOauth(original)
  if (!old?.refreshToken) throw new GatewayError(`Sumber ${id} tidak punya refresh token`, 409)
  const backup = `${file}.gw-backup`
  fs.writeFileSync(backup, original, { mode: 0o600 })

  // Claude Code hanya memperbarui token yang hampir habis (kurang dari sekitar 5 menit), jadi kedaluwarsa dimajukan
  // sementara. Token aslinya tidak berubah; kalau pembaruan gagal, isi semula dikembalikan di bawah.
  const parsed = JSON.parse(original)
  const forced = JSON.stringify({ ...parsed, claudeAiOauth: { ...old, expiresAt: Date.now() + 30_000 } })
  writeAtomic(file, forced)

  let failure = ''
  let output = ''
  // satu percobaan ulang bila gagal dan refresh token di berkas belum berubah (tidak ada yang terpakai di server)
  for (let attempt = 0; attempt < 2; attempt++) {
    failure = ''
    try {
      output = await runRefresh(id)
    } catch (e) {
      failure = (e as Error).message
    }
    const now = readOauth(id)
    if (now && now.accessToken !== old.accessToken && now.expiresAt - Date.now() > MIN_SERVE_MS) {
      console.log(`[gateway] ${id}: token diperbarui, access#${short(now.accessToken)} berlaku ${Math.round((now.expiresAt - Date.now()) / 60_000)} mnt`)
      return now
    }
    if (now?.refreshToken !== old.refreshToken) break
    await new Promise(r => setTimeout(r, 2000))
  }
  // gagal: pulihkan hanya kalau berkasnya masih persis yang kita tulis atau rusak, supaya hasil proses lain tidak tertimpa
  let current = ''
  try {
    current = fs.readFileSync(file, 'utf8')
  } catch {}
  if (current === forced || !parseOauth(current)) writeAtomic(file, original)
  console.error(`[gateway] ${id}: pembaruan tidak terjadi. ${failure || `auth status: ${mask(output)}`}`)
  throw new GatewayError(`Pembaruan token ${id} gagal${failure ? `: ${failure}` : ''}`, 502)
}

const inflight = new Map<OauthSource, Promise<Oauth>>()

// satu pembaruan pada satu waktu per sumber: permintaan bersamaan menunggu hasil yang sama, bukan merotasi dua kali
export async function oauthFor(id: OauthSource): Promise<Oauth> {
  const o = readOauth(id)
  if (!o) throw new GatewayError(`Sumber ${id} belum login di Bima`, 409)
  if (o.expiresAt - Date.now() >= MIN_SERVE_MS) return o
  let p = inflight.get(id)
  if (!p) {
    p = doRefresh(id).finally(() => inflight.delete(id))
    inflight.set(id, p)
  }
  return p
}

const isOauth = (s: string | null): s is OauthSource => s === 'personal' || s === 'produk'

// Isi yang dikirim ke klien. Refresh token sengaja tidak pernah disertakan.
export async function gatewayCredentials(source: string | null) {
  if (isOauth(source)) {
    const o = await oauthFor(source)
    return {
      source,
      kind: 'oauth' as const,
      accessToken: o.accessToken,
      expiresAt: o.expiresAt,
      scopes: o.scopes ?? [],
      subscriptionType: o.subscriptionType ?? null,
      rateLimitTier: o.rateLimitTier ?? null,
    }
  }
  if (source === 'merapi') {
    if (!sourceReady('merapi')) throw new GatewayError('Key Merapi belum ada di Bima', 409)
    return { source, kind: 'env' as const, env: sourceEnv('merapi') }
  }
  throw new GatewayError('source harus personal, produk, atau merapi', 400)
}

export function gatewaySources() {
  return sourceList().map(s => {
    if (s.id === 'merapi') return { ...s, kind: 'env' as const }
    const o = readOauth(s.id)
    return { ...s, kind: 'oauth' as const, plan: o?.subscriptionType ?? null, expiresInMin: o ? Math.round((o.expiresAt - Date.now()) / 60_000) : null }
  })
}

// Menjaga token tetap segar walau tidak ada yang meminta, dan menjaga refresh token tidak kedaluwarsa (berlaku sekitar 20 hari)
export function startKeepalive() {
  const tick = async () => {
    for (const id of OAUTH_SOURCES) {
      if (!readOauth(id)) continue
      try {
        await oauthFor(id)
      } catch (e) {
        console.error(`[gateway] keepalive ${id}: ${(e as Error).message}`)
      }
    }
  }
  setTimeout(tick, 15_000).unref()
  setInterval(tick, KEEPALIVE_MS).unref()
}

// Memasang kredensial dari berkas ke Bima (mis. salinan login laptop). Dari saat ini Bima pemilik refresh token-nya:
// login asal tidak boleh dipakai memperbarui lagi, karena rotasi akan membatalkan salinan di sini.
export function importCredentials(id: string, from: string, force: boolean): string {
  if (!isOauth(id)) throw new Error('sumber harus personal atau produk')
  const text = fs.readFileSync(from, 'utf8')
  const o = parseOauth(text)
  if (!o?.refreshToken) throw new Error('berkas bukan .credentials.json Claude Code yang lengkap (accessToken, refreshToken, expiresAt)')
  if (o.refreshTokenExpiresAt && o.refreshTokenExpiresAt < Date.now()) throw new Error('refresh token di berkas itu sudah kedaluwarsa')
  if (id === 'produk') prepareProduk()
  if (fs.existsSync(fileOf(id)) && !force) throw new Error(`${fileOf(id)} sudah ada; tambahkan --force untuk menimpa`)
  fs.mkdirSync(dirOf(id), { recursive: true, mode: 0o700 })
  writeAtomic(fileOf(id), text)
  return `${id}: terpasang, paket ${o.subscriptionType ?? '?'}, access#${short(o.accessToken)} refresh#${short(o.refreshToken)}, access token berlaku ${Math.round((o.expiresAt - Date.now()) / 60_000)} mnt`
}
