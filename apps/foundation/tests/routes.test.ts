import { describe, it, expect } from "vitest";
import routes from "../app/routes";
import fs from "node:fs";
import path from "node:path";
import Home from "../app/routes/home";
import Login from "../app/routes/login";
import Signup from "../app/routes/signup";
import ForgotPassword from "../app/routes/forgot-password";
import ResetPassword from "../app/routes/reset-password";
import AppDashboard from "../app/routes/app";

describe("Foundation Architecture & Routes Verification", () => {
  it("defines all required routes in routes.ts", () => {
    expect(routes).toBeDefined();
    expect(Array.isArray(routes)).toBe(true);

    const routeList = routes as Array<{ index?: boolean; path?: string; file: string }>;
    
    const hasIndex = routeList.some((r) => r.index === true && r.file.includes("home.tsx"));
    const hasLogin = routeList.some((r) => r.path === "login" && r.file.includes("login.tsx"));
    const hasSignup = routeList.some((r) => r.path === "signup" && r.file.includes("signup.tsx"));
    const hasForgotPassword = routeList.some((r) => r.path === "forgot-password" && r.file.includes("forgot-password.tsx"));
    const hasResetPassword = routeList.some((r) => r.path === "reset-password" && r.file.includes("reset-password.tsx"));
    const hasLogout = routeList.some((r) => r.path === "logout" && r.file.includes("logout.tsx"));
    const hasApp = routeList.some((r) => r.path === "app" && r.file.includes("app.tsx"));

    expect(hasIndex).toBe(true);
    expect(hasLogin).toBe(true);
    expect(hasSignup).toBe(true);
    expect(hasForgotPassword).toBe(true);
    expect(hasResetPassword).toBe(true);
    expect(hasLogout).toBe(true);
    expect(hasApp).toBe(true);
  });

  it("exports valid React component modules for all routes", () => {
    expect(typeof Home).toBe("function");
    expect(typeof Login).toBe("function");
    expect(typeof Signup).toBe("function");
    expect(typeof ForgotPassword).toBe("function");
    expect(typeof ResetPassword).toBe("function");
    expect(typeof AppDashboard).toBe("function");
  });

  it("has valid Cloudflare Workers wrangler.jsonc configuration", () => {
    const wranglerPath = path.resolve(__dirname, "../wrangler.jsonc");
    expect(fs.existsSync(wranglerPath)).toBe(true);

    const raw = fs.readFileSync(wranglerPath, "utf-8");
    const parsed = JSON.parse(raw);

    expect(parsed.name).toBe("foundation");
    expect(parsed.compatibility_date).toBeDefined();
    expect(parsed.main).toBe("./workers/app.ts");
    expect(parsed.assets?.directory).toBe("./build/client");
  });

  it("has SSR enabled in react-router.config.ts", async () => {
    const configPath = path.resolve(__dirname, "../react-router.config.ts");
    expect(fs.existsSync(configPath)).toBe(true);
    const configModule = await import("../react-router.config");
    expect(configModule.default.ssr).toBe(true);
  });
});
