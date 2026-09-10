import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof document !== "undefined" && document.documentElement) {
      for (const a of Array.from(document.documentElement.attributes)) {
        if (a.name.startsWith("__") || a.name.includes("token")) {
          document.documentElement.removeAttribute(a.name);
        }
      }
    }
  }, []);

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body suppressHydrationWarning>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  let message = "Une erreur est survenue";
  let details = "Une erreur inattendue est survenue lors du chargement de la page.";
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404 - Page non trouvée" : `Erreur ${error.status}`;
    details = error.statusText || details;
  } else if (error instanceof Error) {
    details = error.message;
  }

  return (
    <main className="container">
      <div className="card">
        <h1>{message}</h1>
        <p className="subtitle">{details}</p>
        <a href="/" className="btn btn-secondary">
          Retour à l'accueil
        </a>
      </div>
    </main>
  );
}
