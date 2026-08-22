import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Assets are served from the domain root; relative paths break on nested SPA routes.
  base: "/",
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
  },
})
