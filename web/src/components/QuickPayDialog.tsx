import { useEffect, useState } from "react";
import { ITBadget, ITButton, ITDialog } from "@axzydev/axzy_ui_system";
import { LuBanknote, LuCreditCard, LuRefreshCw, LuWallet } from "react-icons/lu";
import { api, dateText, generatePayment, money, updatePayment, type ClientDetail, type Payment } from "../api";
import { useNotify } from "../toast";
import { errorOf, paymentError } from "../shared";

/**
 * Cobro rápido desde cualquier pantalla: trae los pendientes del cliente y
 * permite marcarlos como pagados (efectivo/transferencia) o generar el
 * siguiente cobro según su plan, sin entrar al detalle.
 */
export default function QuickPayDialog({
  isOpen,
  clientId,
  clientName,
  onClose,
  onChanged,
}: {
  isOpen: boolean;
  clientId: string | null;
  clientName?: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const notify = useNotify();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!isOpen || !clientId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setClient(null);
    api<ClientDetail>("GET", `/clients/${clientId}`)
      .then((detail) => {
        if (!cancelled) setClient(detail);
      })
      .catch((e) => {
        if (!cancelled) setError(errorOf(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, clientId]);

  const pending: Payment[] = (client?.payments ?? [])
    .filter((p) => p.status === "PENDING")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const balance = pending.reduce((sum, p) => sum + Number(p.amount), 0);

  const markPaid = async (payment: Payment, method: "Efectivo" | "Transferencia") => {
    if (!clientId) return;
    setPaying(payment.id);
    try {
      await updatePayment(clientId, payment.id, { status: "PAID", method });
      notify(`Cobro de ${money(payment.amount)} marcado como pagado (${method})`);
      onChanged?.();
      onClose();
    } catch (e) {
      notify(paymentError(e), "error");
    } finally {
      setPaying(null);
    }
  };

  const nextCharge = async () => {
    if (!clientId) return;
    setGenerating(true);
    try {
      await generatePayment(clientId, {});
      notify("Siguiente cobro generado");
      onChanged?.();
      const detail = await api<ClientDetail>("GET", `/clients/${clientId}`);
      setClient(detail);
    } catch (e) {
      notify(paymentError(e), "error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ITDialog
      isOpen={isOpen}
      onClose={onClose}
      title={clientName ? `Cobrar · ${clientName}` : "Cobrar"}
      className="w-[min(94vw,640px)]"
    >
      {loading ? (
        <div className="flex flex-col gap-3 py-2" aria-busy="true">
          <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : error ? (
        <p className="py-4 text-sm text-rose-700 dark:text-rose-300">{error}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-sky-700 shadow-sm dark:bg-slate-900 dark:text-sky-300">
                <LuWallet size={17} />
              </span>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Saldo pendiente</p>
                <p className="text-xl font-bold leading-tight text-slate-900 dark:text-white">{money(balance)}</p>
              </div>
            </div>
            <ITBadget
              color={balance > 0 ? "warning" : "success"}
              label={balance > 0 ? `${pending.length} cobro(s) pendiente(s)` : "Al corriente"}
              size="sm"
            />
          </div>

          {pending.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center dark:border-slate-700">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No hay cobros pendientes.</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Puedes generar el siguiente cobro según el plan del cliente.
              </p>
              <ITButton size="sm" variant="outlined" className="mt-3" icon={<LuRefreshCw size={13} />} onClick={() => void nextCharge()} disabled={generating}>
                {generating ? "Generando…" : "Generar siguiente cobro"}
              </ITButton>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-3 dark:border-slate-700"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {money(p.amount)}
                      <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-slate-400">
                        {p.kind === "ONE_TIME" ? "Pago único" : p.period ?? "Recurrente"}
                      </span>
                    </p>
                    <p className={`text-xs ${p.dueDate < new Date().toISOString().slice(0, 10) ? "font-semibold text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>
                      Vence {dateText(p.dueDate)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ITButton
                      size="sm"
                      variant="outlined"
                      color="success"
                      icon={<LuBanknote size={13} />}
                      disabled={paying !== null}
                      onClick={() => void markPaid(p, "Efectivo")}
                    >
                      {paying === p.id ? "Guardando…" : "Efectivo"}
                    </ITButton>
                    <ITButton
                      size="sm"
                      variant="outlined"
                      icon={<LuCreditCard size={13} />}
                      disabled={paying !== null}
                      onClick={() => void markPaid(p, "Transferencia")}
                    >
                      Transferencia
                    </ITButton>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => void nextCharge()}
              disabled={generating}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
            >
              <LuRefreshCw size={12} className={generating ? "animate-spin" : ""} />
              {generating ? "Generando cobro…" : "Generar siguiente cobro"}
            </button>
            <ITButton size="sm" variant="text" color="gray" onClick={onClose}>
              Cerrar
            </ITButton>
          </div>
        </div>
      )}
    </ITDialog>
  );
}
