# Contrato: ventas que reporta la app y métricas

La app de cocina (Tacomanda ≥ 1.1.0) sube a la Central las cuentas que ya cerró. Con eso la consola calcula métricas por cliente.

## 1. `POST /api/v1/sales` (app)

- **Autenticación:** el código del dispositivo como `Authorization: Bearer axc_…`, el mismo de `GET /license`.
- **Errores:** si el código no existe o está revocado responde `401 INVALID_DEVICE_CODE`. Si el cuerpo no es válido responde `400 VALIDATION_ERROR`.
- **Cliente suspendido:** las ventas se aceptan igual.

```json
{
  "appVersion": "1.1.0 (4)",
  "tickets": [
    {
      "id": "uuid-de-la-cuenta",
      "table": "3",
      "accountNumber": 1,
      "openedAt": "2026-11-21T21:30-06:00",
      "closedAt": "2026-11-21T22:05-06:00",
      "utcOffsetMin": -360,
      "cancelled": false,
      "totalCents": 25000,
      "cashCents": 20000,
      "transferCents": 5000,
      "persons": 2,
      "prepSeconds": 300,
      "lines": [
        { "productId": "asada", "name": "Taco Asada", "variant": "Harina", "category": "Tacos", "qty": 3, "unitCents": 4000 }
      ]
    }
  ]
}
```

**Respuesta:** `200 { "received": n }`.

**Lote:**
- Máximo 100 cuentas por lote; la app manda 20.
- El cuerpo pesa máximo 100 kB.

**Contenido de cada cuenta:**
- Solo cuentas archivadas, es decir, cerradas y ya sin deshacer.
- `totalCents` no incluye las órdenes canceladas.
- Los cobros anulados no se cuentan. Las devoluciones restan del método con que se hicieron.
- `prepSeconds` es el promedio de tiempo de cocina, desde que llega la orden hasta que se entrega. No incluye lo que se entregó al cobrar.

**Duplicados:** la clave es `(dispositivo, id)`. Si la app reenvía una cuenta, se reemplaza junto con sus líneas y no se duplica.

**Versión del dispositivo:** se guarda en `devices.appVersion`. `GET /license` también la actualiza con el encabezado `X-App-Version`.

## 2. `GET /api/v1/clients/:id/sales/metrics?from=AAAA-MM-DD&to=AAAA-MM-DD` (consola)

- **Rango:** fechas locales del negocio, inclusivas, de máximo 400 días. Cada venta trae su `utcOffsetMin`, así que las horas y los días salen en la hora del local.
- **Respuesta:** `SalesMetrics` (`api/src/lib/sales-metrics.ts`):
  - Totales: tickets, canceladas, vendido, efectivo y transferencia.
  - Promedios: ticket promedio, gasto por comensal, personas por mesa y piezas por cuenta.
  - Tiempo de cocina: promedio y p90.
  - Ventas por hora (24), por día de la semana (lunes a domingo) y por día.
  - Ranking de productos y categorías, con su participación en lo vendido.

## 3. `GET /api/v1/sales-overview?from&to` (consola)

Muestra todos los clientes juntos en el periodo, comparados contra el mismo número de días justo antes. Incluye:
- Vendido.
- Cuentas.
- Ventas por día.
- Ranking de clientes, con su ticket promedio y su última venta.

Lo usa Inicio en la tarjeta "Ventas de tus clientes" y en el aviso "Sin reportar ventas en 3+ días".

## 4. Consola

- **Métricas** (`/#/metricas?cliente=…&periodo=7d|30d|month|lastMonth`):
  - Indicadores con su cambio contra el periodo anterior.
  - "Lo que dicen los números": frases listas para mandarle al cliente.
  - Ventas por día, hora pico y día de la semana.
  - Cómo pagan.
  - Tiempo de cocina y cancelaciones.
  - Productos y categorías.
- Las gráficas son propias (`web/src/components/SalesCharts.tsx`) y no usan librería. Cada una trae su tabla para lectores de pantalla.

## 5. En la app

`SalesSync` (`Taqueria/app/.../SalesSync.kt`) funciona así:
- Revisa cada minuto si hay cuentas archivadas nuevas.
- Sube solo las nuevas y recuerda cuántas lleva.
- Si falla, reintenta a los 10 minutos.
- Sin internet no afecta nada de la operación.
