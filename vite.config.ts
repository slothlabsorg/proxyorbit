import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

// Read version from package.json at build time and inject as __APP_VERSION__
// so the in-app StatusBar / Support footer never drift from the released
// installer version.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 1423, strictPort: true },
  test: { globals: true, environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
