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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script
          dangerouslySetInnerHTML={{
            __html: `if(typeof document!=="undefined"&&document.documentElement){for(const a of Array.from(document.documentElement.attributes)){if(a.name.startsWith("__")||a.name.includes("token"))document.documentElement.removeAttribute(a.name);}}`,
          }}
        />
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
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404 - Not Found" : `Error ${error.status}`;
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
          Return Home
        </a>
      </div>
    </main>
  );
}
