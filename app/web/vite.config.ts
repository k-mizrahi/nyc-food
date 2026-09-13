import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Hosted at https://k-mizrahi.github.io/nyc-food/admin/ — assets need the
// subpath in production; dev stays at /. Google lookups go through the
// resolve-place Supabase Edge Function (the old dev-only proxy is gone).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/nyc-food/admin/' : '/',
  plugins: [react()],
}))
