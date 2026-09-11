import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

// Clean up any proxy-injected attributes (such as Cloud Run remote frame tokens)
// from the document root before React 19 hydration begins.
if (typeof document !== "undefined" && document.documentElement) {
  for (const attr of Array.from(document.documentElement.attributes)) {
    if (attr.name.startsWith("__") || attr.name.includes("token") || attr.name.startsWith("data-gcr")) {
      document.documentElement.removeAttribute(attr.name);
    }
  }
}

// Suppress known React 19 false-positive warning for framework-injected script tags (<Scripts />, <ScrollRestoration />)
if (typeof window !== "undefined") {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Encountered a script tag while rendering React component")
    ) {
      return;
    }
    originalConsoleError(...args);
  };
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});

