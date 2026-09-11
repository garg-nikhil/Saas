import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

interface ServerHandler {
  fetch: (request: Request, env?: any, ctx?: any) => Promise<Response>;
}

let serverHandler: ServerHandler | null = null;

async function getServerHandler(): Promise<ServerHandler> {
  if (serverHandler) return serverHandler;
  const serverBuildPath = path.resolve(__dirname, "../build/server/index.js");
  if (!fs.existsSync(serverBuildPath)) {
    execSync("npm run build", {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
    });
  }
  const fileUrl = pathToFileURL(serverBuildPath).href;
  const originalProcessDescriptors = Object.getOwnPropertyDescriptors(process);
  const serverModule = (await import(/* @vite-ignore */ fileUrl)) as { default: ServerHandler };
  Object.defineProperties(process, originalProcessDescriptors);
  serverHandler = serverModule.default;
  return serverHandler;
}

describe("Origin Normalization & CSRF Protection Integration Tests", () => {
  beforeAll(async () => {
    await getServerHandler();
  });

  afterAll(() => {
    // Clear any persistent background timers/intervals created by auth client polyfills
    const maxTimerId = setTimeout(() => {}, 0) as unknown as number;
    for (let i = 0; i <= maxTimerId + 100; i++) {
      clearTimeout(i);
      clearInterval(i);
    }
  });

  it("1) Legitimate proxied POST requests succeed without CSRF failure", async () => {
    const handler = await getServerHandler();

    // Container receives request targeting internal container interface from trusted reverse proxy
    const request = new Request("http://0.0.0.0:3000/login", {
      method: "POST",
      headers: {
        "x-forwarded-host": "ais-dev-4gvlgy7ooc7v2jxnakgggw-473348660466.asia-east1.run.app",
        "x-forwarded-proto": "https",
        "origin": "https://ais-dev-4gvlgy7ooc7v2jxnakgggw-473348660466.asia-east1.run.app",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "infirmier@example.fr",
        password: "WrongPassword123!",
      }).toString(),
    });

    const response = await handler.fetch(request, {}, { waitUntil: () => {} });

    // Request must NOT be rejected by CSRF check (status 400)
    // It should proceed into the route action and render the login response (status 200)
    expect(response.status).toBe(200);
    expect(response.status).not.toBe(400);
    const body = await response.text();
    expect(body).toContain("Connexion");
  });

  it("2) Attacker-supplied Origin headers are ignored for URL normalization", async () => {
    const handler = await getServerHandler();

    // Attacker tries to supply an arbitrary Origin header without trusted proxy headers
    const request = new Request("http://0.0.0.0:3000/login", {
      method: "POST",
      headers: {
        "origin": "https://attacker-supplied-origin.example.com",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "victim@example.fr",
        password: "Password123!",
      }).toString(),
    });

    const response = await handler.fetch(request, {}, { waitUntil: () => {} });

    // React Router's built-in CSRF validation compares Origin against request.url.
    // Because the worker does NOT use the attacker's Origin to rewrite request.url,
    // the mismatch triggers React Router's CSRF rejection (400 Bad Request).
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toBe("Bad Request");
  });

  it("3) Cross-site POST requests correctly trigger React Router CSRF failures", async () => {
    const handler = await getServerHandler();

    // An attacker on https://evil-site.com attempts a cross-site POST targeting the application
    // through the reverse proxy. The proxy forwards X-Forwarded-Host, but the browser's Origin
    // header identifies the cross-site origin (https://evil-site.com).
    const request = new Request("http://0.0.0.0:3000/login", {
      method: "POST",
      headers: {
        "x-forwarded-host": "ais-dev-4gvlgy7ooc7v2jxnakgggw-473348660466.asia-east1.run.app",
        "x-forwarded-proto": "https",
        "origin": "https://evil-site.com", // Untrusted cross-site origin
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "victim@example.fr",
        password: "Password123!",
      }).toString(),
    });

    const response = await handler.fetch(request, {}, { waitUntil: () => {} });

    // The worker normalizes the target URL to https://ais-dev-...run.app/login,
    // while preserving the client Origin https://evil-site.com.
    // React Router detects the cross-site Origin mismatch and blocks the request with 400 Bad Request.
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toBe("Bad Request");
  });

  it("4) Standard production Cloudflare Worker requests remain unchanged", async () => {
    const handler = await getServerHandler();

    // In a standard production Cloudflare worker environment, requests arrive with the public domain
    const request = new Request("https://planning-infirmier.fr/login", {
      method: "POST",
      headers: {
        "origin": "https://planning-infirmier.fr",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "infirmier@planning-infirmier.fr",
        password: "Password123!",
      }).toString(),
    });

    const response = await handler.fetch(
      request,
      { ENVIRONMENT: "production" },
      { waitUntil: () => {} },
    );

    // Matches production origin and executes normally
    expect(response.status).toBe(200);
  });
});
