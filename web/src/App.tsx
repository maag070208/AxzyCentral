import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ITLayout, useITTheme, type ITNavigationItem } from "@axzydev/axzy_ui_system";
import { LuBoxes, LuLayoutDashboard, LuTags, LuUsers } from "react-icons/lu";
import { api, session, setUnauthorizedHandler, type Me } from "./api";
import { AxzyLoader } from "./AxzyLogo";
import ClientDetail from "./pages/ClientDetail";
import Clients from "./pages/Clients";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Plans from "./pages/Plans";
import Products from "./pages/Products";

const NAV = [
  { id: "home", path: "/", label: "Inicio", icon: <LuLayoutDashboard size={16} /> },
  { id: "clients", path: "/clientes", label: "Clientes", icon: <LuUsers size={16} /> },
  { id: "products", path: "/productos", label: "Productos", icon: <LuBoxes size={16} /> },
  { id: "plans", path: "/planes", label: "Planes", icon: <LuTags size={16} /> },
];

export default function App() {
  const [token, setToken] = useState(session.get());
  const [me, setMe] = useState<Me | null>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { resolvedTheme, setDarkModeMode } = useITTheme();

  const logout = () => {
    session.set(null);
    setToken(null);
    setMe(null);
  };

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, []);

  useEffect(() => {
    if (token) api<Me>("GET", "/auth/me").then(setMe).catch(() => undefined);
  }, [token]);

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
  if (!me) return <div className="flex min-h-dvh items-center justify-center"><AxzyLoader /></div>;

  const navigationItems: ITNavigationItem[] = NAV.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    isActive: item.path === "/" ? pathname === "/" : pathname.startsWith(item.path),
    action: () => navigate(item.path),
  }));

  return (
    <ITLayout
      topBar={{
        logo: <img src={`${import.meta.env.BASE_URL}brand/${resolvedTheme === "dark" ? "logo-on-dark" : "logo-no-background"}.svg`} alt="axzydev" className="h-8 w-auto" />,
        logoText: "Central",
        userMenu: {
          userName: me.name,
          userEmail: me.username,
          menuItems: [
            { label: resolvedTheme === "dark" ? "Modo claro" : "Modo oscuro", onClick: () => setDarkModeMode(resolvedTheme === "dark" ? "light" : "dark") },
            { label: "Cerrar sesión", onClick: logout },
          ],
        },
      }}
      sidebar={{ navigationItems }}
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/clientes" element={<Clients />} />
        <Route path="/clientes/:id" element={<ClientDetail />} />
        <Route path="/productos" element={<Products />} />
        <Route path="/planes" element={<Plans />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ITLayout>
  );
}
