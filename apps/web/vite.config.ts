import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // .env lives at the repo root; only VITE_* vars are exposed to the browser.
  envDir: path.resolve(import.meta.dirname, "../.."),
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: { port: 5173, strictPort: true },
});
