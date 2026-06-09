import { defineConfig } from 'vite';
// The official alphaTab Vite plugin. THIS IS LOAD-BEARING:
// it copies the Bravura music font to /font/ and the SoundFont to /soundfont/,
// and wires up alphaTab's Web Worker + Audio Worklet entry points.
// Without it, rendering and/or audio playback silently break.
import { alphaTab } from '@coderline/alphatab-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    alphaTab(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'Play-Along — practice studio',
        short_name: 'Play-Along',
        description:
          'Import a Guitar Pro or MusicXML song and play along — drums, saxophone and more — at adjustable speed, with the band synthesised underneath.',
        theme_color: '#14111b',
        background_color: '#14111b',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // app shell + fonts + the alphaTab worker/worklet + the soundfont, so the
        // app is fully usable offline once installed.
        globPatterns: ['**/*.{js,css,html,woff,woff2,otf,svg,png,sf2,sf3}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
    }),
  ],
  server: {
    open: true,
  },
});
