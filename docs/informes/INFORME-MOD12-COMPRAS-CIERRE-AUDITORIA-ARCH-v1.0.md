# INFORME — MOD12 Compras cierre auditoría arquitectónica v1.0

**Estado:** Cerrado con remedación menor  
**Fecha:** 2026-07-11  
**Commit base:** `789ac092` (remedación + deuda residual)  
**Referencia:** ADR-050, ADR-051  

## Veredicto original

Conforme, apto para cierre con deuda menor declarada (AI-EM-ARCH, 2026-07-11).

## Remedación aplicada

| # | Hallazgo | Severidad | Acción |
| --- | --- | --- | --- |
| 1 | Mostrador: lotes/activos antes de deduplicación ledger | LOW | `pg_advisory_xact_lock(hashtext(idempotencyKey))` en `CounterPurchaseService` antes de crear lotes |
| 2 | RFQ `createFromRequest` / `invite` race → 500 | LOW | Captura `23505` → `ConflictException` o re-fetch idempotente en `invite()` |
| 3 | RFQ transiciones sin actor en entidad | MINOR | Migración `061`: `sent_by_user_id`, `closed_by_user_id`, `declined_by_user_id` |
| 4 | `down()` enum `058` frágil si crece uso del tipo | NOTE | Nota de mantenimiento en ADR-050 |
| 5 | Drift plan vs `SupplierMultiPicker` | NOTE | Plan Fase 04 actualizado; componente existe y lo usa `RfqInvitationsPanel` |

## Verificación post-remedación

| Comando | Resultado |
| --- | --- |
| `pnpm db:migrate:all` | OK (migración `061` aplicada en tenant dev) |
| `pnpm --filter @iwana/api lint` | OK |
| `pnpm --filter @iwana/api typecheck` | OK |
| Unit inventario (counter-purchase, rfq, rfq-pdf, util) | 23/23 OK |
| HTTP integration (`counter-purchase`, `rfq`) | 3/3 OK |
| Suite inventario completa | 127/127 OK |
| Cobertura servicios remedidos (stmts / lines) | 85.89% / 85.8% (≥80%) |

## Remedación deuda residual (2026-07-11)

| # | Deuda | Acción |
| --- | --- | --- |
| 1 | `invite()` sin actor invitador | Migración `062`: `invited_by_user_id` en `purchase_rfq_invitations`; persistencia en `RfqService.invite()` |
| 2 | OpenAPI no verificado | Specs `purchasing.swagger.spec.ts` e `inventory.swagger.spec.ts` (RFQ + compra mostrador) |

## Verificación cierre deuda

| Comando | Resultado |
| --- | --- |
| `pnpm db:migrate:all` | OK (migración `062` aplicada en tenant dev) |
| `purchasing.swagger.spec.ts` + `inventory.swagger.spec.ts` | 3/3 OK |
| Unit `RfqService.invite` actor | OK |
| Suite inventario completa | 133/133 OK |

## Pendiente (delegado a CI, no bloqueante)

Estos gates no bloquean el cierre funcional del slice MOD12; quedan como evidencia formal en pipeline o entorno CI:

| Ítem | Alcance CI | Evidencia local previa (2026-07-11) |
| --- | --- | --- |
| E2E Playwright con DB levantada | Workflow E2E portal/inventario en runner Ubuntu con stack completo | `pnpm test:e2e:portal -- e2e/tests/portal-inventory-scm.spec.ts` → **19/19 OK** (~33 s) con API + portal activos |
| Cobertura exacta ≥80% módulos core | Job de coverage en CI (servicios remedidos MOD12) | Jest focalizado counter-purchase + RFQ + util → **87.5% stmts / 87.45% lines** |
| `pnpm lint` completo | Step `pnpm lint` en `.github/workflows/ci.yml` | **8/8 packages OK** (turbo, sin errores) |
| Publicación OpenAPI | Validar schema en `/api/v1/docs-json` post-build o artefacto exportado | Paths presentes: `/api/v1/inventory/counter-purchases`, `/api/v1/purchasing/rfqs/*`; specs `*.swagger.spec.ts` en verde |

**Nota:** el workflow `ci.yml` actual ejecuta lint + typecheck + build + migraciones; no incluye aún tests unitarios, coverage ni E2E portal inventario. La delegación documenta la trazabilidad hasta que esos jobs existan o se ejecuten manualmente en CI.

## Deuda residual

Ninguna en código. Validación formal pendiente solo en los gates CI listados arriba.
