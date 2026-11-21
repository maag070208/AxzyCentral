import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { session, setUnauthorizedHandler } from "./api";
import Login from "./pages/Login";
import Plans from "./pages/Plans";
import TaqueriaDetail from "./pages/TaqueriaDetail";
import Taquerias from "./pages/Taquerias";

export default function App() {
  const [token, setToken] = useState(session.get());

  useEffect(() => {
    setUnauthorizedHandler(() => {
      session.set(null);
      setToken(null);
    });
  }, []);

  if (!token) {
    return (
      <Login
        onLogin={(t) => {
          session.set(t);
          setToken(t);
        }}
      />
    );
  }

  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold ${isActive ? "bg-white/15 text-white" : "text-emerald-100 hover:text-white"}`;

  return (
    <div className="min-h-dvh">
      <header className="bg-emerald-800">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3">
          <span className="mr-4 text-lg font-black text-white">🌮 Axzy Central</span>
          <NavLink to="/taquerias" className={link}>Taquerías</NavLink>
          <NavLink to="/planes" className={link}>Planes</NavLink>
          <button
            className="ml-auto rounded-lg px-3 py-1.5 text-sm font-semibold text-emerald-100 hover:text-white"
            onClick={() => {
              session.set(null);
              setToken(null);
            }}
          >
            Salir
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/taquerias" element={<Taquerias />} />
          <Route path="/taquerias/:id" element={<TaqueriaDetail />} />
          <Route path="/planes" element={<Plans />} />
          <Route path="*" element={<Navigate to="/taquerias" replace />} />
        </Routes>
      </main>
    </div>
  );
}
