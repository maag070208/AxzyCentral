import { useState, type FormEvent } from "react";
import { ITAlert, ITButton, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { api } from "../api";
import { AxzyLogo } from "../AxzyLogo";

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
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-axzy-navy p-12 text-white lg:flex">
        <AxzyLogo variant="logo" onDark label="axzydev" style={{ width: 300 }} className="-ml-2" />
        <div>
          <p className="axc-eyebrow text-axzy-mist">Axzy Central</p>
          <h1 className="mt-3 max-w-md text-4xl font-bold leading-tight tracking-tight text-white!">
            Tus clientes, sus planes y sus licencias, en un solo lugar.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-axzy-mist!">
            Da de alta clientes de cualquier producto, registra sus cobros y activa o suspende sus apps.
          </p>
        </div>
        <p className="font-mono text-xs text-axzy-mist">axzy.dev</p>
      </aside>

      <main className="flex items-center justify-center bg-axzy-paper px-4 py-10 dark:bg-axzy-navy lg:dark:bg-[#141b26]">
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-5" noValidate>
          <div className="lg:hidden">
            <AxzyLogo variant="logo" style={{ width: 220 }} />
          </div>
          <div>
            <p className="axc-eyebrow text-axzy-slate dark:text-axzy-mist">Consola</p>
            <ITText as="h2" className="mt-1 text-3xl font-bold tracking-tight text-axzy-navy dark:text-white">Entrar</ITText>
          </div>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITInput name="username" label="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          <ITInput name="password" type="password" label="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <ITButton type="submit" disabled={busy || !username || !password} className="w-full">
            {busy ? "Entrando…" : "Entrar"}
          </ITButton>
        </form>
      </main>
    </div>
  );
}
