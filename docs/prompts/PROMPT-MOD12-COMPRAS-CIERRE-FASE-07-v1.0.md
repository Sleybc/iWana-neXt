# PROMPT - MOD12 Compras: Edicion de solicitud y ciclo de vida de la OC (Fase 07)

**Version:** 1.0
**Estado:** Propuesto (requiere GO del CTO)
**Fecha:** 2026-07-14
**Modo activo:** Ejecucion
**Generado por:** AI-EM-ARCH
**Aprobado por:** (pendiente CTO)
**Ejecutor:** Sr. Dev Fullstack (AI-SR-FULL) + Frontend Platform (AI-FE-PLATFORM)
**Archivo destino:** `docs/prompts/PROMPT-MOD12-COMPRAS-CIERRE-FASE-07-v1.0.md`
**Habilitada por:** Cierre formal de Fase 06 (ADR-016) — ver `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-FASE-06-AUDITORIA-ARCH-v1.0.md` (G7 aprobado 2026-07-14).

---

## 1. Objetivo exacto

Completar dos capacidades declaradas como deuda en `PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0` §Fase 07: (a) permitir **editar** una solicitud de compra (cabecera y lineas) mientras aun no tiene cotizaciones ni adjudicaciones, y (b) activar el **ciclo de vida de la orden de compra** (`approve`/`cancel`/`close`) usando los estados de `PurchaseOrderStatus` hoy inertes (`DRAFT`, `PENDING_APPROVAL`, `CANCELLED`, `CLOSED`). Sin abrir capacidades fuera de este alcance (reabastecimiento y metricas de proveedor son Fase 08/09).

## 2. Artefactos de entrada obligatorios

- `AGENTS.md`
- `docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md`, `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`
- `docs/prds/PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md` (§Fase 07, RF-07-01/02, modelo de datos)
- `docs/prompts/PROMPT-MOD12-COMPRAS-CIERRE-FASE-06-v1.0.md` (precedente directo: patrones de migracion aditiva, DTOs Zod, `resolvePurchaseRequest`, seguridad)
- `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-FASE-06-AUDITORIA-ARCH-v1.0.md` (leccion I-2: **un PR/commit por fase**, no mezclar con otras lineas)
- `docs/security/SECURITY-REVIEW-MOD12-COMPRAS-CIERRE-FASE-06-v1.0.md` (patron de revision de seguridad esperado para el cambio de schema `068`)
- `.github/instructions/api.instructions.md`, `database.instructions.md`, `frontend.instructions.md`, `portal.instructions.md`, `testing.instructions.md`
- **Skills a leer y aplicar** (`.agents/skills/`): `nestjs-expert`, `database-migration`, `postgresql`, `openapi-spec-generation`, `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `i18n-localization`, `wcag-audit-patterns`, `testing-patterns`, `e2e-testing-patterns`, `backend-security-coder`, `frontend-security-coder`.
- **Referencia de reuso — backend:** `apps/api/src/modules/inventory/services/purchasing.service.ts` (`createPurchaseRequest` para el patron de lineas; `resolvePurchaseRequest`/`reject`/`cancel` como patron de helper compartido con guardas de estado; `createSingleOrder` y `requirePurchaseOrder` — linea 504 — para el ciclo de OC), `purchasing.controller.ts`, `dto/index.ts` (`CreatePurchaseRequestSchema`, `PurchaseOrderLineSchema`, `CreatePurchaseOrderSchema` — este ultimo **ya acepta** un campo `status` opcional sin restringir valores, hoy solo usado con default `APPROVED`).
- **Referencia de reuso — datos:** `packages/database/src/entities/purchase-order.entity.ts` (sin columnas de resolucion — a diferencia de `purchase-request.entity.ts` tras la `067`), `packages/database/src/migrations/tenant/067_add_purchase_request_resolution.ts` (patron exacto a replicar para `068`), `packages/database/src/migrations/tenant/runner.ts`.
- **Referencia de reuso — portal:** `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx` (ya soporta `presentation: 'create-mode'`; extender para modo edicion), `PurchaseOrderDrawer.tsx`, `PurchaseRequestWorkbenchDrawer.tsx` (pestana `orders`), `purchase-workbench.ts`, `InventoryClient.tsx`; `apps/portal/src/lib/api-client.ts` (`purchasingApi`).
- **Enums:** `packages/shared/src/enums/inventory/purchase-order-status.enum.ts`, `purchase-request-status.enum.ts`.

## 3. Alcance exacto

### 3.1 Edicion de solicitud (RF-07-01)

**Backend**
- `PATCH purchasing/requests/:id` con `UpdatePurchaseRequestSchema` (Zod): campos editables de cabecera — `title`, `priority`, `requestingArea`, `justification`, `neededByDate`, `notes`; y `lines` (reemplazo completo: eliminar lineas ausentes del payload, actualizar existentes por `id`, insertar nuevas — mismo shape que `CreatePurchaseRequestSchema.lines`).
- **Decision de arquitectura (no negociable):** `requestType` y `requestNumber` **son inmutables** tras la creacion. Cambiar `requestType` alteraria retroactivamente la politica de aprobacion (`PurchasingPolicyService`) de una solicitud ya en curso — riesgo de inconsistencia. Si el usuario necesita otro tipo, debe crear una nueva solicitud.
- **Guarda de edicion:** permitido **solo si** `status ∈ {DRAFT, PENDING_QUOTES}` **y** no existen `SupplierQuote` ni `PurchaseRequestLineAward` asociados a la solicitud (conteo en la misma transaccion). Fuera de esas condiciones → `BadRequestException` en espanol ("La solicitud no admite edicion en su estado actual." / "La solicitud ya tiene cotizaciones o adjudicaciones registradas.").
- `PurchasingService.updatePurchaseRequest(id, input, actor)`: patron `runInTenantSchema` + `withTransaction` + `requirePurchaseRequest`, igual que `resolvePurchaseRequest`.

**Frontend**
- Extender `PurchaseRequestComposer.tsx` con un modo edicion (reutilizar el componente existente; no duplicar formulario) que precarga `detail.request` + `detail.lines` y llama a `purchasingApi.updateRequest`.
- Boton "Editar solicitud" en el workbench (`PurchaseRequestWorkbenchDrawer.tsx`, pestana `summary` o `lines`), visible solo cuando la guarda de edicion se cumple (usar `detail.request.status` + `detail.quotes.length === 0` + `detail.awards.length === 0`, ya disponibles en `PurchaseRequestDetailRecord`).

### 3.2 Ciclo de vida de la Orden de Compra (RF-07-02)

**Backend**
- Migracion tenant `068_add_purchase_order_resolution.ts` (aditiva, reversible, mismo patron que `067`): `purchase_orders` + `cancellation_reason TEXT NULL`, `cancelled_by_user_id UUID NULL`, `closed_by_user_id UUID NULL`. Registrar en `runner.ts` tras `067`. Actualizar `purchase-order.entity.ts`.
- DTOs Zod: `CancelPurchaseOrderSchema { reason: string ≥5 }`. `approve` y `close` no requieren body.
- `PurchasingService`:
  - `approvePurchaseOrder(id, actor)`: `PENDING_APPROVAL → APPROVED`; setea `approvedByUserId` (columna ya existente).
  - `cancelPurchaseOrder(id, input, actor)`: permitido desde `DRAFT`/`PENDING_APPROVAL`/`APPROVED` **solo si ninguna linea de la OC tiene `receivedQuantity > 0`** (una OC con recepcion parcial no se cancela: debe cerrarse via el flujo de recepcion); `BadRequestException` en espanol si no cumple. Setea `cancellationReason`/`cancelledByUserId`.
  - `closePurchaseOrder(id, actor)`: permitido solo desde `FULLY_RECEIVED → CLOSED`; setea `closedByUserId`.
- **Restriccion sobre creacion de OC (ajuste, no reescritura):** `CreatePurchaseOrderSchema.status` ya es un campo libre con default `APPROVED` — **acotar sus valores permitidos a `{APPROVED, PENDING_APPROVAL}` unicamente** (rechazar `DRAFT`/`CANCELLED`/`CLOSED`/`PARTIALLY_RECEIVED`/`FULLY_RECEIVED` como estado de creacion). El default se mantiene `APPROVED` para no alterar el comportamiento vigente de generacion+recepcion.
- `purchasing.controller.ts`: `POST orders/:id/approve`, `POST orders/:id/cancel`, `POST orders/:id/close`, `@Roles(ADMIN, NOC, SUPPORT)`, `@ApiOperation`.

**Frontend**
- `purchasingApi.approveOrder(id)`, `cancelOrder(id, dto)`, `closeOrder(id)` en `api-client.ts`.
- Pestana "Órdenes" del workbench (`PurchaseRequestWorkbenchDrawer.tsx`) y/o `PurchaseOrderDrawer.tsx`: mostrar acciones contextuales por estado de cada OC listada (`detail.orders`) — "Aprobar OC" si `PENDING_APPROVAL`; "Cancelar OC" (con motivo, mismo patron de textarea que Fase 06) si `DRAFT/PENDING_APPROVAL/APPROVED` y sin recepcion; "Cerrar OC" si `FULLY_RECEIVED`.

### No entra

- Reabastecimiento por punto de reorden (Fase 08); metricas de proveedor (Fase 09).
- Edicion de `requestType`, `requestNumber`, o de una solicitud con cotizaciones/adjudicaciones.
- Cancelacion de OC con recepcion parcial (queda fuera; se maneja por el flujo de recepcion existente).
- Cualquier migracion adicional a `068`; cualquier endpoint no listado arriba.

## 4. Restricciones no negociables

1. Multi-tenant estricto: `TenantContext.getOrThrow()` + `runInTenantSchema`; tenant desde JWT.
2. Boundaries Modulith: sin acceso directo a tablas de otros modulos; sin imports circulares.
3. Migracion `068` **aditiva y reversible** (`up`/`down`); numeracion `068` verificada libre; registrada en `runner.ts`.
4. `requestType`/`requestNumber` **inmutables** en la edicion (decision de arquitectura de este prompt, no se relaja sin escalar a AI-EM-ARCH).
5. La guarda de edicion (sin cotizaciones/adjudicaciones, estado `DRAFT`/`PENDING_QUOTES`) y la guarda de cancelacion de OC (sin recepcion) se verifican **dentro de la misma transaccion** que la mutacion (evitar TOCTOU).
6. Toda operacion CUD auditada por `AuditInterceptor`; cancelacion de OC persiste actor y motivo; sin PII/secretos en logs.
7. `@Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)` (miembros del enum, no literales).
8. Textos visibles y comentarios de negocio en espanol, sentence case; sin enums crudos ni `partyRefId` en UI; contraste AA.
9. No romper el flujo de creacion/recepcion de OC vigente (Fase 06 cerrada): el default `APPROVED` en creacion se preserva.
10. **Higiene de commit (leccion Fase 06 / hallazgo I-2):** el PR/commit de esta fase debe contener **unicamente** los archivos de Fase 07. No mezclar con trabajo de otras lineas del repo.
11. No introducir dependencias nuevas ni patrones avanzados (CQRS/eventos) — fuera de baseline.

## 5. Entregables tecnicos obligatorios

- **Database:** migracion `068`; entidad `PurchaseOrder` con las tres columnas; registro en `runner.ts`.
- **Backend:** `UpdatePurchaseRequestSchema` + `PurchasingService.updatePurchaseRequest`; `CancelPurchaseOrderSchema` + `approve/cancel/closePurchaseOrder`; ajuste de `CreatePurchaseOrderSchema.status` a enum acotado; endpoints en `purchasing.controller.ts`; OpenAPI.
- **Frontend:** modo edicion en `PurchaseRequestComposer.tsx` + boton en el workbench; acciones de ciclo de vida de OC en la pestana "Órdenes"/`PurchaseOrderDrawer.tsx`; cliente `purchasingApi` (4 metodos nuevos).
- **Tests:** unit `PurchasingService.updatePurchaseRequest` (permitido/denegado por estado, por existencia de cotizaciones/adjudicaciones, inmutabilidad de `requestType`); unit `approve/cancel/closePurchaseOrder` (transiciones permitidas/denegadas, guarda de recepcion en cancel); integracion HTTP de los 4 endpoints nuevos; frontend (composer en modo edicion, botones de ciclo de vida de OC); E2E portal (editar solicitud en borrador; aprobar→cancelar OC; cerrar OC recibida). Cobertura core ≥80%.

## 6. Criterio stop/go

- **GO** condicionado a aprobacion del CTO (impacto de schema + release), igual que Fase 06.
- **STOP** y escalar a AI-EM-ARCH si aparece necesidad de: permitir editar `requestType`, permitir cancelar una OC con recepcion parcial, o relajar la guarda de edicion (cotizaciones/adjudicaciones existentes).
- **Revision de seguridad obligatoria** antes del merge (cambio de schema `068`), documentada en `docs/security/` siguiendo el patron de `SECURITY-REVIEW-MOD12-COMPRAS-CIERRE-FASE-06-v1.0.md` (revision formal AI-SEC-ENG si esta disponible; si no, revision equivalente por AI-SR-FULL con el mismo checklist, aceptada como control compensatorio).

## 7. Entregables documentales obligatorios

- Informe de fase `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-FLUJO-FASE-07-v1.0.md` al cierre.
- Security review en `docs/security/` (ver §6).
- Checklist en `docs/quality/CHECKLIST-MOD12-COMPRAS-CIERRE-FLUJO-FASE-07-v1.0.md`.
- Actualizar el PRD (`PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md`, tabla de roadmap) solo si hubo desvio aprobado.

## 8. Definicion de hecho (DoD)

- Lint + typecheck + tests verdes; cobertura core ≥80%.
- Migracion `068` aplica y revierte.
- Edicion de solicitud verificada: permitida en `DRAFT`/`PENDING_QUOTES` sin cotizaciones/adjudicaciones; bloqueada (400 en espanol) en cualquier otro caso; `requestType`/`requestNumber` no editables.
- Ciclo de vida de OC verificado: `approve` (`PENDING_APPROVAL→APPROVED`), `cancel` (con motivo, bloqueado si hay recepcion), `close` (`FULLY_RECEIVED→CLOSED`); creacion de OC acotada a `{APPROVED, PENDING_APPROVAL}`.
- OpenAPI actualizada; cliente del portal alineado; vocabulario espanol; sin enums crudos ni `partyRefId` en UI.
- Boundaries y multi-tenancy verificados; auditoria activa; sin PII/secretos en logs.
- **Commit/PR acotado a Fase 07** (verificar `git show --stat` antes de proponer merge).
- Informe vivo de Fase 07 y checklist creados.
