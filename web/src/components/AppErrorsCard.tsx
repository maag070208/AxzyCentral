import { useCallback, useEffect, useState } from "react";
import { ITBadget, ITButton } from "@axzydev/axzy_ui_system";
import { LuBug, LuRefreshCw } from "react-icons/lu";
import { agoText, api, type AppErrorItem } from "../api";
import { errorOf } from "../shared";
import { Card, Empty } from "../ui";

/** Cierres inesperados de la app de un cliente (cocina y meseras), los más recientes primero. */
export default function AppErrorsCard({ clientId }: { clientId: string }) {
  const [errors, setErrors] = useState<AppErrorItem[] | null>(null);
  const [failure, setFailure] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailure("");
    api<AppErrorItem[]>("GET", `/clients/${clientId}/app-errors`)
      .then(setErrors)
      .catch((e) => setFailure(errorOf(e)));
  }, [clientId]);
  useEffect(load, [load]);

  const week = (errors ?? []).filter((e) => Date.now() - Date.parse(e.occurredAt) < 7 * 86_400_000).length;

  return (
    <Card
      title="Fallas de la app"
      subtitle={errors === null ? "Cierres inesperados que reportan los teléfonos" : week > 0 ? `${week} en los últimos 7 días` : "Sin fallas en los últimos 7 días"}
      actions={
        <ITButton size="sm" variant="text" color="gray" icon={<LuRefreshCw size={13} />} onClick={load}>
          Actualizar
        </ITButton>
      }
    >
      {failure ? (
        <p className="p-5 text-sm text-red-600 dark:text-red-400">{failure}</p>
      ) : errors && errors.length === 0 ? (
        <Empty title="Sin fallas reportadas" description="Si la app se cierra sola en cocina o con una mesera, aparece aquí con su detalle." />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {(errors ?? []).map((e) => (
            <li key={e.id} className="px-5 py-3">
              <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                  <LuBug size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12.5px] text-slate-800 dark:text-slate-100">{e.message}</span>
                  <span className="mt-0.5 block text-[12px] text-slate-500 dark:text-slate-400">
                    {agoText(e.occurredAt)} · {e.source === "mesero" ? "Mesera" : "Cocina"} ({e.model ?? e.deviceName}) · v{e.appVersion ?? "?"}
                  </span>
                </span>
                <ITBadget color={e.source === "mesero" ? "warning" : "danger"} label={e.source === "mesero" ? "Mesera" : "Cocina"} size="sm" />
              </button>
              {open === e.id && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  {e.stack}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
