# PROMPT-MOD12-MOD11-CUSTODIA-EJECUTOR-BLOQUE-OT-v1.0

**Módulo:** MOD12 Inventario / SCM (+ consumo en drawer de OT MOD11, portal)
**Fase:** Custodia del ejecutor visible en el bloque "Equipos y materiales" del drawer de OT
**Versión:** 1.0
**Fecha:** 2026-08-31
**Generado por:** AI-EM-ARCH (modo combinado Product Architect + Architect + Orchestrator)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*
**Agentes destinatarios:** AI-SR-FULL (backend MOD12 + contrato), AI-FE-PLATFORM (portal), AI-SR-QA (verificación)
**Origen de la decisión:** sesión 2026-08-31 — el bloque solo mostraba consumos registrados; el producto requiere ver la custodia del ejecutor. Decisión aprobada por el solicitante: Opción B (custodia del ejecutor). Alternativa C (pick-list por OT) queda como backlog futuro, no se implementa aquí.

---

## 0. Contexto y hechos verificados

- El drawer de OT (`apps/portal/src/components/operations/ExecutionOrderDrawer.tsx`, bloque 4 ~:1198-1400) hoy muestra: consumos de la OT (`itemUsage`), estado de conciliación y formulario de registro. No muestra qué tiene asignado el ejecutor.
- **No existe el concepto "equipos asignados a la OT"** (sin pick-list ni contrato); el dato disponible es la **custodia del ejecutor**: bodega móvil 1:1 por técnico/cuadrilla (`stock_locations` tipo `MOBILE_TECHNICIAN`/`MOBILE_CREW`, índice único parcial por `responsibleRefId` — `stock-location.entity.ts:12-15`), con equipos serializados (`serialized_assets.currentLocationId` — `serialized-asset.entity.ts:61-74`) y materiales (`stock_balances` item×location).
- Consultable hoy por composición (`locations?custody=mobile&responsibleRefId` → `assets?locationId` + `balances?locationId`), pero el portal **descarta el `locationId`** tras construir los selects de custodia (`OperationsClient.tsx:622-634`).
- Divergencia documental conocida (no bloqueante para esta fase): `technicianCustodyId` tiene doble semántica — ID de usuario en la validación de MOD11 (`execution-orders.service.ts:2440-2474`) vs UUID de ubicación en líneas del ledger MOD12 (`stock-ledger.service.ts:1377, 1426, 1464, 1501`). Esta fase la **documenta, no la cambia**.

---

## 1. Contrato congelado y evento de re-sync (§3.5)

**Contrato de API tipado congelado — ruta y versión:** nuevo archivo `packages/shared/src/contracts/inventory/executor-custody.ts` v1, consumido por el endpoint `GET /api/v1/inventory/custody`.

```ts
/** Custodia activa del ejecutor: equipos serializados y materiales con stock. */
export interface ExecutorCustodyResponse {
  /** Ubicación móvil activa del responsable; null si no tiene custodia activa. */
  location: {
    id: string;
    name: string;
    type: 'MOBILE_TECHNICIAN' | 'MOBILE_CREW';
    responsibleType: 'TECHNICIAN' | 'CREW';
    responsibleRefId: string;
  } | null;
  /** Equipos serializados en la custodia (por página). */
  assets: { items: SerializedAssetRecord[]; meta: ListMeta };
  /** Materiales con stock en la custodia (por página). */
  balances: { items: StockBalanceRecord[]; meta: ListMeta };
}
```

- Query: `responsibleRefId` (UUID, requerido) + `page`/`limit` (default 25, máx 100) aplicados a ambas colecciones.
- Sin custodia activa → `200` con `location: null` y colecciones vacías (estado normal, no error).
- Permisos: `INVENTORY_STOCK_READ` con los roles vigentes del controlador de inventario (incluyen TECHNICIAN/CONTRACTOR).
- Boundary: MOD12 **no** lee tablas de MOD11 ni otros módulos; recibe `responsibleRefId` como parámetro. El portal resuelve el valor desde `order.assignee.id`.
- Los DTOs reutilizan `SerializedAssetRecord`, `StockBalanceRecord` y `ListMeta` existentes en `@iwana/shared` — sin duplicar tipos.
- Este contrato es el evento de re-sync: B2 corre contra él sin esperar el merge de B1.

**Requiere ADR:** No (pattern de integración dentro del stack; sin nuevo bounded context). **Requiere CTO:** No. **Requiere SEC-ENG:** No (lectura con permisos vigentes; sin PII nueva).

---

## 2. Objetivo exacto

### Entra

1. Endpoint agregado de custodia en MOD12 + contrato tipado + tests + OpenAPI.
2. Sección de solo lectura "En custodia del ejecutor" en el bloque 4 del drawer, con wiring completo en `OperationsClient`.
3. Nota documental de la semántica de `technicianCustodyId`.
4. Informe de fase con matriz criterio↔test.

### No entra

- Cualquier flujo de asignación previa por OT (pick-list) — rechazado en decisión.
- Escritura de inventario desde esta sección (solo lectura).
- Cambio de `assertCustodyAssignment`, del flujo de consumo ni de la saga MOD11–MOD12.
- Nuevos tokens/patrones visuales (reutilizar existentes → no activa carril de DS-OWNER).
- Cambio de comportamiento en la doble semántica de `technicianCustodyId` (solo nota documental).

---

## 3. Tracks y RACI

| Track | Agente | Alcance | No espera a |
| --- | --- | --- | --- |
| **Backend** | AI-SR-FULL | Contrato, endpoint, tests, OpenAPI, nota documental | Nadie |
| **Frontend** | AI-FE-PLATFORM | Sección de lectura en drawer + wiring `OperationsClient` | Nadie (corre contra contrato §1) |
| **QA** | AI-SR-QA | Matriz criterio↔test + regresiones | Entrega de B1/B2 para integración |

---

## 4. Instrucciones para AI-SR-FULL (B1)

1. Crear `packages/shared/src/contracts/inventory/executor-custody.ts` con la forma exacta de §1 (test-first: contract shape spec en inventory).
2. Endpoint `GET /inventory/custody` en `apps/api/src/modules/inventory/inventory.controller.ts`: resolver la ubicación móvil `ACTIVE` por `responsibleRefId` (usa `stock-location.service`, índice único parcial — no debe requerir escaneo), y en paralelo `serialized_assets` por `currentLocationId` y `stock_balances` por `locationId` (condition AVAILABLE), con paginación compartida. Sin custodia activa → `location: null` + vacíos.
3. Tests: contrato de shape, resolución de custodia, sin custodia → 200 null, aislamiento tenant (no ve custodias de otro tenant), permisos (TECHNICIAN consulta su custodia), paginación.
4. OpenAPI: documentar el endpoint nuevo. Nota documental: registrar la semántica dual de `technicianCustodyId` (comentario en el contrato `execution-orders.ts:172-179` y/o spec MOD12 — citar informe).
5. Skills: `nestjs-expert`, `testing-patterns`.

## 5. Instrucciones para AI-FE-PLATFORM (B2)

1. `OperationsClient.tsx`: persistir el `locationId` de la custodia del ejecutor (hoy se descarta en el mapper :622-634) y agregar al `Promise.allSettled` de `openExecutionOrder` (:549-570) la llamada al nuevo endpoint con `order.assignee.id`, protegida por `executionOrderRequestSeqRef` (:573) para descartar respuestas tardías. Estados `loading/available/unavailable` siguiendo el patrón `executionOrderInventoryState` (:407-409, :635-639). Si no hay `assignee`, no se llama y la sección muestra vacío informativo.
2. Drawer (`ExecutionOrderDrawer.tsx`, bloque 4): nueva sub-sección de solo lectura **"En custodia del ejecutor"** al inicio del bloque (antes de consumos): nombre de la custodia, lista de equipos (serial + ítem + estado) y materiales (ítem + cantidad disponible), paginación con el patrón `onLoadMore` existente (:1277-1284). Estados: skeleton en carga, alerta de no disponible con acción "Actualizar detalle", vacío → "El ejecutor no tiene equipos ni materiales en custodia" con hint "Lo asignado desde inventario aparecerá aquí." Visible en estados no terminal; también pre-inicio (es información de lectura). Términos: "custodia", "equipos", "materiales" — sin jerga técnica ni nombres de tabla.
3. Specs: drawer (sección visible/vacía/no disponible/paginación/pre-inicio) y OperationsClient (llamada, descarte de tardías, fallback sin assignee).
4. Sin tokens ni componentes nuevos; reutilizar tarjetas/listas y `PortalAlert`/`PortalEmptyState` vigentes.
5. Skills: `frontend-dev-guidelines`, `iwana-identity-ui-review` (disciplina de alineación, patrón existente), `testing-patterns`.

## 6. Instrucciones para AI-SR-QA (B3)

1. Matriz criterio↔test para CA-1..CA-7 (§7).
2. Regresión: suites de inventory (API) y operations (portal); typecheck + lint.
3. E2E opcional del caso original si el costo es razonable; si no, declarar pendiente.

## 7. Criterios de aceptación

- CA-1: `GET /inventory/custody?responsibleRefId=…` responde `200` con location + assets + balances paginados del tenant del actor; sin custodia activa → `location: null` con colecciones vacías.
- CA-2: un actor no puede consultar la custodia fuera de su alcance de permisos; aislamiento tenant verificado en tests.
- CA-3: el drawer muestra la sección "En custodia del ejecutor" con equipos y materiales del asignado, en estados no terminal (incluido pre-inicio).
- CA-4: sin `assignee`, sin custodia activa o inventario no disponible, la sección muestra el estado correspondiente y el resto del drawer sigue operativo.
- CA-5: la sección es de solo lectura; no altera el formulario de consumo ni la saga MOD11–MOD12.
- CA-6: respuestas tardías de apertura previa no pisan el estado del drawer actual (seq guard).
- CA-7: lint, typecheck y suites de inventory/portal en verde; contrato v1 en `@iwana/shared` sin romper tipos existentes.

## 8. Restricciones no negociables

- Boundary Modulith: MOD12 no lee tablas de MOD11 ni de otros módulos; sin imports circulares.
- Multi-tenancy: filtros por tenant del JWT; `SET LOCAL search_path` por transacción; sin hardcodear schema.
- Sin `any` explícito, sin promesas flotantes, logs sin PII.
- Textos visibles en español, sentence case, vocabulario de producto.
- `pnpm` para todo; OpenAPI actualizada (endpoint nuevo — gate antes de merge).

## 9. Entregables

- Código backend + contrato en `@iwana/shared` + OpenAPI.
- Código portal (drawer + OperationsClient) + specs.
- Informe: `docs/informes/INFORME-MOD12-MOD11-CUSTODIA-EJECUTOR-BLOQUE-OT-v1.0.md` — síntoma, causa, cambios archivo:línea, evidencia de tests, nota de `technicianCustodyId`, deuda residual (backlog Opción C registrado).

## 10. Criterio stop/go

- **Detenerse si:** la resolución de custodia exige leer datos de otro módulo (boundary), o si el índice único parcial por `responsibleRefId` no sostiene la consulta (requeriría migración → escalar, no migrar en esta fase).
- **Escalar a:** AI-EM-ARCH (`[BLOQUEO]`/`[CONSULTA]` bloqueante).
- **Recomendación esperada:** opciones (máx. 3) con postura del agente.

---

**Trazabilidad:** sesión 2026-08-31; investigación SR-FULL (modelo custodia MOD12, endpoints) y FE-PLATFORM (flujo de datos portal); decisión aprobada por el solicitante (Opción B, custodia del ejecutor).
