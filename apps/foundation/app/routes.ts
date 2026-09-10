import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("logout", "routes/logout.tsx"),
  route("app", "routes/app.tsx"),
  route("api/billing/checkout", "routes/api.billing.checkout.ts"),
  route("api/billing/portal", "routes/api.billing.portal.ts"),
  route("api/webhooks/stripe", "routes/api.webhooks.stripe.ts"),
] satisfies RouteConfig;
