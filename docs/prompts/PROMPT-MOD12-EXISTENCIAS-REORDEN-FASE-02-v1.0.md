# PROMPT - MOD12 Existencias — Reposición sugerida y valor de inventario — Fase 02

> **Estado: Emitido (G4) — ejecutable únicamente al cierre G7 de Fase 1** (regla de completitud ADR-016). La Fase 1 está en G6 al momento de emisión; verificar su cierre en el informe vivo antes de ejecutar.

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- Convencion documental general: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`

## Modulo

- Nombre: Inventario / SCM — submódulo Existencias (stock)
- Codigo: MOD12
- Fase: 02 (Reposición sugerida y valor de inventario)
- Version: 1.0
- Fecha: 2026-07-18
- Generado por: AI-EM-ARCH (Engineering Manager)
- Destinatario: Sr. Dev Fullstack (AI-SR-FULL backend + AI-FE-PLATFORM portal)
- Nombre de archivo destino: `PROMPT-MOD12-EXISTENCIAS-REORDEN-FASE-02-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** el tenant ve en Existencias una subvista "Reposición" con el requerimiento neto de compra (descontando lo ya pedido y no recibido), selecciona ítems y genera una solicitud de compra **prellenada** que revisa y envía por el flujo normal de Compras; el Resumen de inventario muestra el valor estimado (total y por categoría).
- **Lo que sí entra:** `GET /inventory/replenishment/suggestions` (nuevo `ReplenishmentService`), extensión de `GET /inventory/dashboard` con valor estimado, subvista Reposición en `StockWorkspace`, prefill del composer de compras en modo creación, tarjetas de valor en `InventoryDashboard`, tests y Swagger.
- **Lo que no entra:** endpoint de creación de solicitudes propio de existencias (**eliminado por decisión D-F2-1** — la creación usa `POST /purchasing/requests` vigente vía composer); compra automática sin revisión humana; conteos, reservas, costeo promedio (Fases 3-4); migraciones (no se requieren); cambios al flujo de aprobación de compras.

## 2. Artefactos de entrada obligatorios

- PRD: `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` (contrato §7 Fase 2 **congelado 2026-07-18**)
- Spec de diseño: `docs/specs/2026-07-18-mod12-existencias-reorden-fase02-design.md` (decisiones D-F2-1…D-F2-5, flujo UX, CA)
- Informe de cierre de Fase 1: `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-v1.0.md` + auditoría G5
- ADRs aplicables: ADR-048, ADR-016
- Skills del repo: `nestjs-expert`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `system-vocabulary-review`, `testing-patterns`, `openapi-spec-generation`
- Artefactos faltantes detectados: ninguno

## 3. Instrucciones para Sr. Dev Fullstack

> Verifica al arrancar si el trabajo de Compras F07 sigue sin commitear; de ser así aplican las mismas reglas de Fase 1: solo append en archivos compartidos, lógica nueva en archivos nuevos.

### 3.1 Backend

1. **`ReplenishmentService`** — nuevo `apps/api/src/modules/inventory/services/replenishment.service.ts` (patrón `StockBalanceService`: `@InjectDataSource`, `TenantContext.getOrThrow()`, `runInTenantSchema`). Método `listSuggestions()`:
   - Carga ítems del tenant con `purchasable = true` y estado activo.
   - Disponible por ítem: agrega `StockBalance` (`Σ quantityOnHand − Σ quantityReserved`) — el servicio de balances devuelve filas crudas; la agregación es responsabilidad de este servicio.
   - Pendiente por ítem (anti doble pedido, D-F2-2): `Σ (quantity − receivedQuantity)` de `PurchaseOrderLine` cuyas OC estén en `APPROVED`/`PARTIALLY_RECEIVED` (precedente de cast numérico en `purchasing.service.ts:693-698`) **más** `Σ quantityRequested` de `PurchaseRequestLine` con `lineStatus ∈ {OPEN, PENDING_QUOTE, AWARDED}` (índice `idx_purchase_request_lines_tenant_item` disponible; excluir `ORDERED` para no doble-contar con la OC).
   - Sugerencia si `disponible + pendiente < reorderPoint` (ítems con `reorderPoint > 0`): `suggestedQty = max(targetStock − (disponible + pendiente), minimumOrderQty ?? 0)`, redondeada hacia arriba al múltiplo `orderMultiple` si no es null (D-F2-3). Campos numéricos del ítem son `numeric` → string: parsear con el patrón vigente.
   - Proveedor preferido: `preferredSupplierRefId` es un **partyRefId**; resolver nombres en lote con `SupplierPartyPort.getSupplierSummariesBatch` (inyectable, ya exportado por el módulo).
   - Costo estimado unitario: `lastPurchaseCost ?? standardCost ?? baseCost` (D-F2-4; `standardCost`/`baseCost` son NOT NULL default 0 — tratar `'0.00'` como "sin costo conocido" para el label, no para el cálculo).
   - Shape de respuesta: ver contrato §7 del PRD (`ReplenishmentSuggestionRecord[]`, sin paginación: el universo es ítems bajo reorden, acotado; ordenar por criticidad — `out` primero, luego menor cobertura).
2. **Dashboard** — extender `InventoryDashboardService.getSummary` (`inventory-dashboard.service.ts`): añadir `estimatedTotalValue` (Σ `quantityOnHand` × costo D-F2-4) y `estimatedValue` en cada fila de `balancesByCategory` (los ítems y balances ya están cargados; cambio aditivo, no tocar los campos existentes).
3. **Controller** — append en `inventory.controller.ts`: `GET /inventory/replenishment/suggestions` con `@Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)`, `@ApiOperation({ summary: 'Consultar sugerencias de reposición de inventario' })`. Sin DTO de query (sin filtros en esta fase).
4. **Módulo** — registrar `ReplenishmentService` en providers (append de una línea).
5. **Sin migraciones, sin DTOs de escritura nuevos** (no hay endpoint de creación).

### 3.2 Frontend portal

1. **API client** (`apps/portal/src/lib/api-client.ts`): tipo `ReplenishmentSuggestionRecord`, campo `estimatedTotalValue` y `estimatedValue` por categoría en `InventoryDashboardSummary`, método `inventoryApi.listReplenishmentSuggestions(tenantSlug?)`.
2. **Subvista Reposición** — `StockWorkspace.tsx`: `StockSubview` += `'replenishment'`, nuevo `TabsTrigger` "Reposición" y `TabsContent` → nuevo componente `StockReplenishmentPanel.tsx`:
   - Fetch propio de sugerencias (patrón `StockKardexPanel`); estados vacío/carga/error (`PortalEmptyState`, `PortalSkeletonBlock`, `PortalAlert` + `mapInventoryError`).
   - Tabla: SKU, nombre, disponible, pendiente de compra, punto de reorden, **sugerido editable por fila** (default `suggestedQty`), proveedor preferido, costo estimado. Selección múltiple reutilizando el patrón `PurchaseSuggestionList` (checkbox por ítem) + `PurchaseSelectionBar` (CTA "Generar solicitud de compra (N)"); preseleccionar los ítems `out`.
   - Al generar: construir `PurchaseComposerInitialValues` — `requestType = REPLENISHMENT`, título y justificación autogenerados editables ("Reposición sugerida {fecha} — {N} ítems bajo punto de reorden"), líneas con `sourceKind = REPLENISHMENT_SUGGESTION`, `inventoryItemId`, `quantityRequested` (la editada), `unitOfMeasure` del ítem, `suggestedPartyRefId = preferredSupplierRefId` — y entregarlas al callback del workspace.
3. **Paso de contexto entre pestañas (D-F2-5, sin params de URL nuevos):** estado `pendingComposerPrefill` en `InventoryClient.tsx`; al generar desde Reposición se setea y se llama `handleTabChange('purchasing')`; `PurchaseWorkspace` recibe una prop nueva opcional `createInitialValues` que, al estar presente, abre `openCreateMode()` con `PurchaseRequestComposer initialValues` (hoy el prefill solo existe para edición — replicar la ruta `composerInitialValues` de `PurchaseWorkspace.tsx:398-408`; consumir y limpiar el estado al abrir). Tras crear (el `handleCreateRequest` existente devuelve `{ ok, requestId }`), invocar `openWorkbench(requestId)` ya existente.
4. **Tarjetas de valor** — `InventoryDashboard.tsx`: tarjeta KPI "Valor estimado de inventario" (`formatInventoryCurrency` de `inventory-labels.ts:525-532`, ya existente) + valor por categoría en el breakdown correspondiente.
5. **Labels**: textos nuevos en español sentence case; sin enums crudos (mapear `REPLENISHMENT` y estados de sugerencia en `inventory-labels.ts`).

### 3.3 Migraciones y base de datos

No aplica. Cualquier necesidad de DDL es stop/go.

### 3.4 Contratos, validaciones y seguridad

- Contrato congelado en PRD §7 (Fase 2) + spec D-F2-*; no modificar sin re-sync vía AI-EM-ARCH.
- Tenant desde JWT; roles según §3.1.3; la creación de solicitudes conserva las validaciones vigentes de `POST /purchasing/requests` (title, requestingArea, justification ≥ 10).

### 3.5 Documentar decisiones y desvíos

Desvíos del contrato o de D-F2-* → `[CONSULTA]`/`[BLOQUEO]` a AI-EM-ARCH antes de implementar; registrar en el informe de fase.

## 4. Restricciones no negociables

- Sin acceso directo a tablas de otro módulo (purchasing y existencias comparten `InventoryModule` — inyección de servicios, nunca repos ajenos al módulo).
- Sin credenciales ni PII; sin `any`; texto visible en español sentence case.
- La solicitud de compra siempre pasa por revisión humana en el composer (no auto-crear).
- Solo append en archivos compartidos con trabajo no commiteado de otros tracks.
- pnpm (nunca npm/yarn).

## 5. Entregables tecnicos obligatorios

- Backend: `ReplenishmentService`, extensión del dashboard, endpoint GET, registro en module.
- Frontend: api-client, `StockReplenishmentPanel`, subvista en `StockWorkspace`, prefill de creación en `PurchaseWorkspace`/`InventoryClient`, tarjetas de valor.
- Tests:
  - API — nuevo `tests/replenishment.service.spec.ts`: disparo `disponible + pendiente < reorderPoint`; descuento de OC abiertas y líneas de solicitud (CA-F2-02); piso `minimumOrderQty`; redondeo a `orderMultiple`; fallback de costo; resolución batch de proveedor. Extensión de `inventory-dashboard.service` spec (valor total y por categoría). Append en HTTP spec (roles del GET) y en swagger spec (path nuevo).
  - Portal — specs de `StockReplenishmentPanel` (fetch, selección, cantidades editables, construcción de `initialValues`), del prefill en `PurchaseWorkspace` (abre composer en modo create con líneas) y de la tarjeta de valor.
- OpenAPI/Swagger actualizado.

## 6. Entregables documentales obligatorios

- Informe de fase: `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-02-v1.0.md`.
- Actualización del informe vivo `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-DEFINICION-v1.0.md`.
- Actualización de PRD solo si un desvío aprobado cambia el contrato.

## 7. Criterios de aceptacion

CA-F2-01…CA-F2-07 del spec de diseño (sección 5). Gates del ejecutor:

1. `pnpm --filter @iwana/api test -- src/modules/inventory` (directorio completo del módulo — **lección de Fase 1: no solo las suites nuevas**).
2. `pnpm --filter @iwana/portal test` (inventario completo).
3. `pnpm lint && pnpm typecheck` (obligatorio; en Fase 1 el lint se omitió y lo corrió el auditor).
4. E2E manual con `pnpm dev`: ítem bajo reorden con OC abierta que lo cubre no aparece; generar solicitud desde Reposición → composer prellenado → crear → workbench la muestra; tarjeta de valor visible en Resumen.
5. `/api/v1/docs` muestra el endpoint nuevo.

## 8. Criterio de stop/go

- Detenerse si: (a) se requiere DDL; (b) el prefill del composer exige refactor no-append de `PurchaseWorkspace`; (c) el contrato congelado resulta inviable; (d) Fase 1 no está cerrada en G7.
- Documentar causa en el informe de fase; escalar a AI-EM-ARCH con opciones (máx. 3) y recomendación.

## 9. Criterio de salida de la fase

- Backend validado: sugerencias correctas con anti doble pedido probado; dashboard con valor.
- Frontend validado: flujo Reposición → composer → solicitud creada visible; valor en Resumen.
- Base de datos: sin cambios de schema (confirmado en informe).
- Tests en verde: suites completas del módulo (API y portal) + lint + typecheck.
- Documentación archivada: informe de fase + informe vivo actualizado; G5 listo para G6.
