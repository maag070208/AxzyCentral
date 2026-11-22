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

## 6. Respaldo de la cocina: `PUT /api/v1/backup` y `GET /api/v1/backup` (app)

El teléfono de cocina es la única copia de las cuentas abiertas y del menú. Para que no se pierdan si el teléfono se rompe, la app (Tacomanda ≥ 1.2.0) sube su estado completo.

- **Autenticación:** el código del dispositivo como `Authorization: Bearer axc_…`, igual que `/sales`. Un dispositivo revocado recibe `401`.
- **`PUT /backup`:**
  - Cuerpo: `{ "appVersion": "1.2.0 (5)", "savedAt": "2026-11-22T10:00:00-06:00", "state": { …AppState… } }`, de máximo 2 MB. Si pasa, responde `413 PAYLOAD_TOO_LARGE`.
  - Se guarda **uno por dispositivo** (tabla `backups`, llave `deviceId`) y cada envío lo reemplaza. Así, varias cocinas independientes del mismo cliente no se pisan.
  - Si llega uno con `savedAt` más viejo que el guardado, se ignora y responde `{ "saved": false }`. Así un teléfono viejo no pisa al nuevo.
  - La app revisa cada minuto y solo sube si el estado cambió. Tras un error espera 5 minutos.
- **`GET /backup`:**
  - Cualquier dispositivo activo del mismo cliente descarga `{ backups: [{ deviceId, deviceName, fromThisDevice, savedAt, appVersion, state }] }`, del más reciente al más viejo.
  - Incluye los de teléfonos revocados, porque el perdido es justo el que se quiere recuperar.
  - Si no hay respaldo, responde `404 NO_BACKUP`.
- **En la app:**
  - Admin → "Respaldo en la Central" muestra qué trae el respaldo y qué tiene el teléfono.
  - "Recuperar" reemplaza el estado y aparta lo anterior en `taqueria.json.antes-de-respaldo-<hora>`.
  - Las cuentas cerradas no van aquí: ya están en `/sales`.

## 7. Límites del plan, aviso de actualización y fallas

### Límites del plan

- `plans.maxKitchens` y `plans.maxWaiters` dicen cuántos incluye el plan. `null` es ilimitado, y un cliente sin plan también es ilimitado.
- **Cocinas (lo hace cumplir la Central):**
  - Si el cliente ya tiene `maxKitchens` dispositivos activos, crear otro dispositivo, reactivarlo o darle un código nuevo a uno revocado responde `409 PLAN_LIMIT`.
  - Bajar de plan no revoca teléfonos que ya estaban activos.
- **Pantallas de cocina extra (lo hace cumplir la cocina principal):**
  - Se conectan a la principal como las meseras, con `hello.screen = true`.
  - Se aceptan hasta `kitchens - 1` a la vez, y no pueden cambiar nada.
- **Meseras (lo hace cumplir la cocina):**
  - `GET /license` y `POST /activate` traen `limits: { kitchens, waiters }`.
  - Al conectarse, la mesera manda `hello` con un id fijo de su teléfono.
  - La cocina rechaza a la que excede `waiters` con un mensaje claro y suelta la conexión vieja del mismo teléfono.
  - Una app de mesera sin `hello` no se atiende si el plan tiene límite.

### Aviso de actualización

- **Consola:** en Productos, "Publicar versión" guarda `latestVersionCode`, `latestVersionName`, `latestUrl` y `latestNotes`.
- **Licencia:** `GET /license` trae `latestApp: { versionCode, versionName, url, notes }`, o `null`.
- **App:**
  - La cocina muestra el aviso si su `versionCode` es menor; al tocarlo abre el enlace.
  - Se lo pasa a las meseras en cada estado (`ServerMsg.State.latestApp`).

### Fallas

- **`POST /api/v1/app-errors`** (código del dispositivo como Bearer):
  - Cuerpo: `{ errors: [{ id, source: "cocina"|"mesero", appVersion, model, occurredAt, message, stack }] }`, máximo 20.
  - No duplica por `(dispositivo, id)`.
- **App:**
  - Guarda cada cierre inesperado en `files/fallas/`.
  - La mesera se los manda a la cocina al conectar (`appErrors`).
  - La cocina sube todo cada 5 minutos.
- **Consola:**
  - `GET /clients/:id/app-errors` alimenta la tarjeta "Fallas de la app" del detalle del cliente.
  - `GET /app-errors/recent?days=7` alimenta el aviso "La app se cerró sola" en Inicio.

## 8. Reporte mensual (consola)

`/#/reporte?cliente=…&mes=AAAA-MM` es una hoja carta para mandarle al cliente. Por defecto es el mes pasado y se abre desde Métricas con "Reporte mensual para el cliente".
- **Contenido:**
  - Indicadores contra el mes anterior completo.
  - "Lo que dicen los números".
  - Ventas por día, hora pico y día de la semana.
  - Productos más vendidos, cómo pagan, cocina y categorías.
- **Formato:**
  - Siempre en claro.
  - "Imprimir o guardar PDF" usa la impresión del navegador.
  - Los controles no salen en la hoja.
