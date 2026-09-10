import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import path from "path";

const cloudflarePlugin = cloudflare as unknown as (options?: Record<string, unknown>) => any;

export default defineConfig({
  plugins: [
    cloudflarePlugin({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
  ],
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "./app"),
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
    allowedHosts: true,
  },
});
