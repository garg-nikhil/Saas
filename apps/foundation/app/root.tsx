import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import "./app.css";
import { ToastProvider } from "./components/Toast";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
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
    <main className="container" id="root-error-view">
      <div className="card" id="root-error-card">
        <h1 id="root-error-title">{message}</h1>
        <p className="subtitle" id="root-error-subtitle">{details}</p>
        <a href="/" className="btn btn-secondary" id="root-error-home-btn">
          Retour à l'accueil
        </a>
      </div>
    </main>
  );
}
