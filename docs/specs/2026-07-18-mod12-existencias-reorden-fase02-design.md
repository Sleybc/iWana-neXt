# SPEC — MOD12 Existencias · Reposición sugerida y valor de inventario — Fase 02

**Versión:** 1.0
**Estado:** Diseño aprobado — habilita G4 (ejecutable al cierre G7 de Fase 1)
**Fecha:** 2026-07-18
**Módulo:** MOD12 Inventario / SCM — Existencias
**Autor:** AI-EM-ARCH (consolida tracks PROD-UX + DS-OWNER + dictamen de factibilidad SR-FULL)
**PRD:** [PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md](../prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md)
**Prompt:** [PROMPT Fase 02](../prompts/PROMPT-MOD12-EXISTENCIAS-REORDEN-FASE-02-v1.0.md)

## 1. Problema

Los ítems bajo punto de reorden solo se ven como badge en "Por producto"; nadie los convierte en compra sin transcribirlos a mano. El dashboard no muestra cuánto vale el inventario.

## 2. Objetivo

Subvista "Reposición" en Existencias que lista el requerimiento neto (descontando lo ya pedido), permite seleccionar y **prellenar el composer de compras** existente; tarjetas de valor estimado en el Resumen.

## 3. Decisiones (verificadas contra código 2026-07-18)

| Tema | Valor |
| --- | --- |
| Creación de solicitud | **Sin endpoint nuevo de creación** (D-F2-1): la subvista arma `initialValues` y abre `PurchaseRequestComposer` en modo create (soporta prefill por props, hoy solo usado en edición); el submit usa el `POST /purchasing/requests` existente. Humano siempre revisa antes de crear |
| Cálculo de sugerencias | Backend, nuevo `ReplenishmentService` (mismo módulo; inyecta balances/purchasing sin cruzar boundary). Cliente no puede: necesita OC/solicitudes pendientes |
| Disparo de sugerencia | `disponible + pendiente < reorderPoint`, con `disponible = Σ onHand − Σ reserved` y `pendiente = Σ OC abiertas (quantity − receivedQuantity, status APPROVED/PARTIALLY_RECEIVED) + Σ líneas de solicitud OPEN/PENDING_QUOTE/AWARDED` (D-F2-2, anti doble pedido) |
| Cantidad sugerida | `max(targetStock − (disponible + pendiente), minimumOrderQty ?? 0)` redondeada hacia arriba a `orderMultiple` si existe (D-F2-3) |
| Ítems elegibles | `purchasable = true` y `status` activo; incluye serializados (se compran igual) |
| Vocabulario existente | Cabecera `requestType = REPLENISHMENT`; líneas `sourceKind = REPLENISHMENT_SUGGESTION`; `suggestedPartyRefId = preferredSupplierRefId` del ítem (ya modelados, sin DDL) |
| Proveedor mostrado | `SupplierPartyPort.getSupplierSummariesBatch` (batch, sin N+1) |
| Costo para valor | `lastPurchaseCost ?? standardCost ?? baseCost` (D-F2-4); mismo fallback en sugerencias (costo estimado por línea) y dashboard |
| Valor en dashboard | Backend extiende `getSummary` con `estimatedTotalValue` y `estimatedValue` por fila de `balancesByCategory` (datos ya cargados; cambio aditivo). Portal: tarjeta KPI + columna, con `formatInventoryCurrency` existente (COP es-CO) |
| Subvista | Cuarta subvista `'replenishment'` en `StockSubview` de `StockWorkspace` (patrón de las 3 existentes); NO se mezcla selección con la tabla de solo lectura "Por producto" |
| Selección múltiple | Reutilizar `PurchaseSuggestionList` (checkbox por ítem) + `PurchaseSelectionBar` (CTA "Generar solicitud de compra"); cantidad editable por fila con default sugerido |
| Paso de contexto entre tabs | Estado en `InventoryClient` (ambas pestañas viven en el mismo cliente): `pendingComposerPrefill` → `handleTabChange('purchasing')`; **sin params de URL nuevos** (D-F2-5). Tras crear, `openWorkbench(requestId)` ya existente muestra la solicitud |
| Migraciones | Ninguna (consulta + composición sobre entidades existentes) |
| Roles | Sugerencias: ADMIN/NOC/SUPPORT (paridad kardex). Creación: los del `POST /purchasing/requests` vigente |

## 4. Flujo UX

1. Existencias → subvista **Reposición**: tabla de ítems con requerimiento neto (SKU, nombre, disponible, pendiente de compra, punto de reorden, sugerido editable, proveedor preferido, costo estimado), preseleccionados los críticos (`out`).
2. Selección múltiple → barra "Generar solicitud de compra (N)".
3. Se abre Compras con el composer prellenado: `requestType` Reposición, líneas `REPLENISHMENT_SUGGESTION` con cantidades y proveedor sugerido; título y justificación autogenerados editables ("Reposición sugerida 2026-07-18 — N ítems bajo punto de reorden").
4. El usuario ajusta lo que quiera y envía con el flujo normal; al crear, el workbench abre la solicitud.
5. Resumen: tarjeta "Valor estimado de inventario" + valor por categoría.

Estados: vacío ("Sin ítems bajo punto de reorden"), carga (skeleton), error (`PortalAlert` + `mapInventoryError`). Accesibilidad: checkboxes con label por ítem, barra de selección anunciada, foco al abrir el composer (WCAG 2.2 AA).

## 5. CA

| CA | Descripción |
| --- | --- |
| CA-F2-01 | La subvista Reposición lista solo ítems con `disponible + pendiente < reorderPoint`, con sugerencia calculada según D-F2-2/D-F2-3 |
| CA-F2-02 | Un ítem con OC abierta que cubre el faltante NO aparece sugerido (anti doble pedido) |
| CA-F2-03 | Selección + generar → composer prellenado (REPLENISHMENT / REPLENISHMENT_SUGGESTION / `suggestedPartyRefId`); el usuario puede editar antes de crear |
| CA-F2-04 | La solicitud creada abre en el workbench de Compras con sus líneas |
| CA-F2-05 | Resumen muestra valor estimado total y por categoría en COP con fallback de costo D-F2-4 |
| CA-F2-06 | Roles: NOC/SUPPORT ven sugerencias; creación respeta los roles del flujo de compras |
| CA-F2-07 | Gates técnicos: tests nuevos en verde, lint, typecheck, OpenAPI del endpoint nuevo |
