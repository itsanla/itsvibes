// Uji gateway kredensial tanpa kuota dan tanpa akun asli: HOME sementara dan "claude" palsu yang meniru Claude Code
// (hanya memperbarui token yang hampir habis, lalu merotasi refresh token).
// Pakai: node test/gateway.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-gw-'))
process.env.HOME = tmp
process.env.ITSVIBES_CONFIG = path.join(tmp, 'config')
process.env.ITSVIBES_STATE = path.join(tmp, 'state')
process.env.ITSVIBES_CLAUDE = path.join(tmp, 'fake-claude')
fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true })
fs.writeFileSync(
  process.env.ITSVIBES_CLAUDE,
  `#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const dir = process.env.CLAUDE_CONFIG_DIR || path.join(process.env.HOME, '.claude')
const f = path.join(dir, '.credentials.json')
fs.appendFileSync(path.join(process.env.HOME, 'calls.log'), 'x\\n')
if (fs.existsSync(path.join(process.env.HOME, 'mode-fail'))) process.exit(1)
const c = JSON.parse(fs.readFileSync(f, 'utf8'))
if (c.claudeAiOauth.expiresAt - Date.now() > 5 * 60000) process.exit(0)
c.claudeAiOauth.accessToken = 'NEWACCESS' + Date.now()
c.claudeAiOauth.refreshToken = 'NEWREFRESH' + Date.now()
c.claudeAiOauth.expiresAt = Date.now() + 480 * 60000
fs.writeFileSync(f, JSON.stringify(c))
`,
  { mode: 0o755 },
)

const { GatewayError, gatewayCredentials, importCredentials, oauthFor } = await import('../src/gateway.ts')

const credFile = path.join(tmp, '.claude/.credentials.json')
const calls = () => (fs.existsSync(path.join(tmp, 'calls.log')) ? fs.readFileSync(path.join(tmp, 'calls.log'), 'utf8').split('\n').filter(Boolean).length : 0)
const creds = (minutes: number, extra = {}) => ({
  claudeAiOauth: {
    accessToken: 'ACCESS0', refreshToken: 'REFRESH0', expiresAt: Date.now() + minutes * 60_000,
    refreshTokenExpiresAt: Date.now() + 20 * 864e5, scopes: ['user:inference', 'user:profile'], subscriptionType: 'pro', rateLimitTier: 'tier', ...extra,
  },
})
const put = (c: object) => fs.writeFileSync(credFile, JSON.stringify(c))
const ok = (name: string) => console.log(`OK   ${name}`)

// A. token masih segar: dikirim apa adanya, claude tidak dijalankan
put(creds(300))
assert.equal((await oauthFor('personal')).accessToken, 'ACCESS0')
assert.equal(calls(), 0)
ok('token segar tidak memicu pembaruan')

// B. hampir habis: tiga permintaan bersamaan hanya merotasi sekali
put(creds(10))
const original = fs.readFileSync(credFile, 'utf8')
const [a, b, c] = await Promise.all([oauthFor('personal'), oauthFor('personal'), oauthFor('personal')])
assert.ok(a.accessToken.startsWith('NEWACCESS'))
assert.equal(a.accessToken, b.accessToken)
assert.equal(b.accessToken, c.accessToken)
assert.equal(calls(), 1)
assert.ok(a.expiresAt - Date.now() > 400 * 60_000)
assert.equal(fs.readFileSync(credFile + '.gw-backup', 'utf8'), original)
assert.equal(fs.statSync(credFile + '.gw-backup').mode & 0o777, 0o600)
ok('pembaruan satu kali untuk permintaan bersamaan, cadangan 0600 tersimpan')

// C. respons ke klien tidak pernah memuat refresh token
const out = await gatewayCredentials('personal')
const text = JSON.stringify(out)
assert.ok(!text.includes('REFRESH0') && !text.includes('NEWREFRESH') && !/refresh/i.test(Object.keys(out).join()))
assert.equal(out.kind, 'oauth')
ok('refresh token tidak ikut dikirim')

// D. pembaruan gagal: berkas dikembalikan persis seperti semula
put(creds(10))
const before = fs.readFileSync(credFile, 'utf8')
fs.writeFileSync(path.join(tmp, 'mode-fail'), '')
await assert.rejects(oauthFor('personal'), (e: unknown) => e instanceof GatewayError && e.status === 502)
assert.equal(fs.readFileSync(credFile, 'utf8'), before)
fs.rmSync(path.join(tmp, 'mode-fail'))
ok('pembaruan gagal memulihkan berkas semula (kedaluwarsa asli kembali)')

// E. kesalahan penggunaan
await assert.rejects(gatewayCredentials('produk'), (e: unknown) => e instanceof GatewayError && e.status === 409)
await assert.rejects(gatewayCredentials('nope'), (e: unknown) => e instanceof GatewayError && e.status === 400)
await assert.rejects(gatewayCredentials('merapi'), (e: unknown) => e instanceof GatewayError && e.status === 409)
ok('belum login = 409, sumber asing = 400, key Merapi kosong = 409')

// F. impor kredensial
const src = path.join(tmp, 'incoming.json')
fs.writeFileSync(src, '{"bukan":"kredensial"}')
assert.throws(() => importCredentials('produk', src, false), /tidak lengkap|lengkap/)
fs.writeFileSync(src, JSON.stringify(creds(300, { accessToken: 'IMPORTACCESS', refreshToken: 'IMPORTREFRESH' })))
const msg = importCredentials('produk', src, false)
assert.ok(!msg.includes('IMPORTACCESS') && !msg.includes('IMPORTREFRESH'))
const dest = path.join(tmp, "config/accounts/produk/.credentials.json")
assert.equal(fs.statSync(dest).mode & 0o777, 0o600)
assert.equal((await oauthFor('produk')).accessToken, 'IMPORTACCESS')
assert.throws(() => importCredentials('produk', src, false), /--force/)
importCredentials('produk', src, true)
fs.writeFileSync(src, JSON.stringify(creds(300, { refreshTokenExpiresAt: Date.now() - 1000 })))
assert.throws(() => importCredentials('produk', src, true), /kedaluwarsa/)
ok('impor: validasi bentuk, mode 0600, tidak menimpa tanpa --force, menolak refresh token kedaluwarsa, token tidak dicetak')

fs.rmSync(tmp, { recursive: true, force: true })
console.log('Semua uji gateway lolos')
