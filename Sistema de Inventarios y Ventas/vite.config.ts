import { defineConfig } from 'vite'
import type { ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import multer from 'multer'
import { getFullState, replaceFullState, authenticateUser, ForbiddenError, ConflictError } from './server/db.mjs'
import { ValidationError } from './server/validateState.mjs'
import { createSessionToken, sessionCookieHeader, clearSessionCookieHeader, getSession } from './server/session.mjs'

// Shared guard for every endpoint below that reads/writes real data. Returns the session (and lets
// the caller continue) if `req` carries a valid, unexpired session cookie; otherwise writes a 401
// and returns null so the caller can bail out immediately.
function requireSession(req: IncomingMessage, res: ServerResponse) {
  const session = getSession(req)
  if (session) return session
  res.statusCode = 401
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: 'No autenticado' }))
  return null
}


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

// Dev-only file upload endpoint: POST /api/upload/{articulos|logos|usuarios} (multipart, field "file")
// saves into public/uploads/<category>/ and returns { url }. There is no production build
// equivalent — `vite build` only emits static files, so this only exists while `vite`/`vite dev`
// is running the Node server (i.e. under Docker's frontend dev container, same as HMR).
const UPLOAD_CATEGORIES = ['articulos', 'logos', 'usuarios']

// Identifies an image by its actual bytes (magic numbers), never by the client-supplied
// `mimetype`/filename — those are just form fields the caller fully controls. Deliberately doesn't
// include SVG: it's XML, not a fixed binary signature, and can carry a <script> that executes when
// the uploaded file is opened directly — sniffing "is this valid SVG" doesn't make that safe, so
// raster-only is the fix, not a smarter SVG check. The extension on disk is chosen from this result,
// never from the client's original filename.
function sniffImageType(buf: Buffer): { ext: string; mime: string } | null {
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
function deletePreviousUpload(uploadsRoot: string, previousUrl: unknown) {
  if (!previousUrl || typeof previousUrl !== 'string') return
  const match = previousUrl.match(/^\/uploads\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/)
  if (!match) return
  const [, category, filename] = match
  if (!UPLOAD_CATEGORIES.includes(category)) return
  const resolved = path.resolve(uploadsRoot, category, filename)
  if (!resolved.startsWith(path.resolve(uploadsRoot) + path.sep)) return
  fs.unlink(resolved, (err) => {
    if (err && err.code !== 'ENOENT') console.error('[upload-server] failed to delete previous file', resolved, err.message)
  })
}

function uploadServer() {
  const uploadsRoot = path.resolve(__dirname, 'public/uploads')
  for (const category of UPLOAD_CATEGORIES) {
    fs.mkdirSync(path.join(uploadsRoot, category), { recursive: true })
  }

  return {
    name: 'upload-server',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/upload', (req: IncomingMessage, res: ServerResponse) => {
        const category = (req.url || '').split('?')[0].replace(/^\/+/, '')
        if (req.method !== 'POST' || !UPLOAD_CATEGORIES.includes(category)) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        if (!requireSession(req, res)) return
        // Buffered in memory (not streamed straight to disk) so the bytes can be sniffed before
        // anything is written under public/uploads — the client's mimetype/filename are never
        // trusted for that decision (see sniffImageType above).
        //
        // @types/multer models its RequestHandler against express.Request/Response (multer is
        // usually mounted in an Express app) — we're calling it directly as plain Connect
        // middleware instead, which is a supported way to use multer but not what its types
        // describe, hence the cast. `uploadReq` below is typed for exactly what multer actually
        // adds (`file`, `body`), not the full Express Request shape.
        const upload = multer({
          storage: multer.memoryStorage(),
          limits: { fileSize: 5 * 1024 * 1024 },
        }).single('file') as unknown as (
          req: IncomingMessage,
          res: ServerResponse,
          cb: (err: { message?: string } | null) => void
        ) => void

        upload(req, res, (err) => {
          const uploadReq = req as IncomingMessage & { file?: Express.Multer.File; body?: { previousUrl?: unknown } }
          res.setHeader('Content-Type', 'application/json')
          if (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: err.message || 'Error al subir el archivo' }))
            return
          }
          if (!uploadReq.file) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'No se recibió ninguna imagen válida' }))
            return
          }
          const sniffed = sniffImageType(uploadReq.file.buffer)
          if (!sniffed) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'El archivo no es una imagen válida. Formatos permitidos: PNG, JPG, GIF, WEBP.' }))
            return
          }
          const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${sniffed.ext}`
          fs.writeFile(path.join(uploadsRoot, category, filename), uploadReq.file.buffer, (writeErr) => {
            if (writeErr) {
              console.error('[upload-server] failed to write file', writeErr.message)
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Error al guardar el archivo' }))
              return
            }
            deletePreviousUpload(uploadsRoot, uploadReq.body?.previousUrl)
            res.end(JSON.stringify({ url: `/uploads/${category}/${filename}` }))
          })
        })
      })
    },
  }
}

// Dev-only data API: GET/PUT /api/state reads/writes the MariaDB tables (server/db.mjs) that
// back the whole app — this is the real persistence layer, localStorage is no longer used for
// business data. Same "only exists while the Vite dev server runs" caveat as uploadServer() above.
function dataApiServer() {
  return {
    name: 'data-api-server',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/state', async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const session = requireSession(req, res)
          if (!session) return
          if (req.method === 'GET') {
            const state = await getFullState()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(state))
            return
          }
          if (req.method === 'PUT') {
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
            const stateVersion = await replaceFullState(body, session)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, stateVersion }))
            return
          }
          res.statusCode = 405
          res.end('Method not allowed')
        } catch (err) {
          console.error('[data-api-server]', err)
          res.statusCode = err instanceof ForbiddenError ? 403 : err instanceof ConflictError ? 409 : err instanceof ValidationError ? 400 : 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }))
        }
      })

      // POST /api/login { username, password } -> { userId } | 401. The only place a plaintext
      // password is ever compared — against the bcrypt hash in MariaDB, server-side only.
      server.middlewares.use('/api/login', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        try {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const { username, password } = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
          const session = await authenticateUser(username, password)
          res.setHeader('Content-Type', 'application/json')
          if (!session) {
            res.statusCode = 401
            res.end(JSON.stringify({ error: 'Credenciales incorrectas o cuenta inactiva.' }))
            return
          }
          res.setHeader('Set-Cookie', sessionCookieHeader(createSessionToken(session)))
          res.end(JSON.stringify({ userId: session.id }))
        } catch (err) {
          console.error('[data-api-server login]', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }))
        }
      })

      // POST /api/logout -> clears the session cookie. No server-side session state to invalidate
      // (the cookie is self-contained/stateless), so this just tells the browser to drop it.
      server.middlewares.use('/api/logout', (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        res.setHeader('Set-Cookie', clearSessionCookieHeader())
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      })
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    uploadServer(),
    dataApiServer(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  server: {
    host: true, // listen on 0.0.0.0 so the dev server is reachable from outside the Docker container
    port: 5173,
    watch: {
      // Bind-mounted volumes (esp. on Windows/Docker Desktop) don't reliably forward native fs
      // change events into the container, which breaks HMR — polling works around that.
      usePolling: true,
    },
  },
})
