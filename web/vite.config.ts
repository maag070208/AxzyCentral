import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // En desarrollo la consola llama a /api y Vite lo pasa al API local.
  server: { proxy: { "/api": "http://localhost:4100" } },
});
