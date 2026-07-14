# INFORME — MOD12 Compras Cierre Flujo Fase 06 v1.0

**Estado:** Cerrado técnicamente — pendiente G7 CTO (GO merge)  
**Fecha:** 2026-07-14  
**Prompt:** `docs/prompts/PROMPT-MOD12-COMPRAS-CIERRE-FASE-06-v1.0.md`  
**Plan:** `docs/plans/2026-07-14-mod12-compras-cierre-fase-06.md`  
**Auditoría G6:** `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-FASE-06-AUDITORIA-ARCH-v1.0.md`  
**Ejecutores:** AI-SR-FULL + AI-FE-PLATFORM (Protocolo Multiagente v1.2 §3bis)  
**GO merge:** CTO (schema + release) + revisión AI-SEC-ENG

## Resumen

Se cerró el flujo núcleo “Trabajar solicitud”: adjudicación en UI, rechazo/cancelación con cascada RFQ, afirmación positiva de estados terminales y pulido del workbench. Se **conservó** el parcial backend §3.2 ya presente en el árbol (decisión 2026-07-14) y se remedió la auditoría G6 (I-1, deuda menor, acotación de PR).

## Remediación G6 (post-auditoría)

| Hallazgo | Resolución |
| --- | --- |
| **I-1** afirmación terminal | Banner `Estado de la solicitud` (variant success, sin CTA) para `REJECTED` / `CANCELLED` / `CONVERTED_TO_PO` recibida vía `PurchaseNextAction.terminal` |
| **I-2** árbol mezclado | Allowlist de archivos Fase 06 abajo — el PR **no** debe incluir comercial/settings/parties/proveedores/roles históricos |
| Rama muerta `isLineFullyAwarded` | Eliminada (mismo predicado qty) |
| Warning `act()` en test reject | Interacciones wrappeadas en `act()` |
| Informe de cierre | Este documento |

## Allowlist Fase 06 (I-2 — única superficie del PR)

### Database / shared
- `packages/database/src/migrations/tenant/067_add_purchase_request_resolution.ts`
- `packages/database/src/migrations/tenant/runner.ts` (solo registro 067)
- `packages/database/src/entities/purchase-request.entity.ts` (`resolutionReason` / `resolvedByUserId`)

### API inventory/purchasing
- `apps/api/src/modules/inventory/dto/index.ts` (Reject/Cancel DTOs)
- `apps/api/src/modules/inventory/purchasing.controller.ts`
- `apps/api/src/modules/inventory/services/purchasing.service.ts`
- `apps/api/src/modules/inventory/services/purchasing-query.service.ts`
- `apps/api/src/modules/inventory/services/rfq.service.ts` (`cancelActiveForRequest`)
- `apps/api/src/modules/inventory/tests/purchasing.service.spec.ts`
- `apps/api/src/modules/inventory/tests/purchasing.http.integration.spec.ts`

### Portal
- `apps/portal/src/lib/api-client.ts` (reject/cancel/awards/displayName)
- `apps/portal/src/components/inventory/purchase-workbench.ts` (+ spec)
- `apps/portal/src/components/inventory/AwardLinesPanel.tsx` (+ spec)
- `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx`
- `apps/portal/src/components/inventory/PurchaseWorkspace.tsx`
- `apps/portal/src/components/inventory/InventoryClient.tsx` (+ spec; solo handlers Fase 06)
- `apps/portal/src/components/inventory/RfqInvitationsPanel.tsx`
- `apps/portal/src/components/inventory/inventory-labels.ts` (`PURCHASE_CURRENCY_OPTIONS`)
- `e2e/tests/portal-inventory-scm.spec.ts` (mocks + casos Fase 06)

### Docs
- `docs/prompts/PROMPT-MOD12-COMPRAS-CIERRE-FASE-06-v1.0.md`
- `docs/plans/2026-07-14-mod12-compras-cierre-fase-06.md`
- `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-FLUJO-FASE-06-v1.0.md`
- `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-FASE-06-AUDITORIA-ARCH-v1.0.md`
- `docs/quality/CHECKLIST-MOD12-COMPRAS-CIERRE-FLUJO-FASE-06-v1.0.md`

### Excluir explícitamente del PR
- `apps/**/commercial/**`, dashboard comercial, catálogo settings borrado
- `apps/api/src/modules/parties/**`, supplier-profile / proveedores alta
- Docs proveedores Fase 05, identity manuals, roles históricos
- `apps/api/dist/**`

## Entregables técnicos

### Database
- Migración tenant `067` aditiva/reversible: `resolution_reason`, `resolved_by_user_id`

### Backend
- Reject/cancel + cascada RFQ; OpenAPI; awards query sin N+1; `displayName` batch en invitaciones

### Portal
- Pestaña Adjudicación; reject/cancel UI; moneda; declinación; banner terminal

## Evidencia de verificación

| Comando | Resultado |
| --- | --- |
| Jest purchasing + HTTP + rfq | **36/36 PASS** |
| Cobertura líneas (purchasing.service / rfq.service / query) | **82.41%** conjunto; purchasing.service **80.68%**; rfq **88%** |
| Jest portal AwardLines + workbench | **12/12 PASS** |
| InventoryClient reject (post-`act`) | PASS |
| Typecheck api + portal | OK |
| Playwright Fase 06 | **4/4 PASS** (~7.6 s) |
| Lint scoped inventory Fase 06 | **OK** (max-warnings 0) |

## Revisión de seguridad (schema 067) — AI-SR-FULL interim

> Subagente `security-review` no disponible en la sesión (límite de uso). Dictamen interim pendiente de confirmación AI-SEC-ENG.

| Control | Evidencia |
| --- | --- |
| Multi-tenant | `TenantContext.getOrThrow` + `runInTenantSchema` en reject/cancel |
| Autorización | `@Roles(UserRole.ADMIN, NOC, SUPPORT)` en endpoints |
| Input validation | Zod min reason 10/5; whitelist ValidationPipe global |
| Sin PII en migración | Columnas UUID actor + texto de motivo de negocio (no secreto) |
| Cascada acotada | Solo RFQ activa del `purchaseRequestId` + invitaciones INVITED |
| Boundaries | Sin acceso a tablas Parties; displayName vía `SupplierPartyPort` |
| Reversibilidad | `down()` DROP COLUMN IF EXISTS |

**Riesgo residual:** texto libre `resolution_reason` puede contener dato personal si el operador lo escribe — misma clase que `exceptionReason`/`notes` existentes; mitigación operativa (no loguear el body).

## DoD → G7

| Criterio | Estado |
| --- | --- |
| I-1 afirmacion terminal | Resuelto |
| I-2 PR acotado | Allowlist documentada — aplicar al crear commit/PR |
| Tests + typecheck | Cubierto |
| E2E Fase 06 | 4/4 |
| Lint + cobertura ≥80% | **Cumple** (conjunto 82.41% líneas; purchasing.service 80.68%) |
| SEC-ENG formal | **Pendiente** (interim arriba; re-lanzar cuando haya cuota) |
| GO CTO | **Pendiente** |

## Fuera de alcance

Fase 07–09; RBAC nuevo; relajar `validateLineAward`.
