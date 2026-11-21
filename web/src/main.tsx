import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { ITThemeProvider, type ITThemePalette } from "@axzydev/axzy_ui_system";
import "./index.css";
import App from "./App";
import { ToastProvider } from "./toast";

/**
 * Paleta de marca axzydev (axzydev-brand-kit): teal como acento, navy como tinta.
 * El shell del bento usa superficies claras y el acento va en píldoras, tiles y
 * botones. Los tonos de `layout`/`table` los adapta el provider al modo oscuro.
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
    sidebarText: "#1D2636",
    navbarBg: "#ffffff",
    navbarText: "#1D2636",
  },
  table: {
    headerBg: "#eef3f5",
    headerText: "#387d92",
    rowBg: "#ffffff",
    rowText: "#1d2636",
    rowHover: "#f1f6f8",
  },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ITThemeProvider theme={brand} appearance="bento" density={0.9} showFab={false}>
      <ToastProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </ToastProvider>
    </ITThemeProvider>
  </StrictMode>
);
