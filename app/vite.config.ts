import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import gameBuildOutput from "./scripts/build-output"

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), gameBuildOutput()],
  server: {
    port: 7101,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
