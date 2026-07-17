"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";

type ToastKind = "success" | "error" | "info";
interface Toast { id: number; message: string; kind: ToastKind }
interface ToastApi { push: (message: string, kind?: ToastKind) => void }

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, kind }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4_500);
  }, []);
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <button
            type="button"
            key={toast.id}
            className={`toast toast-${toast.kind}`}
            onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
          >
            <Icon name={toast.kind === "success" ? "check" : toast.kind === "error" ? "alert" : "sparkles"} size={18} />
            <span>{toast.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider.");
  return context;
}

