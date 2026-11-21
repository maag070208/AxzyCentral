import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type Tone = "primary" | "secondary" | "danger" | "ghost";

const tones: Record<Tone, string> = {
  primary: "bg-emerald-700 text-white hover:bg-emerald-800",
  secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  ghost: "text-stone-700 hover:bg-stone-200",
};

export const Button = ({ tone = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) => (
  <button
    {...props}
    className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
  />
);

export const Card = ({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`rounded-2xl border border-stone-200 bg-white p-5 ${className}`}>
    {(title || action) && (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {title && <h2 className="text-base font-bold">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);

export const Field = ({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="font-semibold text-stone-700">{label}</span>
    <input {...props} className="min-h-10 rounded-xl border border-stone-300 bg-white px-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20" />
    {hint && <span className="text-xs text-stone-500">{hint}</span>}
  </label>
);

export const Select = ({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="font-semibold text-stone-700">{label}</span>
    <select {...props} className="min-h-10 rounded-xl border border-stone-300 bg-white px-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20">
      {children}
    </select>
  </label>
);

const badgeTones = {
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-rose-100 text-rose-800",
  amber: "bg-amber-100 text-amber-900",
  gray: "bg-stone-200 text-stone-700",
};

export const Badge = ({ tone, children }: { tone: keyof typeof badgeTones; children: ReactNode }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone]}`}>{children}</span>
);

export const ErrorText = ({ children }: { children: ReactNode }) =>
  children ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{children}</p> : null;

export const errorOf = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal");
