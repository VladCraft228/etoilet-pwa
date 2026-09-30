import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
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