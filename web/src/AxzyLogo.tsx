// Adaptado de axzydev-brand-kit/code/AxzyLogo.tsx. Las animaciones viven en /public/lottie.
import { useEffect, useRef, useState } from "react";
import lottie, { type AnimationItem } from "lottie-web";

type Variant = "logo" | "icon" | "loader";
type Theme = "light" | "dark";

const BASE = `${import.meta.env.BASE_URL}lottie/`;
const FILES: Record<string, string> = {
  "logo-light": "axzydev-logo-intro-light.json",
  "logo-dark": "axzydev-logo-intro-dark.json",
  icon: "axzydev-icon-intro.json",
  "icon-white": "axzydev-icon-intro-white.json",
  loader: "axzydev-icon-loop.json",
};

const readTheme = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");

/** Sigue el modo claro/oscuro del provider (clase `.dark` en `<html>`). */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(readTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

interface Props {
  variant?: Variant;
  /** Solo para `icon`: blanco sobre fondos oscuros o de color. */
  white?: boolean;
  /** Fuerza la versión para fondo oscuro aunque la página esté en modo claro. */
  onDark?: boolean;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function AxzyLogo({ variant = "logo", white = false, onDark = false, label = "axzydev", className, style }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pageTheme = useTheme();
  const theme = onDark ? "dark" : pageTheme;
  const key = variant === "logo" ? `logo-${theme}` : variant === "icon" && white ? "icon-white" : variant;

  useEffect(() => {
    if (!ref.current) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const anim: AnimationItem = lottie.loadAnimation({
      container: ref.current,
      renderer: "svg",
      loop: variant === "loader",
      autoplay: !reduce,
      path: BASE + FILES[key],
    });
    if (reduce) anim.addEventListener("DOMLoaded", () => anim.goToAndStop(anim.totalFrames - 1, true));
    return () => anim.destroy();
  }, [key, variant]);

  return <div ref={ref} role="img" aria-label={label} className={className} style={style} />;
}

/** Pantalla o bloque de carga con la llama en bucle. */
export function AxzyLoader({ label = "Cargando" }: { label?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2" role="status" aria-live="polite">
      <AxzyLogo variant="loader" label={label} style={{ width: 72 }} />
      <span className="sr-only">{label}</span>
    </div>
  );
}
