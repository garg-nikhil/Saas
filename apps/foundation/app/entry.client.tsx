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

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});

