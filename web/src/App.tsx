import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ITLayout, useITTheme, type ITNavigationItem } from "@axzydev/axzy_ui_system";
import { LuBoxes, LuLayoutDashboard, LuReceipt, LuTags, LuUsers } from "react-icons/lu";
import { api, session, setUnauthorizedHandler, type Me } from "./api";
import { AxzyLoader } from "./AxzyLogo";
import ClientDetail from "./pages/ClientDetail";
import Clients from "./pages/Clients";
import Cobros from "./pages/Cobros";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Plans from "./pages/Plans";
import Products from "./pages/Products";

const NAV = [
  { id: "home", path: "/", label: "Inicio", icon: <LuLayoutDashboard size={16} /> },
  { id: "clients", path: "/clientes", label: "Clientes", icon: <LuUsers size={16} /> },
  { id: "payments", path: "/cobros", label: "Cobros", icon: <LuReceipt size={16} /> },
  { id: "products", path: "/productos", label: "Productos", icon: <LuBoxes size={16} /> },
  { id: "plans", path: "/planes", label: "Planes", icon: <LuTags size={16} /> },
];

const BRAND = import.meta.env.BASE_URL;

export default function App() {
  const [token, setToken] = useState(session.get());
  const [me, setMe] = useState<Me | null>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { resolvedTheme, setDarkModeMode } = useITTheme();
  const dark = resolvedTheme === "dark";

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
  if (!me) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--it-layout-bg)]">
        <AxzyLoader />
      </div>
    );
  }

  const toggleTheme = () => setDarkModeMode(dark ? "light" : "dark");

  const currentSection = NAV.find((item) => (item.path === "/" ? pathname === "/" : pathname.startsWith(item.path)));

  const navigationItems: ITNavigationItem[] = NAV.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    isActive: item.path === "/" ? pathname === "/" : pathname.startsWith(item.path),
    action: () => navigate(item.path),
  }));

  return (
    <ITLayout
      sidebarFullHeight
      contentClassName="max-w-screen! m-0! !px-2"
      topBar={{
        variant: "bento",
        logo: <img src={`${BRAND}brand/${dark ? "icon-white" : "icon-color"}.svg`} alt="axzydev" className="h-8 w-8" />,
        logoText: "Central",
        // El resto de la barra flotante se queda útil: sección actual + marca.
        centerContent: (
          <div className="flex items-center gap-2">
            <span className="axc-eyebrow text-axzy-slate dark:text-axzy-mist">Axzy Central</span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-axzy-mist" />
            <span className="text-sm font-semibold">{currentSection?.label ?? "Inicio"}</span>
          </div>
        ),
        userMenu: {
          userName: me.name,
          userEmail: me.username,
          menuItems: [
            { label: dark ? "Modo claro" : "Modo oscuro", onClick: toggleTheme },
            { label: "Cerrar sesión", onClick: logout },
          ],
        },
      }}
      sidebar={{
        variant: "bento",
        // Riel colapsado por defecto: se expande al pasar el cursor y deja el
        // mosaico con todo el ancho. La tarjeta del bento flota con `p-2`.
        isCollapsed: true,
        className: "p-2",
        navigationItems,
        profile: {
          name: me.name,
          detail: "Administrador",
          label: "Cambiar entre modo claro y oscuro",
          onClick: toggleTheme,
        },
      }}
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/clientes" element={<Clients />} />
        <Route path="/clientes/:id" element={<ClientDetail />} />
        <Route path="/cobros" element={<Cobros />} />
        <Route path="/productos" element={<Products />} />
        <Route path="/planes" element={<Plans />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ITLayout>
  );
}
