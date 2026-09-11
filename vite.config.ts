import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import path from "path";

const cloudflarePlugin = cloudflare as unknown as (options?: Record<string, unknown>) => any;

function normalizeOriginPlugin() {
  return {
    name: "normalize-origin",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        // Only sanitize existing X-Forwarded-Host if provided by trusted upstream proxy.
        // NEVER overwrite Host or X-Forwarded-Host using the client's Origin header,
        // as that would allow attackers to forge origins or bypass CSRF protection.
        const forwardedHost = req.headers["x-forwarded-host"];
        if (forwardedHost) {
          const cleanHost = String(forwardedHost).split(",")[0].trim();
          req.headers["x-forwarded-host"] = cleanHost;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: path.resolve(import.meta.dirname, "apps/foundation"),
  plugins: [
    normalizeOriginPlugin(),
    cloudflarePlugin({
      viteEnvironment: { name: "ssr" },
      configPath: path.resolve(import.meta.dirname, "apps/foundation/wrangler.jsonc"),
    }),
    reactRouter(),
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
