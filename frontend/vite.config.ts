import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    // The app and the documentation page are built as two entry points.
    rollupOptions: { input: { main: "index.html", docs: "docs.html" } },
  },
  esbuild: { target: "es2022" },
});
