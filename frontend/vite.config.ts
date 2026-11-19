import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em desenvolvimento, o Vite (porta 5173) repassa /api para o Flask (porta 5050).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:5050" },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // o Bootstrap 5.3 ainda usa recursos antigos do Sass; esconde os avisos que vêm dele
        quietDeps: true,
        silenceDeprecations: ["import", "global-builtin", "color-functions",  "if-function"],
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
