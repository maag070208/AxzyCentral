const BASE = import.meta.env.VITE_API_URL ?? "/api/v1";
const TOKEN_KEY = "axc_token";

export type Status = "ACTIVE" | "SUSPENDED";
export type PaymentStatus = "PENDING" | "PAID" | "CANCELLED";

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
  monthlyPrice: string;
  active: boolean;
  clients?: number;
}

export interface Payment {
  id: string;
  period: string;
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
  active: boolean;
  lastSeenAt: string | null;
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

export interface Me {
  id: string;
  username: string;
  name: string;
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
