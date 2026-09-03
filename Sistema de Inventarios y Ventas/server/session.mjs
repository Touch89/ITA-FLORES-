// Stateless session cookie: HMAC-signed { id, role, exp } payload, no session table/store needed.
// Verified by the /api/state and /api/upload middleware (see vite.config.ts) before they touch
// the database or the filesystem — closes the "any unauthenticated request can read/replace the
// whole DB" hole described in the security audit.
import crypto from 'crypto'

const COOKIE_NAME = 'ita_session'
const SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8h — a work shift; keeps a stolen/forgotten cookie short-lived

// Read lazily (not at module load) so `vite build` — which imports vite.config.ts, and therefore
// this module, but never actually starts the dev-server middleware — doesn't need SESSION_SECRET
// set at all. Same reasoning as db.mjs's getPool() only touching DB_* env vars when first called.
function getSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET env var is required (see .env.example) — refusing to start without it')
  return secret
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url')
}

// Issues a signed token for a just-authenticated user. Only `id`/`role` are embedded — never the
// password hash — so the cookie itself can't leak anything sensitive if it were ever decoded.
export function createSessionToken({ id, role }) {
  const payloadB64 = Buffer.from(JSON.stringify({ id, role, exp: Date.now() + SESSION_TTL_MS })).toString('base64url')
  return `${payloadB64}.${sign(payloadB64)}`
}

export function sessionCookieHeader(token) {
  const attrs = [`${COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`]
  // Vite's dev server is plain HTTP on localhost/LAN — Secure would silently drop the cookie there.
  if (process.env.NODE_ENV === 'production') attrs.push('Secure')
  return attrs.join('; ')
}

export function clearSessionCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

// Returns { id, role } for a valid, unexpired session cookie on `req`, or null (missing, tampered,
// malformed, or expired — all treated the same, no partial trust).
export function getSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (!token) return null
  const [payloadB64, sig] = token.split('.')
  if (!payloadB64 || !sig) return null

  const expected = sign(payloadB64)
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null

  let payload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))
  } catch {
    return null
  }
  if (!payload.exp || Date.now() > payload.exp) return null
  return { id: payload.id, role: payload.role }
}
