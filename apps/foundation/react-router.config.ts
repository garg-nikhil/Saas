import type { Config } from "@react-router/dev/config";

export default {
  // Server-side rendering enabled by default for Cloudflare Workers
  ssr: true,
  allowedActionOrigins: [
    "localhost",
    "localhost:*",
    "127.0.0.1",
    "127.0.0.1:*",
    "0.0.0.0",
    "0.0.0.0:*",
    "*.run.app",
    "**.run.app",
    "*.aistudio-preview.app",
    "**.aistudio-preview.app",
  ],
} satisfies Config;
