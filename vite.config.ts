import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'e-Toilet — мапа громадських вбиралень Дніпра',
        short_name: 'e-Toilet',
        description: 'Інтерактивна мапа міських вбиралень Дніпра з аналізом пішої доступності',
        lang: 'uk',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#4f46e5',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Оболонка застосунку (JS/CSS/HTML/іконки) кешується під час встановлення
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Великі чанки (MapLibre) теж мають потрапити в precache
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Стиль, спрайти, шрифти та векторні тайли карти: кеш-першим, з обмеженням розміру
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Дані вбиралень із Supabase: мережа першою, за відсутності мережі останній кеш
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'toilets-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // 1. Графічний картографічний рушій MapLibre GL
            if (id.includes('maplibre-gl')) {
              return 'vendor-map'
            }

            // 2. Бібліотеки розрахунку просторової геометрії Turf
            if (id.includes('@turf') || id.includes('turf')) {
              return 'vendor-gis'
            }

            // 3. База даних, автентифікація та PostgREST-клієнт Supabase
            if (id.includes('@supabase') || id.includes('@gotrue')) {
              return 'vendor-supabase'
            }

            // 4. Реактивне ядро Vue та сповіщення
            if (id.includes('vue') || id.includes('vue-toastification')) {
              return 'vendor-ui'
            }
          }
        },
      },
    },
  },
})