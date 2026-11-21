import { ITBadget } from "@axzydev/axzy_ui_system";
import type { Status } from "./api";

export const errorOf = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal");

/** Fecha local `AAAA-MM-DD` (sin corrimiento por zona horaria). */
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const StatusBadge = ({ status }: { status: Status }) =>
  status === "ACTIVE" ? <ITBadget color="success" label="Activo" size="sm" /> : <ITBadget color="danger" label="Suspendido" size="sm" />;

/** Etiqueta mono en mayúsculas (lenguaje del UI System para metadatos). */
export const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="axc-eyebrow text-axzy-slate dark:text-axzy-mist">{children}</p>
);
