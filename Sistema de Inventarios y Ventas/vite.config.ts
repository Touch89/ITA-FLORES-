import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import multer from 'multer'
import { getFullState, replaceFullState, authenticateUser } from './server/db.mjs'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
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
    configureServer(server) {
      server.middlewares.use('/api/upload', (req, res) => {
        const category = (req.url || '').split('?')[0].replace(/^\/+/, '')
        if (req.method !== 'POST' || !UPLOAD_CATEGORIES.includes(category)) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        const upload = multer({
          storage: multer.diskStorage({
            destination: path.join(uploadsRoot, category),
            filename: (_req, file, cb) => {
              const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
              cb(null, `${unique}${path.extname(file.originalname)}`)
            },
          }),
          limits: { fileSize: 5 * 1024 * 1024 },
          fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
        }).single('file')

        upload(req, res, (err) => {
          res.setHeader('Content-Type', 'application/json')
          if (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: err.message || 'Error al subir el archivo' }))
            return
          }
          if (!req.file) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'No se recibió ninguna imagen válida' }))
            return
          }
          deletePreviousUpload(uploadsRoot, req.body?.previousUrl)
          res.end(JSON.stringify({ url: `/uploads/${category}/${req.file.filename}` }))
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
    configureServer(server) {
      server.middlewares.use('/api/state', async (req, res) => {
        try {
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
            await replaceFullState(body)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
            return
          }
          res.statusCode = 405
          res.end('Method not allowed')
        } catch (err) {
          console.error('[data-api-server]', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }))
        }
      })

      // POST /api/login { username, password } -> { userId } | 401. The only place a plaintext
      // password is ever compared — against the bcrypt hash in MariaDB, server-side only.
      server.middlewares.use('/api/login', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        try {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const { username, password } = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
          const userId = await authenticateUser(username, password)
          res.setHeader('Content-Type', 'application/json')
          if (!userId) {
            res.statusCode = 401
            res.end(JSON.stringify({ error: 'Credenciales incorrectas o cuenta inactiva.' }))
            return
          }
          res.end(JSON.stringify({ userId }))
        } catch (err) {
          console.error('[data-api-server login]', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }))
        }
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
