import { ITBadget, useITBentoCountUp } from "@axzydev/axzy_ui_system";
import { ApiError, money, today, type BillingType, type PaymentKind, type PaymentStatus, type Status } from "./api";

export const errorOf = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal");

/** Fecha local `AAAA-MM-DD` (sin corrimiento por zona horaria). */
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const StatusBadge = ({ status }: { status: Status }) =>
  status === "ACTIVE" ? <ITBadget color="success" label="Activo" size="sm" /> : <ITBadget color="danger" label="Suspendido" size="sm" />;

/** Tipo de cobro de un plan: recurrente (mensual) o único. */
export const BillingTypeBadge = ({ type }: { type: BillingType }) =>
  type === "ONE_TIME" ? (
    <ITBadget color="purple" label="Pago único" size="sm" variant="outlined" />
  ) : (
    <ITBadget color="info" label="Recurrente" size="sm" variant="outlined" />
  );

/** Tipo de un cobro, en versión corta para tablas densas. */
export const KindBadge = ({ kind }: { kind: PaymentKind }) =>
  kind === "ONE_TIME" ? (
    <ITBadget color="purple" label="Único" size="sm" variant="outlined" />
  ) : (
    <ITBadget color="info" label="Recurrente" size="sm" variant="outlined" />
  );

/** Estado de un cobro; un pendiente cuya fecha ya pasó se marca como vencido. */
export const PaymentBadge = ({ status, dueDate }: { status: PaymentStatus; dueDate: string }) => {
  if (status === "PAID") return <ITBadget color="success" label="Pagado" size="sm" />;
  if (status === "CANCELLED") return <ITBadget color="gray" label="Cancelado" size="sm" />;
  return dueDate < today() ? <ITBadget color="danger" label="Vencido" size="sm" /> : <ITBadget color="warning" label="Pendiente" size="sm" />;
};

/** Traduce los códigos de error del contrato de cobros a un texto útil. */
export function paymentError(e: unknown): string {
  if (e instanceof ApiError) {
    const map: Record<string, string> = {
      PLAN_REQUIRED: "El cliente no tiene plan. Asígnale uno antes de generar el cobro.",
      ALREADY_CHARGED: "Este plan de pago único ya tiene su cobro registrado.",
      CHARGE_PENDING: "Ya hay un cobro pendiente. Márcalo como pagado o cancélalo antes de generar otro.",
      PAYMENT_PERIOD_EXISTS: "Ya existe un cobro para ese periodo. Revisa la tabla antes de volver a crearlo.",
      INVALID_DEVICE_CODE: "El código de activación no es válido o ya fue revocado.",
    };
    if (map[e.code]) return map[e.code];
  }
  return errorOf(e);
}

/** Número grande del bento que sube de 0 al valor al montar. */
export function CountUp({
  value,
  decimals = 0,
  format = (n) => Math.round(n).toLocaleString("es-MX"),
}: {
  value: number;
  decimals?: number;
  format?: (n: number) => string;
}) {
  const shown = useITBentoCountUp(value, 1200, decimals);
  return <>{format(shown)}</>;
}

/** Contador animado en pesos. */
export const CountUpMoney = ({ value }: { value: number }) => <CountUp value={value} decimals={2} format={money} />;

/** Etiqueta mono en mayúsculas (lenguaje del UI System para metadatos). */
export const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="axc-eyebrow text-axzy-slate dark:text-axzy-mist">{children}</p>
);

/** Encabezado de sección del bento: eyebrow opcional + título + acción a la derecha. */
export function SectionTitle({
  id,
  eyebrow,
  title,
  description,
  action,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 id={id} className="mt-0.5 text-xl font-bold tracking-tight md:text-2xl">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-axzy-slate dark:text-axzy-mist">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
