# PROMPT — MOD11 · Gate de cierre por familia de resultado · v1.0

**Plan:** `docs/plans/2026-10-23-mod11-gate-cierre-por-resultado.md` · **Decisión:** `docs/adrs/ADR-099-Requisitos-de-Cierre-de-OT-por-Familia-de-Resultado.md`)
**Precondición:** G0 ✅ — ADR-099 aprobado por el CTO el 2026-10-23 con E1 = (a) y E2 = sí.

---

## §B1 — sr-backend

### Contexto mínimo

`ExecutionOrdersService.close()` (`apps/api/src/modules/tasks/services/execution-orders.service.ts`, bloque «Closure gate evaluation») evalúa todo el snapshot de la plantilla con cualquier resultado. Una OT de instalación (`INSTALACION_ESTANDAR` v3) no cierra como `NOT_EXECUTED` sin CPE `INSTALLED_AT_CUSTOMER`, dos fotos y un acta. Con `REQUIRES_FOLLOW_UP`, el requisito `PROVISIONING` falla siempre porque el puerto de MOD13 no se consulta. Lee ADR-099 completo antes de empezar.

### Qué construir

1. **Función pura** `selectRequirementsForResult(snapshot, result, { provisioningEnforced })` en `closure-gate-evaluator.service.ts` (exportada o como método público del servicio):
   - `EXECUTED`, `EXECUTED_WITH_OBSERVATIONS` y `REQUIRES_FOLLOW_UP`: todo el snapshot. Quita `PROVISIONING` solo si `provisioningEnforced === false`.
   - `NOT_EXECUTED`: lista vacía.
   - `CANCELLED`: no llega (lo rechaza `close()` antes). Devuelve la lista vacía por totalidad y documenta por qué.
   - Sustituye el filtro en línea `skipProvisioningRequirement` de `close()`. **No cambies** `getCompletion()`.
2. **E1.** Añade `REQUIRES_FOLLOW_UP` a la lista que consulta `serviceProvisioningReadPort.getGateStatus` en `close()`. Comentario en español que cite ADR-099 E1 y ADR-098 D5.
3. **Causa obligatoria (ADR-077 R1).** `result = NOT_EXECUTED` sin `reasonCode` no vacío → `422` `{ code: 'CLOSE_NOT_EXECUTED_REASON_REQUIRED', message: 'Elige una causa para cerrar como no ejecutada.' }`. Valida en el servicio, antes de abrir el recibo de idempotencia, igual que `CLOSE_RESULT_CANCELLED_REMOVED`. Mantén `CloseExecutionOrderSchema` `.strict()` y no cambies la forma del DTO. Actualiza la descripción OpenAPI de `reasonCode`.
4. **E2.** En `NOT_EXECUTED`, dentro de la transacción y con `excludeConfirmedReversals` aplicado: si queda algún consumo con `finalDisposition = INSTALLED_AT_CUSTOMER`, responde `422` `{ code: 'CLOSE_NOT_EXECUTED_HAS_INSTALLED_EQUIPMENT', message: 'Hay equipos registrados como instalados en el cliente. Revierte esos consumos antes de cerrar como no ejecutada.' }`. El copy es para usuario final: sin «OT», sin «snapshot» y sin códigos.
5. **Clientes.** Busca `NOT_EXECUTED` en `apps/api/src/modules/tasks/**`, `apps/worker/**` y `packages/**`, y añade `reasonCode` donde un test o fixture cierre sin causa (por ejemplo, `execution-orders.provisioning-gate.spec.ts`). **No edites** `apps/api/src/modules/network/**` ni `e2e/**`, que tienen cambios en curso de MOD13. Lista en tu cierre los archivos de esas rutas que cierran `NOT_EXECUTED` sin `reasonCode`.

### Criterios de aceptación

| CA | Comprobación | Tipo |
| --- | --- | --- |
| CA-01 | `selectRequirementsForResult` devuelve lo esperado para los 5 resultados × `provisioningEnforced` true/false | Unitaria (tabla) |
| CA-02 | Instalación v3, `NOT_EXECUTED` + `reasonCode`, sin consumos ni evidencias → `NOT_EXECUTED`, transición registrada y tarea `READY` | **Postgres real** |
| CA-03 | `NOT_EXECUTED` sin `reasonCode` → 422 `CLOSE_NOT_EXECUTED_REASON_REQUIRED`. La OT no cambia y no queda recibo | **Postgres real** |
| CA-04 | `NOT_EXECUTED` con un consumo CPE `INSTALLED_AT_CUSTOMER` vigente → 422 `CLOSE_NOT_EXECUTED_HAS_INSTALLED_EQUIPMENT`. Con ese consumo revertido (reverso confirmado) → cierra | **Postgres real** |
| CA-05 | `EXECUTED` sin CPE sigue rechazado con los mismos `missingRequirements` que hoy (no regresión) | **Postgres real** |
| CA-06 | `REQUIRES_FOLLOW_UP` en instalación con gate encendido: consulta el puerto. `CERTIFIED` + requisitos cumplidos → cierra; `RESERVED` → 422 «Aprovisionamiento certificado» | Unitaria (puerto simulado, como `provisioning-gate.spec.ts`) |
| CA-07 | `NOT_EXECUTED` no consulta el puerto de MOD13 y no resuelve categorías de inventario | Unitaria |
| CA-08 | Suite completa de `api` en verde. Cobertura de `tasks` ≥80 % | Conteo real |

**Postgres real:** archivo nuevo `apps/api/src/modules/tasks/tests/execution-orders.close-by-result.postgres.integration.spec.ts`, con el patrón de `execution-orders.annulment.postgres.integration.spec.ts` (`IWANA_DB_INTEGRATION_AVAILABLE=true` y `E2E_TENANT_SLUG` del tenant de pruebas). Usa un snapshot con los requisitos de v3 y crea tus propios datos con prefijo identificable; límpialos al terminar. Nunca uses `tenant_iwana`. Ejecuta con `pnpm --filter @iwana/api exec jest --config jest.integration.config.js <archivo>` y reporta **el número de tests ejecutados**: un `describe.skip` o `--passWithNoTests` con 0 tests no cuenta (G3).

### Reglas

- Solo `pnpm`. Sin migraciones. No toques `@iwana/shared` salvo que la deriva lo exija, y si lo exige, detente y avisa.
- Cada tenant en su propio schema y con `tenant_id` en todas las consultas, como en el código vecino. No metas PII en logs.
- No commitees. Al cerrar entrega: archivos tocados, conteo de unitarias e integración, cobertura de `tasks` y la lista del punto 5.

---

## §V1 — boundary-reviewer + contract-drift-reviewer

Revisa el diff de B1. Comprueba que `tasks` no importe nada de `wfm` ni de `network` salvo el puerto `serviceProvisioningReadPort` existente. Comprueba también que el contrato de cierre en `apps/api` (DTO y OpenAPI) siga siendo coherente con `CloseExecutionOrderDto` del portal (`use-execution-order-close-form.ts`), que ya envía `reasonCode` en `NOT_EXECUTED`. Hallazgos con `archivo:línea`.

## §V2 — gate-verifier

Gates Before Merge sobre `@iwana/api`, sin caché de turbo: lint, typecheck, suite unitaria completa e integración de `tasks` con conteo real, y cobertura de `tasks`. Evidencia con comandos y cifras.

**Añadido tras B1 (2026-10-23).** B1 informó la cobertura de `tasks` con funciones al 79,74 % y ramas al 69,17 %. Sin ramas, worktrees ni stash (se trabaja en `main` con otras sesiones activas), reporta la cobertura por archivo de los tres archivos de producción de B1 (`execution-orders.service.ts`, `closure-gate-evaluator.service.ts` y `dto/execution-orders.dto.ts`). Con `git diff -U0`, comprueba además que las líneas y ramas nuevas de B1 estén cubiertas. Si alguna rama nueva de B1 queda sin cubrir, es NO-GO de G6 y se nombra con `archivo:línea`. Si los porcentajes bajos del módulo vienen de archivos que B1 no tocó, es deuda previa y se declara, sin bloquear.

---

## §B1-bis — sr-backend (P3 de V1, 2026-10-23)

En `apps/api/src/modules/tasks/tests/execution-orders.close-by-result.postgres.integration.spec.ts`, `afterAll`: añade `tenant_id = $n` a la consulta de `execution_order_outbox_events` que obtiene los `intentId` y a los dos `DELETE` por `intent_id` (`execution_order_audit_intents` y `execution_order_idempotency_records`). Cambia los `qr.manager.delete(ExecutionOrder, ids)` y `qr.manager.delete(OperationalTask, ids)` por borrados con `{ id: In(ids), tenantId }` o por SQL con `tenant_id`. Las tres tablas tienen `tenant_id`. No cambies nada más. Vuelve a correr la integración contra Postgres real (debe dar 4/4 ejecutados, ninguno omitido) y el lint de `@iwana/api`. No commitees.
