import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "/static/" matches the Go server's asset mount (pkg/webui.AssetPath), so
// every URL Vite emits already points where the binary serves it from.
//
// outDir writes straight into the Go tree: go:embed needs the files present at
// compile time, and a copy step between here and there is one more thing that
// can go stale.
export default defineConfig({
  plugins: [react()],
  base: "/static/",
  build: {
    outDir: "../pkg/webui/dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    // Dev topology: Vite serves the app with HMR and forwards the API to the
    // Go server, so the frontend can be worked on without a Go rebuild.
    proxy: {
      "/v1": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
});
