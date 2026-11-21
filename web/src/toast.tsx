import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ITToast } from "@axzydev/axzy_ui_system";

type Kind = "success" | "error";
interface Toast {
  id: number;
  message: string;
  type: Kind;
}

const ToastContext = createContext<(message: string, type?: Kind) => void>(() => {});

/** Un solo toast global, encima de todo (patrón de la guía del UI System). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const notify = useCallback((message: string, type: Kind = "success") => setToast({ id: Date.now(), message, type }), []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[99999]">
            <ITToast
              key={toast.id}
              message={toast.message}
              type={toast.type}
              duration={toast.type === "error" ? 5000 : 3000}
              position="top-right"
              onClose={() => setToast(null)}
            />
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export const useNotify = () => useContext(ToastContext);
