import { defineConfig } from 'vite'
import type { ViteDevServer } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createApiHandler } from './server/api.mjs'


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

// Mounts the app's API (server/api.mjs — /api/state, /api/login, /api/logout, /api/upload/*) into
// the dev server. Uploads go to public/uploads/, which Vite serves as static files. In production
// the same handler is mounted by server/prod.mjs instead (`npm run build && npm start`).
function apiServer() {
  return {
    name: 'api-server',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(createApiHandler({ uploadsRoot: path.resolve(__dirname, 'public/uploads') }))
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    apiServer(),
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
