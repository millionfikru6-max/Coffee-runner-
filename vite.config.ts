import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    target: "es2020",
    // Content-hashed chunks let the service worker cache three.js forever and
    // re-download only app code on an update. The previous single-file build
    // forced a full ~1MB re-download for every change.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          react: ["react", "react-dom"],
        },
      },
    },
    // Three.js is legitimately large; don't fail the build on it.
    chunkSizeWarningLimit: 900,
    cssCodeSplit: false,
    sourcemap: false,
  },
});
