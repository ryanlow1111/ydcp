import { defineConfig } from 'vite'

// Tauri expects a fixed dev port and must see Rust errors, so the screen isn't cleared.
// https://tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // WebView2 on Windows is Chromium; WKWebView on macOS 13+ is Safari 16+.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari16',
    // Vite's built-in minifier (Vite 8 no longer bundles esbuild); off for debug builds.
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
})
