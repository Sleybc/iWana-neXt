# PROMPT DE EJECUCIÓN — MOD12 Compras · Fase 30 · Adjudicación por cotización con orden por proveedor

**Version:** 1.0
**Estado:** Vigente
**Fecha:** 2026-09-11
**Generado por:** AI-EM-ARCH (modo Orquestador)
**Plantilla:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md (v1.2, En revisión)
**Gate:** G4 — sin este prompt no hay implementación

---

## Vinculos de trazabilidad

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| PRD | docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md — RF-CMP-06 | Aprobado |
| PRD | docs/prds/PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md — RF-06-01 | Aprobado |
| HLD | docs/hlds/HLD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md | Aprobado |
| ADR | ADR-087 (propuesto) — docs/adrs/ADR-087-Cobertura-Adjudicacion-Derivada-Compras.md | **Propuesto — G1 pendiente del CTO** |
| ADR base | docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md | Aprobado |
| ADR | docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md | Aprobado |
| Spec UX + contrato DS | docs/specs/2026-09-11-mod12-compras-adjudicacion-matriz-design.md (v1.0) | **Congelado** |
| Plan de fase | docs/plans/2026-09-11-mod12-compras-adjudicacion-matriz-fase-30.md | Vigente |

## Modulo

- **Nombre:** Inventario / SCM — Compras
- **Codigo:** MOD12
- **Fase:** 30
- **Version:** 1.0
- **Fecha:** 2026-09-11
- **Generado por:** AI-EM-ARCH
- **Agentes destinatarios:** AI-SR-FULL (backend, contrato de API), AI-FE-PLATFORM (portal), AI-SR-QA (E2E y a11y), AI-SEC-ENG (review de la superficie nueva)

---

## DECLARACIÓN DE CONTRATOS CONGELADOS

Conforme al protocolo §3bis, esta fase se ejecuta **contract-first**. Los tracks corren en paralelo
contra estos dos contratos y solo se bloquean si uno de ellos cambia de versión.

**Contrato de componente — CONGELADO**
`docs/specs/2026-09-11-mod12-compras-adjudicacion-matriz-design.md`, **v1.0**, §5.
Dueño: AI-DS-OWNER. Cubre props, estados de celda, primitivas, textos visibles y contrato de
accesibilidad.

**Contrato de API tipado — CONGELADO al publicarse**
`packages/shared/src/contracts/inventory/purchase-award-matrix.contract.ts`, **v1.0**.
Dueño: AI-SR-FULL. **Es la primera entrega de la fase y bloquea a todos los demás tracks.** Debe
publicarse antes de que FE-PLATFORM escriba una sola línea de `award-matrix.ts`.

Un cambio en cualquiera de los dos exige subir versión del artefacto, emitir `[DESEMPATE]` o adenda
citando ruta y versión, y notificar a los tracks afectados. **Parchear un contrato en silencio es
defecto bloqueante.**

---

## 1. Objetivo exacto de la fase

### Resultado esperado

En `/dashboard/inventory?tab=purchasing`, al revisar las cotizaciones de una solicitud aprobada, el
usuario marca **producto a producto dentro de cada cotización** y al confirmar se generan **N órdenes
de compra, una por proveedor**, con los productos adjudicados a cada uno. Si quedan productos sin
adjudicar, **la solicitud permanece abierta** y admite una segunda tanda.

Caso canónico que debe funcionar de extremo a extremo: productos P1..P4, cotizaciones Q1 (proveedor
1) y Q2 (proveedor 2) → P1 y P3 al proveedor 1, P2 y P4 al proveedor 2 → **dos órdenes de compra**.

### Lo que sí entra

1. Corrección del defecto de **solicitud varada** (`CONVERTED_TO_PO` incondicional).
2. Eje derivado `awardCoverage` según ADR-087 (propuesto).
3. Integridad e idempotencia de `purchase_request_line_awards` (migración tenant 128).
4. Validación de `supplierQuoteId` y snapshot económico del award.
5. Tope de cantidad ordenada contra cantidad adjudicada.
6. Endpoint de revocación de adjudicación.
7. Costo unitario de la orden derivado en servidor.
8. Pantalla nueva de adjudicación en matriz, con acordeón alterno, y eliminación de `AwardLinesPanel`.

### Lo que NO entra

- **Modificar `validateLineAward`** (`purchasing-policy.service.ts:79`). Decisión del CTO: la regla de
  parcialidad de cantidad se mantiene **intacta**. Partir la cantidad de un producto entre dos
  proveedores sigue siendo exclusivo de `PROJECT`.
- Añadir valores a `PurchaseRequestStatus`.
- Primitivas `Table` o `Checkbox` nuevas en `@iwana/ui`.
- Consolidar productos de varias solicitudes en una misma orden de compra.
- Edición de cotizaciones desde la matriz, virtualización de filas, notificación al proveedor,
  aprobación o recepción de órdenes.

---

## 2. Artefactos de entrada obligatorios

- **PRD:** `PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md` (RF-CMP-06 — «adjudicación total o parcial por línea sin romper el flujo por solicitud»); `PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md` (RF-06-01 — regla de parcialidad vigente).
- **HLD:** `HLD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md` (§ riesgo «Split de líneas hacia varias OCs», mitigado por `purchase_request_line_awards`).
- **ADRs:** ADR-087 (propuesto) — **verificar aprobación antes de iniciar BE-2**; ADR-048, ADR-051, ADR-053.
- **Spec congelada:** `docs/specs/2026-09-11-mod12-compras-adjudicacion-matriz-design.md`.
- **Skills a consultar** (`.agents/skills/INDEX.md`): `nestjs-expert`, `database-migration`, `postgresql`, `openapi-spec-generation`, `core-components`, `tailwind-patterns`, `frontend-dev-guidelines`, `wcag-audit-patterns`, `system-vocabulary-review`, `testing-patterns`, `e2e-testing-patterns`.

### Artefactos faltantes detectados

- No existe contrato compartido de compras en `packages/shared/src/contracts/inventory/`; esta fase lo
  crea siguiendo el patrón de `stock-issue-picking.ts`.
- ADR-087 (propuesto) aún no está aprobado: BE-1 puede arrancar (corrige un defecto y no depende de la decisión),
  pero **BE-2 no inicia sin la firma del CTO**.

---

## 3. Instrucciones para los agentes ejecutores

### 3.1 AI-SR-FULL — Track T0: contrato de API (bloqueante, va primero)

Publicar `packages/shared/src/contracts/inventory/purchase-award-matrix.contract.ts`, exportado desde
el `index.ts` de esa carpeta. Solo tipos: sin importar NestJS ni React.

Contiene: `AwardMatrixCellState`, `AwardMatrixQuoteColumn`, `AwardMatrixRow`, `AwardSupplierSummary`,
`CreateAwardsRequest` / `Response`, `RevokeAwardRequest` / `Response`, `PurchaseRequestAwardCoverage`,
y la unión de códigos de error: `AWARD_QUOTE_MISMATCH | AWARD_SUPPLIER_MISMATCH |
AWARD_QUOTE_LINE_MISSING | AWARD_PARTY_CONFLICT | AWARD_ALREADY_ORDERED | ORDER_EXCEEDS_AWARD |
UNIT_COST_MISMATCH`.

Los esquemas Zod siguen viviendo en `apps/api/src/modules/inventory/dto/index.ts` y se afirman contra
el contrato con `satisfies`, igual que hace el contrato de picking. El portal **nunca** importa del
API.

### 3.2 AI-SR-FULL — Track BE-1: defectos (no depende de la UI)

**Migración tenant `packages/database/src/migrations/tenant/128_harden_purchase_request_line_awards.ts`**
(+ `.spec.ts` + `.integration.spec.ts`, siguiendo el precedente de la 127):

- **Dedupe previo.** Conservar la fila más antigua por `(purchase_request_line_id, awarded_party_ref_id)`.
  Si existen duplicados con **distinto** proveedor sobre la misma línea, la migración **falla
  ruidosamente** listando los casos. Elegir por cuenta propia sería decidir a quién se le compra.
- `UNIQUE (tenant_id, purchase_request_line_id, awarded_party_ref_id)` → `uq_pr_line_awards_line_party`.
  **Tres columnas, no dos**: la clave por dos columnas rompería la capacidad vigente de repartir
  cantidad entre proveedores en solicitudes `PROJECT`.
- `CHECK (awarded_quantity > 0)` → `chk_pr_line_awards_qty_positive`.
- Columnas nullables `unit_cost numeric(14,2)` y `currency varchar(3)`.
- Índice `(tenant_id, awarded_party_ref_id)`.
- **Backfill (ADR-087 (propuesto), D4):** devolver a `APPROVED` toda solicitud en `CONVERTED_TO_PO` que conserve
  líneas en `OPEN | PENDING_QUOTE | AWARDED`. Ejecutar conteo previo por tenant y registrarlo en el
  informe.
- `down` reversible para constraints, columnas e índice. **El backfill no se revierte** — documentarlo
  en el propio archivo.
- Actualizar `packages/database/src/entities/purchase-request-line-award.entity.ts`; deben pasar
  `migration-order.spec.ts` y `migration-parity.util.spec.ts`.

**Helper nuevo `apps/api/src/modules/inventory/utils/purchase-request-award-coverage.ts`**, puro y sin
acceso a repositorio, calcado de `purchase-request-fulfillment.ts`: `resolveAwardCoverage(lines)` y
`resolvePurchaseRequestConversion(lines)`. Excluir del cálculo las líneas `CANCELLED` y `REJECTED`.

**`purchasing.service.ts` — `createPurchaseOrderFromRequest`:** sustituir el
`request.status = CONVERTED_TO_PO` incondicional de **ambos** caminos de salida por el recálculo con
`resolvePurchaseRequestConversion`, dentro de la misma transacción. La guarda de entrada que exige
`APPROVED` **no se toca**.

**`purchasing.service.ts` — `createSingleOrder`:** rechazar con `ORDER_EXCEEDS_AWARD` cuando
`cantidadYaOrdenada + cantidadSolicitada > cantidadAdjudicada` para esa línea y proveedor. Marcar
`lineStatus = ORDERED` **solo** cuando el acumulado alcanza lo adjudicado; en caso contrario la línea
permanece en `AWARDED`.

### 3.3 AI-SR-FULL — Track BE-2: superficie de contrato (requiere ADR-087 (propuesto) aprobado)

**`createLineAwards`:** validar el `supplierQuoteId` recibido — que la cotización pertenezca a esa
solicitud, que sea del mismo `awardedPartyRefId` y que exista fila en `supplier_quote_lines` para ese
producto; congelar `unit_cost` y `currency` en el award. Volver el método **idempotente**: mismo
proveedor, misma cantidad y misma cotización → no-op con éxito; proveedor distinto sobre una línea ya
adjudicada en tipos no-`PROJECT` → 409 `AWARD_PARTY_CONFLICT`.

**`DELETE /purchasing/requests/:id/awards/:awardId`** en `purchasing.controller.ts`, permiso
`inventory.purchasing.manage`, junto al `POST` existente. Rechaza con `AWARD_ALREADY_ORDERED` si hay
línea de orden viva; devuelve la línea a `PENDING_QUOTE` si la solicitud tiene cotizaciones, o a
`OPEN` si no; recalcula la cobertura.

**Costo unitario derivado (spec §6.4):** en `createSingleOrder`, resolver por precedencia —
`award.unit_cost` → fila de `supplier_quote_lines` de `(award.supplierQuoteId, requestLineId)` →
valor del cliente **solo** si el award no tiene cotización vinculada. Si el cliente envía un valor que
difiere del resuelto en más de un céntimo → `UNIT_COST_MISMATCH`. La moneda de la orden debe coincidir
con la del award.

**`purchasing-query.service.ts`:** adjuntar `awardCoverage` en `getRequestDetail` y en `listRequests`.
En el listado debe resolverse con **una sola consulta agregada**, como ya hace `fulfillmentStatus` —
nunca una consulta por solicitud.

**Enum:** `packages/shared/src/enums/inventory/purchase-request-award-coverage.enum.ts`.

**Test-guarda obligatorio** en `purchasing-policy.service.spec.ts` que congele el comportamiento de
`validateLineAward`, para que ninguna sesión futura la «arregle» de paso.

### 3.4 AI-FE-PLATFORM — Tracks FE-1, FE-2 y FE-3

**FE-1 (arranca en paralelo con BE-1, en cuanto exista T0):** `award-matrix.ts` + `award-matrix.spec.ts`
con las siete funciones del contrato §5.3. **Cero React.** Aquí vive el grueso de la cobertura. La
invariante a garantizar: un `purchaseRequestLineId` aparece como máximo una vez en el resultado de
`toCreateAwardsDto`.

**FE-2:** `AwardMatrixPanel.tsx`, `AwardMatrixTable.tsx` (fila memoizada como
`StockIssueDraftLinesTable`), `AwardQuoteAccordion.tsx` y `AwardSelectionBar.tsx`, cada uno con su
`.spec.tsx`. Respetar literalmente el contrato congelado §5 y el contrato de accesibilidad §8.

**FE-3 (requiere BE-2):**
- `PurchaseRequestWorkbenchDrawer.tsx`: el tab `awards` renderiza `AwardMatrixPanel`; migrar
  `awardDrafts` al modelo nuevo. El identificador de tab en `purchase-workbench.ts` **no cambia**.
- `InventoryClient.tsx`: `handleCreateAwards` adaptado + `handleRevokeAward` nuevo.
- `lib/api-client.ts`: `revokeAward`.
- `purchase-workbench.ts`: `getPurchaseNextAction` consciente de `awardCoverage`.
- `purchase-orders-from-awards.ts`: guarda de moneda y **eliminación del fallback silencioso a costo
  cero**.
- `QuoteComparisonPanel.tsx`: props opcionales `requestLines` e `items` para mostrar nombre y SKU; CTA
  de salto a la matriz con la columna enfocada (patrón `line-focus.ts`).
- **Eliminar** `AwardLinesPanel.tsx` y `AwardLinesPanel.spec.tsx`, preservando la escotilla de spec §7.

### 3.5 AI-SR-QA

Integraciones Supertest escritas contra el contrato congelado, en paralelo con BE-2. E2E Playwright al
final, en `e2e/tests/portal-inventory-purchasing-awards.spec.ts`. Pasada axe sobre matriz y acordeón.

### 3.6 AI-SEC-ENG

Review de la superficie nueva: el `DELETE` de awards (autorización, tenant isolation, ausencia de
IDOR entre tenants), y confirmación de que ningún log emite payloads de cotización ni identificadores
de proveedor en claro.

### 3.7 Documentar desvíos

Todo desvío respecto a este prompt o a la spec congelada se registra en el informe de fase con causa y
alternativa evaluada. Un desvío no documentado es defecto bloqueante en G5.

---

## 4. Restricciones no negociables

1. **Modulith:** sin acceso directo a tablas de otro módulo; comunicación por interfaces tipadas o
   eventos. El portal no importa nada de `apps/api`.
2. **Multi-tenancy:** aislamiento por schema PostgreSQL; nunca hardcodear tenant ni schema; toda
   operación dentro de `runInTenantSchema` + `withTransaction`, con `SET LOCAL search_path` por
   transacción.
3. **`validateLineAward` no se modifica.** Es decisión explícita del CTO.
4. **`PurchaseRequestStatus` no se amplía.** ADR-087 (propuesto), D2.
5. **UNIQUE de tres columnas**, incluyendo `awarded_party_ref_id`. Dos columnas sería una regresión.
6. **Migraciones a mano**, numeradas y reversibles. No existe `migration:generate`. `@iwana/db` se
   compila antes de ejecutar migraciones.
7. **Sin PII ni credenciales** en código, tests, logs ni documentación.
8. **TypeScript estricto**, sin `any` explícito, sin promesas flotantes, sin imports circulares.
9. **`@Roles()` con `UserRole.*`**, nunca literales.
10. **Texto visible en español**, sentence case, sin enums crudos en pantalla.
11. **Tailwind v4 CSS-first**: no añadir `tailwind.config.js`.
12. **pnpm exclusivamente.**
13. **No omitir tests ni documentación** para cerrar antes.

---

## 5. Entregables tecnicos obligatorios

| Entregable | Detalle |
| --- | --- |
| Contrato compartido | `packages/shared/src/contracts/inventory/purchase-award-matrix.contract.ts` + export en el índice |
| Enum | `packages/shared/src/enums/inventory/purchase-request-award-coverage.enum.ts` |
| Migración tenant | `128_harden_purchase_request_line_awards.ts` + `.spec.ts` + `.integration.spec.ts` |
| Entidad | `purchase-request-line-award.entity.ts` actualizada |
| Helper backend | `utils/purchase-request-award-coverage.ts` + spec |
| Servicios | `purchasing.service.ts`, `purchasing-query.service.ts` |
| Controlador | `purchasing.controller.ts` — `DELETE` de awards |
| OpenAPI | Actualizada para el endpoint nuevo y los campos nuevos de respuesta |
| Portal — lógica | `award-matrix.ts` + spec |
| Portal — componentes | `AwardMatrixPanel`, `AwardMatrixTable`, `AwardQuoteAccordion`, `AwardSelectionBar` + specs |
| Portal — cableado | Drawer, `InventoryClient`, `api-client`, `purchase-workbench`, `purchase-orders-from-awards`, `QuoteComparisonPanel` |
| Eliminación | `AwardLinesPanel.tsx` + `.spec.tsx` |
| E2E | `e2e/tests/portal-inventory-purchasing-awards.spec.ts` |

---

## 6. Entregables documentales obligatorios

1. **Informe de fase:** `docs/informes/INFORME-MOD12-COMPRAS-ADJUDICACION-MATRIZ-FASE-30-v1.0.md` —
   entregables, evidencia de gates, conteo real de pruebas, cobertura, deuda por severidad, blockers,
   decisiones que requieren CTO, y **conteo de solicitudes rescatadas por el backfill, por tenant**.
2. **Evidencia de calidad** en `docs/quality/`: salida de `pnpm test` con `Cached: 0`, reporte axe,
   evidencia E2E.
3. **Adenda al PRD** `PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`: registrar el eje de selección por
   cotización bajo RF-CMP-06. **No crear PRD nuevo** — el requisito no cambia, se precisa.
4. **Marcar como superada** la sección de interfaz de
   `docs/specs/2026-07-17-mod12-compras-oc-multiproveedor-adjudicacion-fase20-design.md`; su modelo de
   datos sigue vigente. No dejar dos specs de pantalla contradictorias.
5. **Decisión stop/go** al cierre.

Si esta fase requiere corrección posterior, se **actualiza el informe vigente**; no se crea uno nuevo.

---

## 7. Criterios de aceptacion

- **CA-301** — P1 y P3 al proveedor 1, P2 y P4 al proveedor 2 genera **dos órdenes de compra**, cada una con sus dos productos y los costos derivados de la cotización.
- **CA-302** — Adjudicar 2 de 4 productos y generar la orden deja la solicitud en `APPROVED` con `awardCoverage = PARTIALLY_ORDERED`; la segunda tanda se emite sin bloqueo.
- **CA-303** — El mismo producto no puede quedar adjudicado a dos proveedores en tipos no-`PROJECT`: 409 `AWARD_PARTY_CONFLICT`.
- **CA-304** — `supplierQuoteId` de otra solicitud, de otro proveedor, o sin línea para ese producto → 400 con el código correspondiente.
- **CA-305** — Cantidad ordenada superior a la adjudicada → 400 `ORDER_EXCEEDS_AWARD`.
- **CA-306** — Doble `POST /awards` con el mismo payload produce un solo award.
- **CA-307** — Revocar un award sin orden viva devuelve la línea a `PENDING_QUOTE`; con orden viva → 409 `AWARD_ALREADY_ORDERED`.
- **CA-308** — El costo unitario de la orden proviene del servidor; un valor divergente del cliente → `UNIT_COST_MISMATCH`. Ninguna orden se crea con costo cero por falta de dato.
- **CA-309** — La migración 128 deduplica awards triviales, **falla ruidosamente** ante duplicados con distinto proveedor, rescata las solicitudes varadas y su `down` deja el esquema limpio.
- **CA-310** — `validateLineAward` conserva su comportamiento exacto, verificado por test-guarda.
- **CA-311** — Se cumplen los diez criterios de UX de la spec §11, incluida la pasada axe sin violaciones.
- **CA-312** — `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde con **`Cached: 0`**; cobertura ≥80% en el núcleo tocado.

---

## 8. Criterio de stop/go

**Detenerse si:**

- ADR-087 (propuesto) no está aprobado y el trabajo llega a BE-2 (BE-1 sí puede avanzar).
- La migración 128 encuentra awards duplicados con **distinto proveedor** sobre la misma línea: no
  resolver por cuenta propia, emitir `[BLOQUEO]` con el listado.
- El conteo previo revela un volumen de solicitudes varadas que exija ventana de mantenimiento
  acordada.
- Cumplir un criterio de aceptación exigiría modificar `validateLineAward` o ampliar
  `PurchaseRequestStatus`: eso contradice el alcance y es `[BLOQUEO]`, no una decisión de track.
- Aparece una necesidad de cambiar el contrato congelado: emitir adenda versionada, nunca parchear.

**Documentar causa en:** `docs/informes/INFORME-MOD12-COMPRAS-ADJUDICACION-MATRIZ-FASE-30-v1.0.md`.
**Escalar a:** AI-EM-ARCH; y al CTO si toca stack, seguridad, cumplimiento o deuda crítica.
**Recomendación esperada:** una posición decidible, no un menú de opciones.

---

## 9. Criterio de salida de la fase

- **Backend:** defecto de solicitud varada cerrado y cubierto por test de regresión; `awardCoverage` expuesto en detalle y listado; endpoint de revocación operativo; costo unitario derivado en servidor.
- **Frontend:** matriz y acordeón en producción; `AwardLinesPanel` eliminado sin regresión funcional; escotilla de proveedor sin cotización preservada.
- **Base de datos:** migración 128 aplicada y reversible; backfill ejecutado con conteo registrado.
- **Tests:** unit, integración y E2E en verde con conteo real declarado (`Cached: 0`); cobertura ≥80% en el núcleo tocado; pasada axe sin violaciones.
- **Documentación:** informe de fase archivado; adenda al PRD; spec de Fase 20 marcada como superada en su sección de interfaz; `pnpm audit:adr-citations` en `BLOQUEANTE: 0` y `pnpm audit:doc-locations` en verde.
- **Gates:** G5 y G6 registrados. **G6.5 exige corrida Linux de CI identificada por SHA** — correr los gates en local satisface G6, no G6.5. Esta fase **acumula además los G6.5 pendientes de las fases 28 y 29**.
