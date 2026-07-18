# PRD - MOD12 Inventario / Submódulo Existencias (stock)

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-07-18
**Modo activo:** Product Architect + Orchestrator
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO (2026-07-18, aprobación registrada en sesión de definición)
**Clasificacion:** Confidencial - Uso interno
**PRD padre:** docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md
**ADR relacionado:** docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md (no se requiere ADR nuevo — ver sección 9)
**Prompt de ejecución Fase 1:** docs/prompts/PROMPT-MOD12-EXISTENCIAS-KARDEX-AJUSTES-FASE-01-v1.0.md
**Informe vivo:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-DEFINICION-v1.0.md

---

## 1. Contexto y motivacion

MOD12 ya tiene operativos los submódulos de Catálogo, Bodegas, Proveedores y Compras (solicitud → RFQ → cotización → adjudicación → orden → recepción en bodega). La auditoría de definición (2026-07-18) confirmó que el backend de stock existe casi completo y sigue el patrón de referencia de la industria (Odoo, ERPNext):

- Ledger inmutable de movimientos: `StockMovement` + `StockMovementLine` (numeración MOV-######, idempotencia, reversos, costo unitario por línea).
- Agregado de saldos: `StockBalance` por ítem × bodega × lote × condición (`quantityOnHand`, `quantityReserved`), que solo muta vía `StockLedgerService.recordMovementWithManager` → `StockBalanceService.applyDeltaWithManager` (bloquea saldos negativos).
- Operaciones que ya escriben al ledger: recepción de OC, compra de mostrador, transferencias, salidas formales (stock issues), ventas, consumo interno, retornos y bajas.

La brecha no es de modelo sino de **consulta y operación**: el tenant no tiene un submódulo "Existencias" de primer nivel donde ver su stock, el kardex no se puede consultar (los movimientos solo se escriben), y los ajustes de inventario están modelados en el enum (`StockMovementOrigin.ADJUSTMENT`) pero sin servicio, endpoint ni UI. Este PRD define el submódulo Existencias y su roadmap completo en cuatro fases.

### Vacíos confirmados en la auditoría

| Vacío | Evidencia |
| --- | --- |
| Kardex consultable (`GET /inventory/movements`) | No existe; solo POST de movimientos |
| Ajustes de inventario | `ADJUSTMENT` en `packages/shared/src/enums/inventory/stock-movement-origin.enum.ts` sin emisor |
| Vista Existencias de primer nivel en portal | El stock solo se ve como matriz dentro de la pestaña Bodegas |
| Conteos físicos / inventario cíclico | No modelado |
| Reservas efectivas | `quantityReserved` siempre 0, sin lógica |
| Costeo y valoración | Solo se persiste `unitCost` por movimiento; no se actualiza `lastPurchaseCost` ni se valoriza inventario |
| Reorden → compra | `reorderPoint` existe en el ítem maestro pero no dispara nada |

## 2. Alcance

### Roadmap del submódulo (todas las fases)

| Fase | Alcance | Estado |
| --- | --- | --- |
| **Fase 1 — Kardex, ajustes y vista Existencias** | `GET /inventory/movements` (+ detalle), `POST /inventory/adjustments`, pestaña Existencias con subvistas Por producto / Por bodega / Kardex, drawer de detalle por ítem, diálogo de ajuste; pestaña Bodegas reducida a gestión de bodegas | Aprobada para ejecución |
| **Fase 2 — Reorden y valor básico** | Ítems bajo `reorderPoint` → generación de solicitud de compra prellenada (conexión con purchasing existente); indicadores básicos de valor de inventario | **Cerrada** — G7 GO confirmado CTO 2026-07-18 (`33cd6ecd`) |
| **Fase 3A — Conteo físico / inventario cíclico** | Documento de conteo (congelar esperado, contar, ver diferencias → cierre que reconcilia el saldo contra lo contado vía ledger). Aditivo, no toca rutas existentes. Ver [ADR-054](../adrs/ADR-054-Conteo-Fisico-Inventario-Ciclico.md) y [spec 3A](../specs/2026-07-18-mod12-existencias-conteo-fisico-fase03A-design.md) | **Ejecutable** — ADR-054 aprobado CTO 2026-07-18 + G7 F2 cerrado |
| **Fase 3B — Reservas efectivas** | Activar `quantityReserved` en el ciclo de salidas; migrar validaciones de disponible (`onHand → onHand − reserved`) en despacho/transferencia y el guardado anti-negativo. Toca rutas críticas → requiere su propio ADR | Planificada — se define al cierre de 3A (ADR-016) |
| **Fase 4 — Costeo y valoración** | Costo promedio móvil (actualizar `lastPurchaseCost` y costo promedio en recepción, costear salidas), valoración de inventario y reportes | Planificada |

**Split de Fase 3 (decisión CTO 2026-07-18):** la verificación de factibilidad mostró asimetría de riesgo — conteos aditivo/limpio vs. reservas que modifican el guardado anti-negativo del despacho (riesgo de sobre-venta). Se dividió en 3A (conteos, esta definición) y 3B (reservas, gate propio con ADR propio).

### En scope Fase 1

- Endpoint paginado de consulta del kardex con filtros (ítem, bodega, origen, rango de fechas, número de movimiento) y detalle por movimiento con líneas enriquecidas (ítem, bodega, lote).
- Ajuste manual de inventario con razón tipificada, nota, idempotencia y bloqueo para ítems serializados.
- Nueva pestaña "Existencias" (grupo Operación) en `/dashboard/inventory` que absorbe la matriz bodega × producto y añade la vista agregada por producto y el kardex.
- Pestaña "Bodegas" reducida a gestión de bodegas (crear/editar, capacidad, responsables).
- Redirect de compatibilidad para deep-links existentes (`tab=locations&custody=mobile` → `tab=stock&custody=mobile`).

### Fuera de scope Fase 1

- Conteos físicos, reservas, costeo, valoración y reorden automático (Fases 2-4).
- Ajustes sobre ítems serializados (se opera vía retorno/baja/refurbish existentes).
- Cambios de modelo de datos o migraciones (no se requieren — ver anexo B, decisión D1).
- Reportes exportables y app móvil.

## 3. Personas y casos de uso

| Persona | Rol | Caso de uso principal |
| --- | --- | --- |
| Gerente / administrador | ADMIN | Ver existencias consolidadas, auditar el kardex, registrar ajustes con razón |
| Responsable de bodega | ADMIN / NOC | Consultar saldos por bodega/lote/condición, detectar ítems bajo mínimo |
| Soporte / NOC | NOC / SUPPORT | Rastrear un movimiento (¿por qué cambió este saldo?) desde el kardex |
| Responsable de compras | Compras | (Fase 2) Recibir sugerencia de reposición desde ítems bajo punto de reorden |

## 4. Requisitos funcionales (Fase 1)

- RF-01: Listar movimientos de stock paginados (`page`/`limit` ≤ 100), ordenados por fecha descendente, con filtros por ítem, bodega, origen, rango de fechas y búsqueda por número de movimiento.
- RF-02: Ver el detalle de un movimiento con sus líneas enriquecidas: nombre/SKU del ítem, nombre/código de la bodega, número de lote, cantidad con signo, costo unitario.
- RF-03: Registrar un ajuste manual (delta positivo o negativo ≠ 0) sobre un ítem no serializado en una bodega, con razón tipificada (conteo físico, daño o deterioro, carga inicial, corrección de registro, pérdida o faltante, sobrante encontrado, otro), nota opcional y clave de idempotencia.
- RF-04: Rechazar ajustes que dejarían saldo negativo (regla existente del ledger) y ajustes sobre ítems serializados (dirigir a retorno/baja).
- RF-05: Vista "Por producto": agregado por ítem (existencia total, reservado, disponible), estado frente a mínimo/punto de reorden (Agotado / Bajo mínimo / Bajo punto de reorden / En nivel), filtros y acceso al detalle.
- RF-06: Vista "Por bodega": matriz bodega × producto actual (reubicada desde Bodegas) con sus filtros de custodia.
- RF-07: Vista "Kardex": lista de movimientos con filtros y filas expandibles mostrando las líneas.
- RF-08: Drawer de detalle por ítem: saldos por bodega × lote × condición + kardex del ítem + acción de ajuste.
- RF-09: Los movimientos de ajuste aparecen en el kardex con su razón legible (sin enums crudos).

## 5. Requisitos no funcionales

- RNF-01: Multi-tenant por schema; tenant desde JWT; `SET LOCAL search_path` por transacción vía helpers existentes del módulo. Sin impacto nuevo: se reutiliza la infraestructura vigente.
- RNF-02: RBAC — kardex consultable por ADMIN/NOC/SUPPORT; ajustes solo ADMIN (única operación que altera saldo sin documento origen).
- RNF-03: Paginación en servidor para el kardex; filtros apoyados en índices existentes (`idx_stock_movements_tenant_created_at`, `idx_stock_movements_tenant_origin`). Escala objetivo: tenants con decenas de miles de movimientos sin degradación perceptible.
- RNF-04: Idempotencia de ajustes vía `idempotencyKey` (unicidad ya garantizada por `uq_stock_movements_tenant_idempotency_key`).
- RNF-05: Texto visible en español, sentence case, sin enums crudos; labels centralizados en `inventory-labels.ts`.
- RNF-06: Cobertura de tests ≥ 80% en el código nuevo core; OpenAPI actualizada.
- RNF-07: Sin PII en logs, código ni fixtures. Regulación: sin impacto regulatorio directo en Fase 1 (los ajustes con efecto contable/fiscal se abordan en Fase 4 — requiere verificación con fuente oficial en su momento).

## 6. Modelo de datos

**Fase 1 no crea entidades ni migraciones.** Reutiliza `StockMovement`, `StockMovementLine`, `StockBalance`, `InventoryItem`, `StockLocation`, `StockLot` (ver anexo B, decisión D1: la razón del ajuste viaja en `originRefId`).

Nuevo enum compartido (sin DDL): `StockAdjustmentReason` en `packages/shared/src/enums/inventory/stock-adjustment-reason.enum.ts` con valores `CYCLE_COUNT`, `DAMAGE`, `INITIAL_LOAD`, `CORRECTION`, `LOSS`, `FOUND`, `OTHER`.

Fases futuras (borrador, sujeto a su propio gate): Fase 3 introduciría entidades de conteo físico (documento + líneas) vía migración tenant nueva; Fase 4 podría requerir campos/tabla de capas de costo. Se decidirá en su definición de fase.

## 7. Contratos API

### Fase 1 (contrato congelado para ejecución)

| Endpoint | Roles | Request | Response |
| --- | --- | --- | --- |
| `GET /api/v1/inventory/movements` | ADMIN, NOC, SUPPORT | Query: `itemId?`, `locationId?`, `origin?`, `dateFrom?`, `dateTo?`, `search?` (movementNumber), `page?`, `limit?` (≤100) | `{ data: StockMovementKardexRecord[], total, page, limit }` |
| `GET /api/v1/inventory/movements/:id` | ADMIN, NOC, SUPPORT | Param UUID | `StockMovementKardexRecord` (404 si no existe) |
| `POST /api/v1/inventory/adjustments` | ADMIN | `{ itemId, locationId, lotId?, condition?, quantityDelta (≠0), reason, notes?, idempotencyKey }` | `StockMovementResultRecord` existente (201; replay idempotente devuelve el movimiento original) |

Shape de `StockMovementKardexRecord` (cantidades `numeric` como string, patrón vigente):

```ts
interface StockMovementKardexLine {
  id: string; itemId: string; itemName: string | null; itemSku: string | null;
  locationId: string; locationName: string | null;
  lotId: string | null; lotNumber: string | null;
  serializedAssetId: string | null; quantity: string; unitCost: string | null;
}
interface StockMovementKardexRecord {
  id: string; movementNumber: string; origin: StockMovementOrigin;
  originContext: string; originRefId: string | null;
  adjustmentReason: StockAdjustmentReason | null;
  notes: string | null; actorUserId: string | null;
  isReversal: boolean; createdAt: Date; lines: StockMovementKardexLine[];
}
```

### Fase 2 (contrato congelado 2026-07-18 al emitir su prompt; detalle en el [spec de diseño](../specs/2026-07-18-mod12-existencias-reorden-fase02-design.md))

| Endpoint | Roles | Propósito |
| --- | --- | --- |
| `GET /api/v1/inventory/replenishment/suggestions` | ADMIN, NOC, SUPPORT | Ítems `purchasable` con `disponible + pendiente < reorderPoint`; `pendiente` descuenta OC abiertas (`quantity − receivedQuantity`, APPROVED/PARTIALLY_RECEIVED) y líneas de solicitud OPEN/PENDING_QUOTE/AWARDED; sugerido = `max(targetStock − (disponible + pendiente), minimumOrderQty ?? 0)` redondeado a `orderMultiple`; proveedor preferido resuelto en lote, costo estimado con fallback D-F2-4 |
| Extensión de `GET /inventory/dashboard` | (vigentes) | `estimatedTotalValue` + `estimatedValue` por categoría (`quantityOnHand × (lastPurchaseCost ?? standardCost ?? baseCost)`) |

**Cambio frente al borrador (decisión D-F2-1):** se elimina `POST /inventory/replenishment/purchase-requests`. La creación de la solicitud usa el `POST /purchasing/requests` existente a través del composer de compras **prellenado** (`requestType = REPLENISHMENT`, líneas `sourceKind = REPLENISHMENT_SUGGESTION`, `suggestedPartyRefId` del ítem) — el usuario siempre revisa antes de crear y se reutilizan las validaciones vigentes. Sin migraciones.

Shape de `ReplenishmentSuggestionRecord` (cantidades `numeric` como string, patrón vigente):

```ts
interface ReplenishmentSuggestionRecord {
  itemId: string; itemSku: string; itemName: string; unitOfMeasure: string;
  available: string; pendingPurchase: string;
  minimumStock: string; reorderPoint: string; targetStock: string;
  suggestedQty: string; orderMultiple: string | null; minimumOrderQty: string | null;
  leadTimeDays: number | null;
  preferredSupplier: { partyRefId: string; displayName: string | null } | null;
  estimatedUnitCost: string | null; estimatedLineValue: string | null;
  criticality: 'out' | 'below-minimum' | 'below-reorder';
}
```

### Fase 3A (contrato congelado 2026-07-18; detalle en [ADR-054](adrs/ADR-054-Conteo-Fisico-Inventario-Ciclico.md) y [spec 3A](../specs/2026-07-18-mod12-existencias-conteo-fisico-fase03A-design.md))

Documento de conteo (`stock_counts` + `stock_count_lines`, migración tenant 071). El cierre reconcilia el saldo contra lo contado (`delta = countedQty − onHand vivo`) emitiendo un `StockMovement` `origin=ADJUSTMENT` / `originContext='inventory.cycle-count'` / `reason=CYCLE_COUNT`.

| Endpoint | Roles | Propósito |
| --- | --- | --- |
| `GET /inventory/counts` | ADMIN, NOC, SUPPORT | Listar conteos (filtros status, locationId) |
| `GET /inventory/counts/:id` | ADMIN, NOC, SUPPORT | Detalle con líneas (expected/counted/variance) |
| `POST /inventory/counts` | ADMIN, NOC, SUPPORT | Crear (congela esperado por bodega/categoría, solo consumibles) |
| `PATCH /inventory/counts/:id` | ADMIN, NOC, SUPPORT | Capturar/editar cantidades contadas |
| `POST /inventory/counts/:id/close` | **ADMIN** | Cerrar y aplicar ajuste (idempotente) |
| `POST /inventory/counts/:id/cancel` | ADMIN, NOC, SUPPORT | Cancelar sin efecto |

Fase 3B (reservas) y Fase 4 (costeo): contrato se congela en su propia definición.

## 8. Criterios de aceptacion

### Fase 1

- CA-01: Una recepción de OC o compra de mostrador aparece en el kardex con su número de movimiento y líneas enriquecidas.
- CA-02: Un ajuste de salida reduce el on-hand visible en "Por producto"; un ajuste que dejaría saldo negativo responde 400 con mensaje en español.
- CA-03: Un ajuste sobre ítem serializado responde 400 dirigiendo a retorno/baja.
- CA-04: Reenviar el mismo ajuste con el mismo `idempotencyKey` no duplica el movimiento.
- CA-05: NOC/SUPPORT pueden consultar el kardex pero reciben 403 al intentar ajustar.
- CA-06: La pestaña Existencias muestra las tres subvistas; la matriz ya no está en Bodegas; el deep-link `tab=locations&custody=mobile` redirige a Existencias conservando el filtro.
- CA-07: Swagger documenta los tres endpoints nuevos; lint, typecheck y suites de inventario (API y portal) en verde.

### Criterios de entrada de Fase 2 (regla de completitud ADR-016)

- Informe de cierre de Fase 1 emitido en `docs/informes/` con evidencia de CA-01…CA-07 y gates G5/G6 superados.
- Contrato de Fase 2 (sección 7) congelado por AI-EM-ARCH (2026-07-18) y prompt de ejecución emitido: docs/prompts/PROMPT-MOD12-EXISTENCIAS-REORDEN-FASE-02-v1.0.md (ejecutable solo al cierre G7 de Fase 1), con spec de diseño docs/specs/2026-07-18-mod12-existencias-reorden-fase02-design.md.
- Sin deuda crítica abierta de Fase 1.

## 9. Dependencias y riesgos

- **Dependencia dura:** trabajo de Compras Fase 07 sin commitear en el working tree comparte archivos (`apps/api/src/modules/inventory/dto/index.ts`, `inventory.module.ts`, `InventoryClient.tsx`, specs). Mitigación obligatoria: solo appends en archivos compartidos, lógica nueva en archivos nuevos, integración de `InventoryClient` al final.
- **No se requiere ADR ni HLD nuevo:** la Fase 1 no crea bounded context, entidad, migración ni patrón; consulta y extiende el ledger aprobado por ADR-048. Un cambio de alcance que toque modelo de datos (Fases 3-4) sí exigirá su gate correspondiente.
- Riesgo de volumen del kardex en tenants grandes → paginación servidor + índices existentes (RNF-03).
- Riesgo de rol no disponible en el cliente para ocultar "Ajustar" → fallback: 403 del API mapeado por `mapInventoryError`.
- Fase 2 depende del flujo de solicitudes de compra vigente; cualquier cambio de contrato de purchasing obliga a re-sync vía AI-EM-ARCH (protocolo §3bis).

## 10. Definition of Done (Fase 1)

- Código backend y portal implementado según el prompt de ejecución, sin violaciones de boundary ni imports circulares.
- Tests nuevos y existentes de inventario en verde (API y portal); cobertura ≥ 80% en lo nuevo core.
- OpenAPI/Swagger actualizado; sin PII; texto visible en español sin enums crudos.
- Informe de fase en `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-v1.0.md` con evidencia de criterios y gates.
- Informe vivo del submódulo actualizado; decisión go/no-go de G7 registrada.

---

## Anexo A — Benchmark (2026-07-18)

| Producto | Modelo de stock | Qué adoptamos |
| --- | --- | --- |
| **Odoo** | `stock.move` (ledger entre ubicaciones) + `stock.quant` (agregado producto×ubicación) + `stock.picking` (agrupador operativo); ubicaciones virtuales como contrapartida de ajustes | Separación ledger/agregado (ya existente); ajustes como movimiento con contrapartida implícita |
| **Zoho Inventory** | Stock por bodega, ajustes con razones tipificadas, transfer orders con aprobación, tracking serial/lote | Razones tipificadas de ajuste; simplicidad operativa de la UI por pestañas |
| **ERPNext** | Stock Ledger Entry (inmutable) + Bin (agregado ítem×bodega); valoración FIFO/promedio por ítem; reorder level → Material Request | Kardex consultable como vista de primer nivel; reorden → solicitud de compra (Fase 2); costeo promedio (Fase 4) |

Patrón común confirmado: ledger inmutable + agregado ítem×bodega, ajustes documentados con razón, transferencias como documento, punto de reorden alimentando compras. El backend de MOD12 ya implementa la base; este PRD cierra la capa de consulta/operación.

## Anexo B — Decisiones de diseño (verificadas contra el código, 2026-07-18)

- **D1 — Sin migración:** la razón del ajuste viaja en el movimiento existente: `origin = ADJUSTMENT` (ya en el enum), `originContext = 'inventory.adjustment'` (patrón `'inventory.sale'`), `originRefId = <StockAdjustmentReason>` (varchar 160, cubierto por `idx_stock_movements_tenant_origin`), `notes` para nota libre. Verificado en `packages/database/src/entities/stock-movement.entity.ts:34-38`.
- **D2 — Roles:** ajustes solo ADMIN; kardex ADMIN/NOC/SUPPORT (paridad con el resto del módulo).
- **D3 — Serializados bloqueados en ajustes:** evita desincronizar `serialized_assets` frente a `stock_balances`; el mensaje dirige a retorno/baja.
- **D4 — Saldo no negativo:** garantizado por `StockBalanceService.applyDeltaWithManager`; no se duplica la validación.
- **D5 — Paginación kardex:** patrón `{ data, total, page, limit }` de `SupplierProfileService.list` y schemas `page`/`limit` con `z.preprocess` del DTO del módulo.
- **D6 — `idempotencyKey` requerido en ajustes:** generado por el portal (`crypto.randomUUID()`); un fallback determinístico deduplicaría por error dos ajustes legítimos idénticos consecutivos.
