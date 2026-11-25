import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' : l'utilisateur choisit quand recharger (pas de perte de session en cours)
      registerType: 'prompt',
      injectRegister: false, // enregistrement géré dans src/components/UpdatePrompt.tsx
      manifestFilename: 'manifest.json',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'OmniStudy',
        short_name: 'OmniStudy',
        description:
          "Révise tes examens partout, tout le temps, même hors-ligne : synthèses IA, Blur-Recall, quiz, audio et répétition espacée.",
        lang: 'fr',
        start_url: '/',
        scope: '/',
        id: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e0e10',
        theme_color: '#5e6ad2',
        categories: ['education', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Micro-session (2 min)',
            short_name: 'Express',
            url: '/session?pace=express',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Mode urgence J-1',
            short_name: 'Urgence',
            url: '/session?pace=urgent',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        // .mjs = worker pdf.js : indispensable pour importer des PDF hors-ligne
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,json,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
