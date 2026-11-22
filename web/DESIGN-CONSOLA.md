# Consola Axzy Central — guía de rediseño (nov 2026)

Rediseño para que la consola se sienta como la consola de **CheckApp/Barcelona**:
contenido a todo lo ancho, tipografía grande, tarjetas blancas con borde suave,
tablas con acciones en la fila y flujos directos. El shell (sidebar expandido,
topbar, canvas claro) y los primitivos ya están hechos por el Lead.

## Reglas

- **No tocar** `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/ui.tsx`,
  `src/components/QuickPayDialog.tsx`, `src/api.ts`: son del Lead. Si necesitas un
  primitivo nuevo, pídelo al Lead por mensaje.
- Usa los primitivos de `src/ui.tsx`:
  - `Page` (header con `eyebrow`, `title`, `description`, `actions`, `back`, `loading`, `error`, `onRetry`).
  - `Card` (título, subtítulo, acciones y cuerpo).
  - `StatCard` (label, value grande, hint, icon, tone, onClick, active).
  - `Th`, `Td`, `TableWrap`, `IconAction`, `Initials`, `SectionTitle`, `Empty`, `Muted`.
  - `StatusBadge`, `PaymentBadge`, `KindBadge`, `BillingTypeBadge`, `CountUp`, `CountUpMoney`, `paymentError` de `src/shared.tsx`.
  - `QuickPayDialog` de `src/components/QuickPayDialog.tsx` (cobro rápido).
- Nada de componentes bento (`ITBento*`, `ITPage`, `ITCard`, `ITTable`) en este rediseño.
  Usa Tailwind + componentes del UI System (`ITButton`, `ITInput`, `ITSelect`,
  `ITSegmentedControl`, `ITDialog`, `ITConfirmDialog`, `ITBadget`, `ITAlert`, `ITText`).
- Textos en español, tono directo. Sin dependencias nuevas.
- Modo oscuro: agrega `dark:` cuando uses colores propios.
- Tablas: `TableWrap` + `table` con `className="axc-table w-full"`; filas
  `border-b border-slate-100 last:border-0 dark:border-slate-800`, click en la fila
  para abrir el detalle y `stopPropagation` en los botones de acción.
- En móvil (`< lg`) la tabla se oculta (`hidden lg:block`) y se pinta una lista de
  tarjetas con lo esencial y las mismas acciones.
- Escala: títulos de página ya vienen en `Page`; dentro de contenido usa 14–15px de
  cuerpo, valores 24–32px, KPIs 30–32px. Nada de texto 9–10px salvo eyebrows.
- Deja corriendo el servidor de desarrollo del Lead (`:5100`) y el API local (`:4100`).
  **No toques Railway ni bases de datos.** No inicies otro Vite en `:5100`.

## Referencia visual (Barcelona)

Consola de CheckApp: sidebar blanco expandido con items grandes; topbar blanco;
lienzo gris muy claro; páginas con título grande y acciones a la derecha; fila de
KPIs en tarjetas blancas; debajo una tarjeta grande con tabla full-width y, a la
derecha, paneles de resumen/acciones; chips de estado de color; acciones pequeñas
al final de cada fila. El objetivo es que **se vea lleno y usable**, no una columna
angosta con aire a los lados.
