import { useState, type FormEvent } from "react";
import { api } from "../api";
import { Button, ErrorText, Field, errorOf } from "../ui";

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
      setError(errorOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-6">
        <div>
          <p className="text-4xl">🌮</p>
          <h1 className="mt-2 text-2xl font-black">Axzy Central</h1>
          <p className="text-sm text-stone-500">Administra tus taquerías.</p>
        </div>
        <Field label="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
        <Field label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</Button>
      </form>
    </div>
  );
}
