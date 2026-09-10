import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

interface ServerHandler {
  fetch: (request: Request) => Promise<Response>;
}

async function loadServerHandler(): Promise<ServerHandler> {
  const serverBuildModule = "../build/server/index.js";
  const serverModule = (await import(/* @vite-ignore */ serverBuildModule)) as { default: ServerHandler };
  return serverModule.default;
}

describe("HTTP-level SSR Verification", () => {
  const serverBuildPath = path.resolve(__dirname, "../build/server/index.js");

  beforeAll(() => {
    if (!fs.existsSync(serverBuildPath)) {
      execSync("pnpm run build", {
        cwd: path.resolve(__dirname, ".."),
        stdio: "inherit",
      });
    }
  });

  it("handles GET / with status 200, text/html, and complete document structure", async () => {
    const handler = await loadServerHandler();

    expect(handler).toBeDefined();
    expect(typeof handler.fetch).toBe("function");

    const request = new Request("http://localhost/");
    const response = await handler.fetch(request);

    expect(response.status).toBe(200);

    const contentType = response.headers.get("content-type") || "";
    expect(contentType).toContain("text/html");

    const body = await response.text();

    // Verify expected HTML document structure
    expect(body).toContain("<!DOCTYPE html>");
    expect(body).toContain("<html");
    expect(body).toContain("<head>");
    expect(body).toContain("<body");

    // Verify actual server-rendered application content
    expect(body).toContain("SaaS Factory");
    expect(body).toContain("Build localized SaaS products faster.");
    expect(body).toContain('id="home-view"');
    expect(body).toContain('id="home-card"');
    expect(body).toContain('id="home-title"');
    expect(body).toContain('id="btn-login"');
    expect(body).toContain('id="btn-signup"');

    // Verify server loader execution data is embedded in HTML payload
    expect(body).toContain("renderedAt");
  });

  it("handles GET /login with status 200 and rendered login form", async () => {
    const handler = await loadServerHandler();

    const request = new Request("http://localhost/login");
    const response = await handler.fetch(request);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Connexion");
    expect(body).toContain('id="login-form"');
  });

  it("handles GET /signup with status 200 and rendered signup form", async () => {
    const handler = await loadServerHandler();

    const request = new Request("http://localhost/signup");
    const response = await handler.fetch(request);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Créer un compte");
    expect(body).toContain('id="signup-form"');
  });

  it("handles GET /forgot-password with status 200 and rendered form", async () => {
    const handler = await loadServerHandler();

    const request = new Request("http://localhost/forgot-password");
    const response = await handler.fetch(request);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Mot de passe oublié");
    expect(body).toContain('id="forgot-password-form"');
  });

  it("handles GET /app unauthenticated by redirecting to /login", async () => {
    const handler = await loadServerHandler();

    const request = new Request("http://localhost/app");
    const response = await handler.fetch(request);

    // Protected route redirects unauthenticated requests
    expect([302, 307]).toContain(response.status);
    const location = response.headers.get("Location") || "";
    expect(location).toContain("/login");
  });
});
