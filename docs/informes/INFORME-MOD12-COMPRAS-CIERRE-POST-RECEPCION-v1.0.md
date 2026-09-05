# INFORME — MOD12 · Cierre de compras tras la recepción (v1.0)

- **Fecha:** 2026-09-04
- **Módulo:** MOD12 Inventario / SCM — slice Compras y Salidas
- **Tipo:** corrección de defecto reportado en uso real
- **Estado:** implementado y verificado; sin commit

## 1. Defecto reportado

Tras completar el ciclo de compra en `/dashboard/inventory?tab=purchasing` (solicitud →
cotización → aprobación → orden → recepción de mercancía), el dashboard seguía mostrando
KPI «Por recibir» = 1 y Estado = «Convertida en orden de compra». El usuario esperaba ver la
mercancía cerrada, en existencia y disponible para salidas.

## 2. Estado real verificado (BD dev, schema `tenant_iwana`)

| Entidad | Valor |
| --- | --- |
| PR-000001 | `CONVERTED_TO_PO` |
| PO-000001 | `CLOSED` |
| GR-000001 | `COMPLETED` |
| MOV-000002 | origen `PURCHASE_RECEIPT`, contexto `purchasing.receipt` |
| `stock_balances` | 50.00 on hand / 0.00 reservado — Router Onu Gpon, Bodega Principal, lote `04092026` |

La mercancía sí entró a inventario: el movimiento se registró y el costeo se aplicó. El defecto
estaba en cómo el dashboard leía ese hecho, y en cómo el compositor de salidas resumía el saldo.

## 3. Causas raíz

1. **Sin eje de abastecimiento.** `PurchaseRequestStatus` termina en `CONVERTED_TO_PO`;
   `goods-receipt.service.ts` avanza la orden a `FULLY_RECEIVED` y las líneas de la solicitud a
   `RECEIVED`, pero la solicitud queda congelada. La columna Estado pintaba el enum crudo.
2. **KPI calculado en cliente.** `PurchaseWorkspaceSummary.countMetric` contaba
   `status === CONVERTED_TO_PO`. El servidor sí resolvía bien el preset «Por recibir» (`EXISTS`
   sobre órdenes `APPROVED`/`PARTIALLY_RECEIVED`), pero esa lógica solo se aplicaba al filtrar.
3. **Disponibilidad agregada por tupla exacta.** La recepción de compra crea siempre un
   `StockLot`, y `buildAvailableQuantityByItemAtLocation` sumaba solo balances sin lote. Todo lo
   recibido por compra aparecía con disponible 0 y se filtraba fuera de las sugerencias de salida.

## 4. Cambios

**Contrato compartido**

- `packages/shared/…/purchase-request-fulfillment-status.enum.ts` — enum derivado
  `NOT_ORDERED | PENDING_RECEIPT | PARTIALLY_RECEIVED | RECEIVED`. No se persiste: **sin migración
  y sin ampliar `purchase_request_status`.**

**API**

- `utils/purchase-request-fulfillment.ts` — resolutor puro; ignora órdenes `CANCELLED`,
  `PARTIALLY_RECEIVED` gana, luego `APPROVED` → `PENDING_RECEIPT`, luego
  `FULLY_RECEIVED`/`CLOSED` → `RECEIVED`, resto `NOT_ORDERED`. Alineado por construcción con el
  `EXISTS` del preset y con `getPurchaseNextAction` del portal.
- `purchasing-query.service.ts` — `listRequests` enriquece la página con una única consulta
  agregada (`GROUP BY purchase_request_id, status`, acotada a tenant y a los ids de la página, sin
  N+1); `getRequestDetail` deriva el campo de las órdenes que ya carga. Swagger documentado.

**Portal**

- `purchase-filters.ts` — `resolvePurchaseRequestFulfillmentStatus` (con degradación explícita si
  el API aún no emite el campo), `isPurchaseRequestPendingReceipt`, `isPurchaseRequestFullyReceived`.
- `inventory-labels.ts` — `getPurchaseRequestDisplayStatus`: punto único que combina estado
  administrativo y abastecimiento; «Recibida y cerrada» con badge `success`.
- KPI y celda de Estado consumen ese eje; listado y workbench comparten el mismo helper.
- Salidas: `buildTotalAvailableQuantityByItemAtLocation` (suma todos los lotes más el saldo sin
  lote) para las vistas de resumen, y preselección de lote cuando hay exactamente uno.
  `getBalanceForItemAtLocation` y `getAvailableQtyForDraftLine` **no** se tocaron: siguen
  replicando la validación del backend por tupla exacta.

**E2E**

- `portal-inventory-scm.spec.ts` — mocks fieles al ciclo real (emitir orden → `PENDING_RECEIPT`;
  recepción completa → orden `FULLY_RECEIVED` y solicitud `RECEIVED`, con `status` quieto en
  `CONVERTED_TO_PO`) y caso nuevo que separa mercancía recibida de mercancía en tránsito.

## 5. Evidencia de verificación

| Suite | Resultado |
| --- | --- |
| `jest` API — helper + filtros KPI | 2 suites, **30 tests** verdes |
| `jest` API — módulo inventory | 59 suites, **517 tests** verdes (8 skipped) |
| `jest` portal — `src/components/inventory` | 73 suites, **457 tests** verdes (1 skip preexistente) |
| Playwright — `portal-inventory-scm.spec.ts` | **41/42**; el caso nuevo pasa |
| `tsc --noEmit` API y portal | exit 0 |

Todo ejecutado con jest y Playwright directos, sin caché de turbo y sin `--passWithNoTests`.

## 6. Hallazgos abiertos

1. **Fallo E2E preexistente e intermitente** en el grupo «Activos» (`ficha 360`, `vida útil`,
   `instala vía OT`): rotan entre corridas por el selector `button "Activos"`. Reproducido igual
   sobre la versión de `HEAD`, luego es ajeno a este cambio.
2. **`playwright.portal.local.config.ts` no funciona en Windows**: usa la sintaxis POSIX
   `IWANA_DISABLE_CACHE_COMPONENTS=1 pnpm …`, que `cmd.exe` no interpreta.
3. **Autolote en la recepción de compra** (`goods-receipt.service.ts`): se crea un `StockLot`
   incluso para ítems sin trazabilidad por lote. La corrección de presentación ya evita el efecto
   visible, pero conviene decidir en backend si ese autolote es intencional.
4. El dev server del portal escucha solo en `::1`, no en `127.0.0.1`, así que Playwright no reusa
   el servidor existente y arranca el suyo.
