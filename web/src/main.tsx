import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { ITThemeProvider, type ITThemePalette } from "@axzydev/axzy_ui_system";
import "./index.css";
import App from "./App";
import { ToastProvider } from "./toast";

/** Paleta de marca axzydev (axzydev-brand-kit): teal como acento, navy como tinta. */
const brand: Partial<ITThemePalette> = {
  primary: "#387D92",
  secondary: "#1D2636",
  ternary: "#E8F3F6",
  info: "#4598B1",
  success: "#16A34A",
  warning: "#D97706",
  alert: "#EA580C",
  danger: "#DC2626",
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ITThemeProvider theme={brand} appearance="flat" radius={10} shadow={1} showFab={false}>
      <ToastProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </ToastProvider>
    </ITThemeProvider>
  </StrictMode>
);
