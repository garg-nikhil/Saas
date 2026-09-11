import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  CheckCircle2Icon,
  AlertCircleIcon,
  InfoIcon,
  CloseIcon,
} from "./Icons";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, "id">) => string;
  removeToast: (id: string) => void;
  success: (message: string, title?: string) => string;
  error: (message: string, title?: string) => string;
  info: (message: string, title?: string) => string;
  warning: (message: string, title?: string) => string;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, message, title, duration = 5000 }: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastItem = { id, type, message, title, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast],
  );

  const success = useCallback(
    (message: string, title?: string) =>
      showToast({ type: "success", message, title }),
    [showToast],
  );

  const error = useCallback(
    (message: string, title?: string) =>
      showToast({ type: "error", message, title }),
    [showToast],
  );

  const info = useCallback(
    (message: string, title?: string) =>
      showToast({ type: "info", message, title }),
    [showToast],
  );

  const warning = useCallback(
    (message: string, title?: string) =>
      showToast({ type: "warning", message, title }),
    [showToast],
  );

  // Parse URL search params for redirect flash messages (e.g. ?toast=...&toastType=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const flashToast = params.get("toast");
      const flashType = (params.get("toastType") as ToastType) || "success";
      const flashTitle = params.get("toastTitle") || undefined;

      if (flashToast) {
        showToast({
          type: flashType,
          message: flashToast,
          title: flashTitle,
        });

        // Clean query params without reload
        const url = new URL(window.location.href);
        url.searchParams.delete("toast");
        url.searchParams.delete("toastType");
        url.searchParams.delete("toastTitle");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
    } catch {
      // Safe fallback
    }
  }, [showToast]);

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        removeToast,
        success,
        error,
        info,
        warning,
      }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      id="toast-container"
      role="region"
      aria-label="Notifications"
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        maxWidth: "420px",
        width: "calc(100vw - 3rem)",
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const { type, message, title } = toast;

  const styles = {
    success: {
      bg: "#f0fdf4",
      border: "#bbf7d0",
      text: "#15803d",
      titleColor: "#14532d",
      icon: <CheckCircle2Icon size={20} color="#16a34a" />,
    },
    error: {
      bg: "#fef2f2",
      border: "#fecaca",
      text: "#b91c1c",
      titleColor: "#7f1d1d",
      icon: <AlertCircleIcon size={20} color="#dc2626" />,
    },
    warning: {
      bg: "#fffbeb",
      border: "#fef3c7",
      text: "#b45309",
      titleColor: "#78350f",
      icon: <AlertCircleIcon size={20} color="#d97706" />,
    },
    info: {
      bg: "#f0f9ff",
      border: "#bae6fd",
      text: "#0369a1",
      titleColor: "#0c4a6e",
      icon: <InfoIcon size={20} color="#0284c7" />,
    },
  }[type];

  return (
    <div
      id={`toast-${toast.id}`}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        backgroundColor: styles.bg,
        border: `1px solid ${styles.border}`,
        color: styles.text,
        borderRadius: "0.75rem",
        padding: "0.875rem 1rem",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
        animation: "slideInToast 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        position: "relative",
      }}
    >
      <div style={{ flexShrink: 0, marginTop: "2px" }}>{styles.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <strong
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: styles.titleColor,
              marginBottom: "0.15rem",
            }}
          >
            {title}
          </strong>
        )}
        <p
          style={{
            margin: 0,
            fontSize: "0.85rem",
            lineHeight: 1.45,
            wordBreak: "break-word",
          }}
        >
          {message}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer la notification"
        style={{
          background: "transparent",
          border: "none",
          padding: "0.2rem",
          cursor: "pointer",
          color: styles.text,
          opacity: 0.7,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "0.375rem",
          transition: "opacity 0.15s ease",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
