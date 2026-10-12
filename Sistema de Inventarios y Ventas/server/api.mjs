// The app's whole HTTP API (/api/state, /api/login, /api/logout, /api/upload/<category>) as one
// plain Node `(req, res, next)` handler, shared by both servers so the logic lives in one place:
// - dev: mounted into Vite's dev server as middleware (vite.config.ts)
// - production: mounted by server/prod.mjs, which also serves the built `dist/` and the uploads
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import { getFullState, replaceFullState, authenticateUser, ForbiddenError, ConflictError } from './db.mjs'
import { ValidationError } from './validateState.mjs'
import { createSessionToken, sessionCookieHeader, clearSessionCookieHeader, getSession } from './session.mjs'

export const UPLOAD_CATEGORIES = ['articulos', 'logos', 'usuarios']

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
}

// Shared guard for every endpoint below that reads/writes real data. Returns the session (and lets
// the caller continue) if `req` carries a valid, unexpired session cookie; otherwise writes a 401
// and returns null so the caller can bail out immediately.
function requireSession(req, res) {
  const session = getSession(req)
  if (session) return session
  sendJson(res, 401, { error: 'No autenticado' })
  return null
}

// Identifies an image by its actual bytes (magic numbers), never by the client-supplied
// `mimetype`/filename — those are just form fields the caller fully controls. Deliberately doesn't
// include SVG: it's XML, not a fixed binary signature, and can carry a <script> that executes when
// the uploaded file is opened directly — sniffing "is this valid SVG" doesn't make that safe, so
// raster-only is the fix, not a smarter SVG check. The extension on disk is chosen from this result,
// never from the client's original filename.
function sniffImageType(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return { ext: '.png', mime: 'image/png' }
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' }
  }
  if (buf.length >= 6 && buf.toString('ascii', 0, 3) === 'GIF' && ['87a', '89a'].includes(buf.toString('ascii', 3, 6))) {
    return { ext: '.gif', mime: 'image/gif' }
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: '.webp', mime: 'image/webp' }
  }
  return null
}

// Deletes a previously-uploaded file (passed as its /uploads/<category>/<file> URL) so replacing
// an image doesn't leave the old one behind. Validates the path stays inside uploadsRoot before
// unlinking, since the URL nominally comes from client input.
function deletePreviousUpload(uploadsRoot, previousUrl) {
  if (!previousUrl || typeof previousUrl !== 'string') return
  const match = previousUrl.match(/^\/uploads\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/)
  if (!match) return
  const [, category, filename] = match
  if (!UPLOAD_CATEGORIES.includes(category)) return
  const resolved = path.resolve(uploadsRoot, category, filename)
  if (!resolved.startsWith(path.resolve(uploadsRoot) + path.sep)) return
  fs.unlink(resolved, (err) => {
    if (err && err.code !== 'ENOENT') console.error('[api upload] failed to delete previous file', resolved, err.message)
  })
}

// POST /api/upload/{articulos|logos|usuarios} (multipart, field "file") -> saves into
// <uploadsRoot>/<category>/ and returns { url: "/uploads/<category>/<file>" }.
function handleUpload(req, res, uploadsRoot, category) {
  if (!requireSession(req, res)) return
  // Buffered in memory (not streamed straight to disk) so the bytes can be sniffed before anything
  // is written under uploadsRoot — the client's mimetype/filename are never trusted for that
  // decision (see sniffImageType above). Called directly as plain Node middleware rather than
  // inside an Express app, which multer supports.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  }).single('file')

  upload(req, res, (err) => {
    if (err) return sendJson(res, 400, { error: err.message || 'Error al subir el archivo' })
    if (!req.file) return sendJson(res, 400, { error: 'No se recibió ninguna imagen válida' })
    const sniffed = sniffImageType(req.file.buffer)
    if (!sniffed) {
      return sendJson(res, 400, { error: 'El archivo no es una imagen válida. Formatos permitidos: PNG, JPG, GIF, WEBP.' })
    }
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${sniffed.ext}`
    fs.writeFile(path.join(uploadsRoot, category, filename), req.file.buffer, (writeErr) => {
      if (writeErr) {
        console.error('[api upload] failed to write file', writeErr.message)
        return sendJson(res, 500, { error: 'Error al guardar el archivo' })
      }
      deletePreviousUpload(uploadsRoot, req.body?.previousUrl)
      sendJson(res, 200, { url: `/uploads/${category}/${filename}` })
    })
  })
}

// GET/PUT /api/state reads/writes the MariaDB tables (server/db.mjs) that back the whole app.
async function handleState(req, res) {
  try {
    const session = requireSession(req, res)
    if (!session) return
    if (req.method === 'GET') return sendJson(res, 200, await getFullState())
    if (req.method === 'PUT') {
      const stateVersion = await replaceFullState(await readJsonBody(req), session)
      return sendJson(res, 200, { ok: true, stateVersion })
    }
    res.statusCode = 405
    res.end('Method not allowed')
  } catch (err) {
    console.error('[api state]', err)
    const status = err instanceof ForbiddenError ? 403 : err instanceof ConflictError ? 409 : err instanceof ValidationError ? 400 : 500
    sendJson(res, status, { error: err instanceof Error ? err.message : 'Error interno' })
  }
}

// POST /api/login { username, password } -> { userId } | 401. The only place a plaintext
// password is ever compared — against the bcrypt hash in MariaDB, server-side only.
async function handleLogin(req, res) {
  try {
    const { username, password } = await readJsonBody(req)
    const session = await authenticateUser(username, password)
    if (!session) return sendJson(res, 401, { error: 'Credenciales incorrectas o cuenta inactiva.' })
    res.setHeader('Set-Cookie', sessionCookieHeader(createSessionToken(session)))
    sendJson(res, 200, { userId: session.id })
  } catch (err) {
    console.error('[api login]', err)
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'Error interno' })
  }
}

// POST /api/logout -> clears the session cookie. No server-side session state to invalidate
// (the cookie is self-contained/stateless), so this just tells the browser to drop it.
function handleLogout(req, res) {
  res.setHeader('Set-Cookie', clearSessionCookieHeader())
  sendJson(res, 200, { ok: true })
}

// Returns the API handler. `uploadsRoot` is where uploaded images are written (dev: public/uploads,
// which Vite serves; production: a persistent folder outside dist/, served by server/prod.mjs).
// Requests outside /api/ are passed to `next` untouched.
export function createApiHandler({ uploadsRoot }) {
  for (const category of UPLOAD_CATEGORIES) {
    fs.mkdirSync(path.join(uploadsRoot, category), { recursive: true })
  }

  return function apiHandler(req, res, next) {
    const pathname = (req.url || '').split('?')[0]
    if (pathname === '/api/state') return handleState(req, res)

    if (pathname === '/api/login' || pathname === '/api/logout') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end('Method not allowed')
        return
      }
      return pathname === '/api/login' ? handleLogin(req, res) : handleLogout(req, res)
    }

    const uploadMatch = pathname.match(/^\/api\/upload\/([^/]+)$/)
    if (uploadMatch && req.method === 'POST' && UPLOAD_CATEGORIES.includes(uploadMatch[1])) {
      return handleUpload(req, res, uploadsRoot, uploadMatch[1])
    }

    if (pathname.startsWith('/api/')) {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    next()
  }
}
