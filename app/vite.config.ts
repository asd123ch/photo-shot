import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon-16.png'],
      manifest: {
        name: 'Photo-Shot',
        short_name: 'Photo-Shot',
        description: 'Mobile-first AI image post-processing and editing tool.',
        theme_color: '#0a0b0d',
        background_color: '#0a0b0d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        // Transparent icons only (purpose 'any'). No opaque maskable on purpose:
        // a maskable must be full-bleed/opaque, which is what put a solid tile
        // behind the mascot. Android launchers keep the transparency this way.
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        // config.js carries runtime API keys and must never be served stale from
        // the service-worker precache — always let it hit the network.
        // heic2any is a large, rarely-used chunk loaded on demand — keep it out
        // of the precache so the install/offline footprint stays small.
        globIgnores: ['**/config.js', '**/heic2any-*.js'],
        navigateFallbackDenylist: [/^\/config\.js$/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
