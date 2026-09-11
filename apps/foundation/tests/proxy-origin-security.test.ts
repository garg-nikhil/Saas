import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

interface ServerHandler {
  fetch: (request: Request, env?: any, ctx?: any) => Promise<Response>;
}

let cachedHandler: ServerHandler | null = null;

async function loadServerHandler(): Promise<ServerHandler> {
  if (cachedHandler) return cachedHandler;
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
  cachedHandler = serverModule.default;
  return cachedHandler;
}

describe("Security Hotfix — Proxy Origin Normalization & CSRF Validation", () => {
  const serverBuildPath = path.resolve(__dirname, "../build/server/index.js");

  beforeAll(() => {
    if (!fs.existsSync(serverBuildPath)) {
      execSync("npm run build", {
        cwd: path.resolve(__dirname, ".."),
        stdio: "inherit",
      });
    }
  });

  afterAll(() => {
    // Clear any persistent background timers/intervals created by auth client polyfills
    const maxTimerId = setTimeout(() => {}, 0) as unknown as number;
    for (let i = 0; i <= maxTimerId + 100; i++) {
      clearTimeout(i);
      clearInterval(i);
    }
  });

  it(
    "1. Legitimate proxied POST succeeds and does not trigger 400 CSRF error",
    async () => {
      const handler = await loadServerHandler();

    // Container receives request targeting http://0.0.0.0:3000/login from reverse proxy
    const request = new Request("http://0.0.0.0:3000/login", {
      method: "POST",
      headers: {
        "x-forwarded-host": "ais-dev-app.asia-east1.run.app",
        "x-forwarded-proto": "https",
        "origin": "https://ais-dev-app.asia-east1.run.app",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "infirmier@example.fr",
        password: "WrongPassword123!",
      }).toString(),
    });

    const response = await handler.fetch(request, {}, { waitUntil: () => {} });

    // Should NOT return 400 Bad Request (CSRF failure).
    // Instead, action executes and returns login response (200/400 validation error from form, but NOT 400 CSRF response)
    expect(response.status).not.toBe(400);
    const text = await response.text();
    // Verify it reached the action (form validation error or page content returned)
    expect(text).toContain("Connexion");
  }, 15000);

  it("2. Known AI Studio / proxy origin mismatch is resolved using trusted proxy headers", async () => {
    const handler = await loadServerHandler();

    // Internal URL http://127.0.0.1:3000/login vs external origin https://ais-dev-app.asia-east1.run.app
    const request = new Request("http://127.0.0.1:3000/login", {
      method: "POST",
      headers: {
        "x-forwarded-host": "ais-dev-app.asia-east1.run.app",
        "x-forwarded-proto": "https",
        "origin": "https://ais-dev-app.asia-east1.run.app",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "infirmier@example.fr",
        password: "WrongPassword123!",
      }).toString(),
    });

    const response = await handler.fetch(request, {}, { waitUntil: () => {} });

    // The proxy origin mismatch must NOT cause a 400 Bad Request CSRF failure
    expect(response.status).toBe(200);
  });

  it("3. Attacker-controlled Origin header alone cannot rewrite request.url or pass CSRF", async () => {
    const handler = await loadServerHandler();

    // Attacker sends request to internal container URL with malicious Origin and NO X-Forwarded-Host
    const request = new Request("http://0.0.0.0:3000/login", {
      method: "POST",
      headers: {
        "origin": "https://attacker.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "victim@example.fr",
        password: "Password123!",
      }).toString(),
    });

    const response = await handler.fetch(request, {}, { waitUntil: () => {} });

    // React Router CSRF validation MUST reject this request because Origin (attacker.example)
    // does not match request.url origin (0.0.0.0:3000) and was NOT rewritten using attacker's Origin.
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toBe("Bad Request");
  });

  it("4. Cross-site POST through trusted proxy still fails React Router CSRF validation", async () => {
    const handler = await loadServerHandler();

    // Attacker sends cross-site POST through trusted proxy to victim application
    const request = new Request("http://0.0.0.0:3000/login", {
      method: "POST",
      headers: {
        "x-forwarded-host": "ais-dev-app.asia-east1.run.app",
        "x-forwarded-proto": "https",
        "origin": "https://evil-attacker.com", // Cross-site origin
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "victim@example.fr",
        password: "Password123!",
      }).toString(),
    });

    const response = await handler.fetch(request, {}, { waitUntil: () => {} });

    // Reconstructed request URL is https://ais-dev-app.asia-east1.run.app/login,
    // which DOES NOT match Origin: https://evil-attacker.com.
    // React Router CSRF check MUST fail and return 400 Bad Request.
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toBe("Bad Request");
  });

  it("5. Forwarded host/proto normalization only happens under intended trusted proxy conditions", async () => {
    const handler = await loadServerHandler();

    // Direct request without X-Forwarded-Host retains original URL semantics
    const request = new Request("http://localhost:3000/login", {
      method: "POST",
      headers: {
        "origin": "http://localhost:3000",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "test@example.fr",
        password: "Password123!",
      }).toString(),
    });

    const response = await handler.fetch(request, {}, { waitUntil: () => {} });

    // Localhost origin matching localhost request URL succeeds without 400
    expect(response.status).toBe(200);
  });

  it("6. Normal production requests retain their original origin semantics", async () => {
    const handler = await loadServerHandler();

    // Production Cloudflare Worker request with matching production origin and no proxy headers
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

    const response = await handler.fetch(request, {}, { waitUntil: () => {} });

    // Retains original URL semantics and succeeds
    expect(response.status).toBe(200);
  });
});
