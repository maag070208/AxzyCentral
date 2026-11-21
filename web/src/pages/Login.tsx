import { useState, type FormEvent } from "react";
import { ITAlert, ITBentoPill, ITBentoPillRow, ITButton, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { api } from "../api";
import { AxzyLogo } from "../AxzyLogo";

/**
 * Acceso a la Central con el lenguaje bento: panel navy de marca a la izquierda
 * (tarjeta flotante sobre el lienzo) y formulario en una tarjeta clara.
 * El flujo de sesión es el mismo de siempre.
 */
export default function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ token: string }>("POST", "/auth/login", { username, password });
      onLogin(res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[var(--it-layout-bg)] p-3 sm:p-5 lg:p-6">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-6xl gap-3 sm:min-h-[calc(100dvh-2.5rem)] lg:grid-cols-[1.05fr_1fr] lg:gap-4">
        <aside className="axc-rise relative hidden flex-col justify-between overflow-hidden rounded-[26px] bg-axzy-navy p-7 text-white sm:p-10 lg:flex lg:p-12">
          {/* Brillo de marca: dos halos suaves, sin fondos planos duros. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-2xl"
            style={{ background: "radial-gradient(circle, #4598b1 0%, transparent 70%)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full opacity-25 blur-3xl"
            style={{ background: "radial-gradient(circle, #387d92 0%, transparent 70%)" }}
          />

          <div className="relative">
            <AxzyLogo variant="logo" onDark label="axzydev" style={{ width: 280 }} className="-ml-2 max-w-[66%]" />
          </div>

          <div className="relative my-8">
            <p className="axc-eyebrow text-axzy-mist">Axzy Central</p>
            <h1
              className="mt-3 max-w-md text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
              style={{ color: "#ffffff" }}
            >
              Tus clientes, sus planes y sus cobros, en un solo lugar.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70 sm:text-base">
              Da de alta clientes de cualquier producto, registra cobros mensuales o únicos y activa sus tablets con un QR.
            </p>
            <ITBentoPillRow className="mt-5 text-white/75">
              <ITBentoPill dot="#4598b1">Clientes y planes</ITBentoPill>
              <ITBentoPill dot="#4598b1">Cobros</ITBentoPill>
              <ITBentoPill dot="#4598b1">Licencias con QR</ITBentoPill>
            </ITBentoPillRow>
          </div>

          <p className="relative font-mono text-xs text-axzy-mist">axzy.dev</p>
        </aside>

        <main className="axc-rise flex items-center justify-center rounded-[26px] bg-[var(--it-card-bg)] p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.10)] sm:p-10">
          <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-5" noValidate>
            <div className="lg:hidden">
              <AxzyLogo variant="logo" style={{ width: 200 }} />
            </div>
            <div>
              <p className="axc-eyebrow text-axzy-slate dark:text-axzy-mist">Consola</p>
              <ITText as="h2" className="mt-1 text-3xl font-bold tracking-tight text-axzy-navy dark:text-white">
                Entrar
              </ITText>
              <ITText muted className="mt-1 block text-sm">
                Administra clientes, planes, cobros y licencias.
              </ITText>
            </div>
            {error && <ITAlert variant="error">{error}</ITAlert>}
            <ITInput name="username" label="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
            <ITInput name="password" type="password" label="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <ITButton type="submit" className="w-full" disabled={busy || !username || !password}>
              {busy ? "Entrando…" : "Entrar"}
            </ITButton>
            <ITText muted className="text-center text-xs">
              axzy.dev · Central
            </ITText>
          </form>
        </main>
      </div>
    </div>
  );
}
