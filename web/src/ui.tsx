import type { ReactNode } from "react";
import { ITAlert, ITButton, ITEmptyState, ITText } from "@axzydev/axzy_ui_system";

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export function Page({
  eyebrow,
  title,
  description,
  actions,
  back,
  loading,
  error,
  onRetry,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { label: string; onClick: () => void };
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5 px-4 py-5 sm:px-6 lg:gap-6 lg:px-8 lg:py-7">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
                <path d="M9.5 3 5 7.5 9.5 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {back.label}
            </button>
          )}
          {eyebrow && (
            <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              {eyebrow}
            </p>
          )}
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[30px] dark:text-white">{title}</h1>
          {description && (
            <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:pt-1">{actions}</div>}
      </header>

      {error ? (
        <PageError message={error} onRetry={onRetry} />
      ) : loading ? (
        <PageSkeleton />
      ) : (
        children
      )}
    </div>
  );
}

function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
      <p className="text-sm font-semibold text-red-800 dark:text-red-200">No se pudo cargar la información</p>
      <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">{message}</p>
      {onRetry && (
        <ITButton size="sm" variant="outlined" className="mt-3" onClick={onRetry}>
          Reintentar
        </ITButton>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tarjetas                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "p-4 sm:p-5",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)] dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3.5 sm:px-5 dark:border-slate-800">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={`min-w-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  action,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-4 gap-y-2 ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{eyebrow}</p>
        )}
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPIs                                                                */
/* ------------------------------------------------------------------ */

type StatTone = "teal" | "green" | "amber" | "red" | "violet" | "navy";

const STAT_TONES: Record<StatTone, { chip: string; value: string }> = {
  teal: { chip: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300", value: "text-slate-900 dark:text-white" },
  green: { chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300", value: "text-slate-900 dark:text-white" },
  amber: { chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300", value: "text-slate-900 dark:text-white" },
  red: { chip: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300", value: "text-slate-900 dark:text-white" },
  violet: { chip: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300", value: "text-slate-900 dark:text-white" },
  navy: { chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", value: "text-slate-900 dark:text-white" },
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "teal",
  onClick,
  active = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  onClick?: () => void;
  active?: boolean;
}) {
  const t = STAT_TONES[tone];
  const className = `group flex min-w-0 flex-col rounded-2xl border bg-white p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition sm:p-5 dark:bg-slate-900 ${
    onClick ? "cursor-pointer hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_28px_-20px_rgba(16,24,40,0.4)] dark:hover:border-slate-700" : ""
  } ${active ? "border-sky-300 ring-1 ring-sky-200 dark:border-sky-800 dark:ring-sky-900" : "border-slate-200/80 dark:border-slate-800"}`;
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</span>
        {icon && <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${t.chip}`}>{icon}</span>}
      </div>
      <p className={`mt-3 text-[30px] font-bold leading-none tracking-tight sm:text-[32px] ${t.value}`}>{value}</p>
      {hint && <p className="mt-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabla                                                               */
/* ------------------------------------------------------------------ */

export const Th = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <th
    scope="col"
    className={`whitespace-nowrap px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 ${className}`}
  >
    {children}
  </th>
);

export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <td className={`px-3 py-3 text-[13.5px] align-middle text-slate-700 dark:text-slate-200 ${className}`}>{children}</td>
);

export function TableWrap({ children, className = "min-w-[760px]" }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={`axc-table w-full border-collapse ${className}`}>{children}</table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Acciones y avatares                                                 */
/* ------------------------------------------------------------------ */

type ActionTone = "default" | "primary" | "success" | "danger";

const ACTION_TONES: Record<ActionTone, string> = {
  default:
    "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
  primary:
    "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  danger:
    "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
};

export function IconAction({
  label,
  onClick,
  children,
  tone = "default",
  disabled,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  tone?: ActionTone;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-40 ${ACTION_TONES[tone]}`}
    >
      {children}
    </button>
  );
}

const AVATAR_TONES = [
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
];

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

export function Initials({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const index = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length;
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-[11px]"} ${AVATAR_TONES[index]}`}
    >
      {initialsOf(name)}
    </span>
  );
}

export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return <ITEmptyState title={title} description={description} action={action} />;
}

export function Muted({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <ITText muted className={`text-xs ${className}`}>
      {children}
    </ITText>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return <ITAlert variant="info">{children}</ITAlert>;
}
