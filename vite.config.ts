import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "apps/foundation"),
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter({
      appDirectory: path.resolve(import.meta.dirname, "apps/foundation/app"),
    }),
  ],
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "apps/foundation/app"),
    },
  },
  build: {
    rolldownOptions: {
      external: ["pg"],
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    allowedHosts: true,
  },
});
