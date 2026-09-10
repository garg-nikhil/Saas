import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("logout", "routes/logout.tsx"),
  route("app", "routes/app.tsx", [
    index("routes/app.index.tsx"),
    route("planning", "routes/app.planning.tsx"),
    route("onboarding", "routes/app.onboarding.tsx"),
    route("statistiques", "routes/app.statistiques.tsx"),
    route("salaire", "routes/app.salaire.tsx"),
    route("export", "routes/app.export.tsx"),
    route("parametres", "routes/app.parametres.tsx", [
      index("routes/app.parametres.index.tsx"),
      route("profil", "routes/app.parametres.profil.tsx"),
      route("gardes", "routes/app.parametres.gardes.tsx"),
      route("notifications", "routes/app.parametres.notifications.tsx"),
      route("abonnement", "routes/app.parametres.abonnement.tsx"),
    ]),
  ]),
  route("api/billing/checkout", "routes/api.billing.checkout.ts"),
  route("api/billing/portal", "routes/api.billing.portal.ts"),
  route("api/webhooks/stripe", "routes/api.webhooks.stripe.ts"),
] satisfies RouteConfig;
