import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { ITThemeProvider, type ITThemePalette } from "@axzydev/axzy_ui_system";
import "./index.css";
import App from "./App";
import { ToastProvider } from "./toast";

/**
 * Paleta de marca axzydev (axzydev-brand-kit): teal como acento, navy como tinta.
 * El shell usa el lenguaje plano de la consola de CheckApp/Barcelona: lienzo
 * claro, sidebar blanco, tarjetas con borde suave y acentos en los iconos.
 */
const brand: Partial<ITThemePalette> = {
  primary: "#387D92",
  secondary: "#1D2636",
  ternary: "#E8F3F6",
  info: "#4598B1",
  success: "#16A34A",
  warning: "#D97706",
  alert: "#EA580C",
  danger: "#DC2626",
  layout: {
    sidebarBg: "#ffffff",
    sidebarText: "#334155",
    navbarBg: "#ffffff",
    navbarText: "#1D2636",
  },
  table: {
    headerBg: "#f8fafc",
    headerText: "#64748b",
    rowBg: "#ffffff",
    rowText: "#1d2636",
    rowHover: "#f4f7f9",
  },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ITThemeProvider theme={brand} appearance="flat" density={1} radius={16} shadow={1} showFab={false}>
      <ToastProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </ToastProvider>
    </ITThemeProvider>
  </StrictMode>,
);
