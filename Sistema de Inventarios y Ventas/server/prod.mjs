// Production server: `npm run build` then `npm start`. Plain Node http, no Vite involved:
// - /api/*      -> the same handler the dev server uses (server/api.mjs)
// - /uploads/*  -> UPLOADS_DIR, a persistent folder outside dist/ (a Docker volume in production),
//                  so uploaded images survive rebuilds/redeploys
// - everything else -> the built SPA in dist/, falling back to index.html for client-side routes
//
// Env: PORT (default 3000), UPLOADS_DIR (default ./uploads), plus DB_* and SESSION_SECRET as in
// .env.example. Set NODE_ENV=production so the session cookie gets `Secure` (HTTPS only).
import http from 'http'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createApiHandler } from './api.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(rootDir, 'dist')
const uploadsDir = path.resolve(rootDir, process.env.UPLOADS_DIR || 'uploads')
const port = Number(process.env.PORT) || 3000

if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET env var is required (see .env.example)')
  process.exit(1)
}
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error(`No build found at ${distDir} — run \`npm run build\` first`)
  process.exit(1)
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

// Resolves a URL path inside `baseDir`, or null if it would escape it (../ tricks) or isn't a file.
function resolveFile(baseDir, urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const resolved = path.resolve(baseDir, '.' + path.posix.normalize('/' + decoded))
  if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) return null
  try {
    return fs.statSync(resolved).isFile() ? resolved : null
  } catch {
    return null
  }
}

function sendFile(req, res, filePath, cacheControl) {
  res.statusCode = 200
  res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream')
  res.setHeader('Cache-Control', cacheControl)
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(filePath)
    .on('error', () => {
      if (!res.headersSent) res.statusCode = 500
      res.end()
    })
    .pipe(res)
}

function notFound(res) {
  res.statusCode = 404
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end('Not found')
}

const api = createApiHandler({ uploadsRoot: uploadsDir })

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    return res.end('Method not allowed')
  }
  const pathname = (req.url || '/').split('?')[0]

  if (pathname.startsWith('/uploads/')) {
    const file = resolveFile(uploadsDir, pathname.slice('/uploads'.length))
    // Uploaded file names are unique (timestamp + random) and never overwritten, but a
    // replaced image's old URL gets deleted — so cache, just not forever.
    return file ? sendFile(req, res, file, 'public, max-age=86400') : notFound(res)
  }

  const file = resolveFile(distDir, pathname)
  if (file) {
    // Vite fingerprints everything under assets/ (content hash in the name) — safe to cache forever.
    const immutable = pathname.startsWith('/assets/')
    return sendFile(req, res, file, immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
  }
  // Something that looks like a file (has an extension) but doesn't exist is a real 404, not a
  // client-side route — don't answer a missing .js/.png with index.html.
  if (path.extname(pathname)) return notFound(res)
  sendFile(req, res, path.join(distDir, 'index.html'), 'no-cache')
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  api(req, res, () => serveStatic(req, res))
})

server.listen(port, () => {
  console.log(`ITA Flores listening on http://0.0.0.0:${port} (uploads: ${uploadsDir})`)
})

// Docker sends SIGTERM on `docker compose down`/redeploy — close cleanly instead of waiting for the
// 10s kill timeout.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
