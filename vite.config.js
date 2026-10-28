import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Mirrors the /tt PostHog proxy rewrites in vercel.json
const posthogProxy = {
  '/tt/static': { target: 'https://eu-assets.i.posthog.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/tt/, '') },
  '/tt/array': { target: 'https://eu-assets.i.posthog.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/tt/, '') },
  '/tt': { target: 'https://eu.i.posthog.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/tt/, '') },
}

export default defineConfig({
  server: { proxy: posthogProxy },
  preview: { proxy: posthogProxy },
  worker: { format: 'es' },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'pwa-icon.svg'],
      manifest: {
        name: 'Mongeesy - Learn MongoDB in your browser',
        short_name: 'Mongeesy',
        description: 'Interactive MongoDB tutorial that runs entirely in your browser. Write real queries, get instant feedback. No signup needed.',
        theme_color: '#47A248',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
})
