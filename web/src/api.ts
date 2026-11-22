const BASE = import.meta.env.VITE_API_URL ?? "/api/v1";
const TOKEN_KEY = "axc_token";

export type Status = "ACTIVE" | "SUSPENDED";
export type PaymentStatus = "PENDING" | "PAID" | "CANCELLED";

/** Forma de cobro de un plan y de un cobro (valor del enum del API). */
export type BillingType = "RECURRING" | "ONE_TIME";
export type PaymentKind = BillingType;

/** Clave del producto que consume la app de taquería; viaja dentro del QR. */
export const QR_PRODUCT = "TAQUERIA";

export interface Product {
  id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  clients?: number;
  plans?: number;
}

export interface Plan {
  id: string;
  productId: string;
  productName: string | null;
  name: string;
  /** Precio mensual si `billingType` es RECURRING; precio único si es ONE_TIME. */
  price: string;
  billingType: BillingType;
  active: boolean;
  clients?: number;
}

export interface Payment {
  id: string;
  kind: PaymentKind;
  /** `AAAA-MM` en recurrente; `null` en cobros únicos. */
  period: string | null;
  concept: string | null;
  amount: string;
  dueDate: string;
  status: PaymentStatus;
  paidAt: string | null;
  method: string | null;
  notes: string | null;
}

export interface Device {
  id: string;
  name: string;
  /** Modelo del equipo con el que se activó. */
  model: string | null;
  /** Versión de la app que reportó por última vez, p. ej. "1.1.0 (4)". */
  appVersion: string | null;
  active: boolean;
  lastSeenAt: string | null;
  /** Primera activación real desde la app. */
  activatedAt: string | null;
  createdAt: string;
}

export interface ClientSummary {
  id: string;
  name: string;
  product: Product;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: Status;
  plan: Plan | null;
  nextDueDate: string | null;
  overdue: boolean;
  devices: { total: number; active: number };
  lastSeenAt: string | null;
  createdAt: string;
}

export interface ClientDetail extends Omit<ClientSummary, "devices"> {
  payments: Payment[];
  devices: Device[];
}

/** Fila de la pantalla global de cobros (`GET /payments`). */
export interface PaymentRow {
  id: string;
  clientId: string;
  clientName: string;
  productName: string;
  planName: string | null;
  kind: PaymentKind;
  period: string | null;
  concept: string | null;
  amount: string;
  dueDate: string;
  status: PaymentStatus;
  paidAt: string | null;
  method: string | null;
}

export interface BillingRunCharge {
  clientId: string;
  clientName: string;
  period: string | null;
  dueDate: string;
  amount: string;
}

export interface BillingRun {
  created: number;
  skipped: number;
  charges: BillingRunCharge[];
}

export interface ApiConfig {
  apiUrl: string;
}

/** Respuesta de crear/rotar el código de un dispositivo. */
export interface IssuedDevice {
  device: Device;
  code: string;
}

export interface Me {
  id: string;
  username: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/* Usuarios y roles de clientes (contrato §3)                          */
/* ------------------------------------------------------------------ */

/** Rol del catálogo de un producto (`GET /roles?productId=`). */
export interface Role {
  id: string;
  key: string;
  name: string;
  /** Lista libre de permisos; la Central solo la muestra, no la edita. */
  permissions: unknown[];
  active: boolean;
}

/** Vista de un usuario de la app del cliente (`clientUserView` del contrato). */
export interface ClientUser {
  id: string;
  clientId: string;
  name: string;
  username: string;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Role[];
}

/** Respuesta del alta y del reset: la contraseña temporal solo viaja una vez. */
export interface CreatedClientUser {
  user: ClientUser;
  temporaryPassword: string;
}

export interface NewClientUserBody {
  name: string;
  /** Si se omite, el API lo genera con la convención del contrato §2. */
  username?: string;
  /** Keys de los roles del producto del cliente (mínimo uno). */
  roles: string[];
}

export interface ClientUserPatch {
  name?: string;
  username?: string;
  roles?: string[];
  active?: boolean;
}

export interface NewPaymentBody {
  kind: PaymentKind;
  /** Solo recurrente (`AAAA-MM`); en único se omite. */
  period?: string | null;
  amount: number;
  dueDate: string;
  concept?: string | null;
  notes?: string | null;
}

export interface GeneratePaymentBody {
  amount?: number;
  dueDate?: string;
  concept?: string;
}

export interface PlanBody {
  productId: string;
  name: string;
  billingType?: BillingType;
  price: number;
}

export interface PlanPatch {
  name?: string;
  billingType?: BillingType;
  price?: number;
  active?: boolean;
}

export interface PaymentPatch {
  status?: PaymentStatus;
  method?: string | null;
  concept?: string | null;
  amount?: number;
  dueDate?: string;
  notes?: string | null;
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export const session = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* sin almacenamiento: la sesión dura lo que la pestaña */
    }
  },
};

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = session.get();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "No hay conexión con el servidor");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login") onUnauthorized();
    throw new ApiError(res.status, data.code ?? "ERROR", data.message ?? "Algo salió mal");
  }
  return data as T;
}

/* ------------------------------------------------------------------ */
/* Endpoints del contrato §5                                           */
/* ------------------------------------------------------------------ */

const query = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");
  return entries.length ? `?${new URLSearchParams(entries as [string, string][]).toString()}` : "";
};

/** URL pública del API que viaja dentro del QR (`GET /config`). */
export const getConfig = () => api<ApiConfig>("GET", "/config");

/**
 * URL del API para el payload del QR: la de `GET /config` y, si el endpoint
 * todavía no existe, el mismo origen con el que habla la consola.
 */
export async function activationApiUrl(): Promise<string> {
  try {
    const { apiUrl } = await getConfig();
    if (apiUrl) return apiUrl.replace(/\/+$/, "");
  } catch {
    /* API vieja sin /config: seguimos con el origen local */
  }
  return new URL(BASE, window.location.origin).toString().replace(/\/+$/, "");
}

/** Payload compacto del QR (§6.1). `productKey` es el producto del cliente. */
export const qrPayload = (apiUrl: string, code: string, productKey: string = QR_PRODUCT) =>
  JSON.stringify({ v: 1, u: apiUrl.replace(/\/+$/, ""), c: code, p: productKey });

export const listPayments = (filters: { status?: PaymentStatus | ""; kind?: PaymentKind | ""; clientId?: string } = {}) =>
  api<PaymentRow[]>(
    "GET",
    `/payments${query({ status: filters.status || undefined, kind: filters.kind || undefined, clientId: filters.clientId })}`
  );

/** Genera cobros de todos los clientes activos con plan recurrente. */
export const runBilling = () => api<BillingRun>("POST", "/billing/run");

/** Genera el siguiente cobro del cliente según su plan. */
export const generatePayment = (clientId: string, body: GeneratePaymentBody = {}) =>
  api<ClientDetail>("POST", `/clients/${clientId}/payments/generate`, body);

export const createPayment = (clientId: string, body: NewPaymentBody) =>
  api<ClientDetail>("POST", `/clients/${clientId}/payments`, body);

export const updatePayment = (clientId: string, paymentId: string, patch: PaymentPatch) =>
  api<ClientDetail>("PATCH", `/clients/${clientId}/payments/${paymentId}`, patch);

/** Alta de un dispositivo con su código de activación (se muestra una vez). */
export const issueDevice = (clientId: string, name: string) =>
  api<IssuedDevice>("POST", `/clients/${clientId}/devices`, { name });

/** Rota el código de un dispositivo existente. */
export const rotateDeviceCode = (clientId: string, deviceId: string) =>
  api<IssuedDevice>("POST", `/clients/${clientId}/devices/${deviceId}/code`);

export const setDeviceActive = (clientId: string, deviceId: string, active: boolean) =>
  api("PATCH", `/clients/${clientId}/devices/${deviceId}`, { active });

/* ------------------------------------------------------------------ */
/* Usuarios y roles del cliente (contrato §4)                          */
/* ------------------------------------------------------------------ */

/** Catálogo de roles del producto; incluye activos e inactivos, ordenados por key. */
export const listRoles = (productId: string) => api<Role[]>("GET", `/roles${query({ productId })}`);

export const listClientUsers = (clientId: string) => api<ClientUser[]>("GET", `/clients/${clientId}/users`);

/** Alta con contraseña temporal; el API la devuelve una sola vez. */
export const createClientUser = (clientId: string, body: NewClientUserBody) =>
  api<CreatedClientUser>("POST", `/clients/${clientId}/users`, body);

export const updateClientUser = (clientId: string, userId: string, patch: ClientUserPatch) =>
  api<ClientUser>("PATCH", `/clients/${clientId}/users/${userId}`, patch);

/** Genera una nueva temporal y vuelve a marcar `mustChangePassword`. */
export const resetClientUserPassword = (clientId: string, userId: string) =>
  api<CreatedClientUser>("POST", `/clients/${clientId}/users/${userId}/password`);

/** Traduce los errores del contrato de usuarios a un texto útil para la consola. */
export function clientUserError(e: unknown): string {
  if (e instanceof ApiError) {
    const map: Record<string, string> = {
      USERNAME_TAKEN: "Ese usuario ya existe en este cliente. Prueba con otro nombre de usuario.",
      CLIENT_NOT_FOUND: "El cliente ya no existe. Recarga la página.",
      USER_NOT_FOUND: "El usuario ya no existe. Actualiza la lista.",
    };
    if (map[e.code]) return map[e.code];
    if (e.code === "NETWORK") return e.message;
    if (e.status === 400) return e.message || "Revisa los datos del usuario.";
    return e.message || "No se pudo guardar el usuario.";
  }
  return e instanceof Error ? e.message : "No se pudo guardar el usuario.";
}

/* ------------------------------------------------------------------ */
/* Formato compartido                                                  */
/* ------------------------------------------------------------------ */

export const money = (value: string | number) =>
  Number(value).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export const today = () => new Date().toISOString().slice(0, 10);

export const dateText = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const agoText = (iso: string | null) => {
  if (!iso) return "Nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "Hace un momento";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Hace ${h} h`;
  return `Hace ${Math.round(h / 24)} días`;
};

/** `AAAA-MM` → «nov 2026». */
export const periodText = (period: string | null) =>
  period ? new Date(`${period}-01T12:00:00`).toLocaleDateString("es-MX", { month: "short", year: "numeric" }) : "Sin periodo";

export const billingTypeLabel = (type: BillingType) => (type === "ONE_TIME" ? "Pago único" : "Recurrente");

/** «Mensual» / «Único»: etiqueta corta para píldoras y tablas. */
export const billingTypeShort = (type: BillingType) => (type === "ONE_TIME" ? "Único" : "Mensual");

/** Precio con su sufijo según el tipo de cobro. */
export const planPrice = (plan: Pick<Plan, "price" | "billingType">) =>
  `${money(plan.price)}${plan.billingType === "RECURRING" ? " /mes" : ""}`;

/** Precio ya formateado para una tarjeta o tabla. */
export const priceWithSuffix = (price: string | number, type: BillingType) =>
  `${money(price)}${type === "RECURRING" ? " /mes" : " único"}`;

/** Texto principal de un cobro: su concepto o, si falta, el periodo. */
export const paymentConcept = (payment: Pick<Payment, "kind" | "concept" | "period">) =>
  payment.concept?.trim() ||
  (payment.kind === "ONE_TIME" ? "Pago único" : payment.period ? periodText(payment.period) : "Sin periodo");
