# PROMPT — WFM · Agregar `TASKS` al enum `work_order_source_context`

**Versión:** 1.0 · **Fecha:** 2026-10-17 · **Estado:** Vigente · **Emisor:** AI-EM-ARCH · **Agente:** `sr-backend` · **Aprobación:** CTO, 2026-10-17 (migración en vez de retirar el valor del contrato)
**Origen:** [FIX-PREVIEW](../informes/INFORME-PRIVACY-FASE-1B-FIX-PREVIEW-v1.0.md), deuda escalada P1; plan de la Fase 1b v1.6.

## Hechos verificados por AI-EM-ARCH

| Hecho | Fuente |
| --- | --- |
| El contrato compartido tiene `TASKS` | `packages/shared/src/enums/wfm/work-order-source-context.enum.ts:5` (`CRM`, `ASSURANCE`, `PROVISIONING`, `TASKS`, `MANUAL`) |
| El enum de la base no lo tiene, y ninguna migración lo agrega | `030_create_wfm_module.ts:56` crea `work_order_source_context` con `CRM`, `ASSURANCE`, `PROVISIONING` y `MANUAL`; no hay `ADD VALUE` posterior |
| Lo usan dos columnas | `work_orders.source_context` (`030:141`) y `visit_requests.origin_context` (`034:37`) |
| Lo producen | `apps/api/src/modules/wfm/services/visit-requests.service.ts`, `schedule-events.service.ts`, `apps/api/src/modules/tasks/services/execution-orders.service.ts` y `tasks/dto/execution-orders.dto.ts`; en el portal, `components/scheduling/visit-request-origin-orchestration.ts`, `pending-visits-ui.ts` y `scheduling-ui.ts` |
| Efecto probable | Insertar una visita o una orden de trabajo con origen `TASKS` falla con `22P02` (`invalid input value for enum`) |
| Patrón vigente | `058_add_counter_purchase_origin.ts`: `ADD VALUE` idempotente, guarda filtrada por `typnamespace = current_schema()::regnamespace` y `down` sin efecto si el valor está en uso |

## Encargo

1. **Reproducir primero** con un test de integración Postgres que use el schema creado con las **migraciones reales** (patrón de `privacy-erasure-api.postgres.integration.spec.ts`, no tablas a mano). Debe crear una visita y una orden de trabajo con origen `TASKS` por el servicio de dominio, y **fallar con `22P02`** antes del cambio. Reportar si el flujo de API y portal que usa `TASKS` falla hoy de punta a punta.
2. **Migración tenant `152_work_order_source_context_tasks.ts`**, con el patrón de la 058:
   - **`up`:** `ALTER TYPE work_order_source_context ADD VALUE 'TASKS'` dentro de un `DO $$ … IF NOT EXISTS (…) $$`, con la guarda por `current_schema()`. Comprobar con el runner tenant (`runner.ts:325`) que `ADD VALUE` es compatible con la transacción con que corre la migración; si no lo es, declarar `transaction = false` como hacen otras migraciones del repo y justificarlo.
   - **`down`:** si alguna fila de `work_orders.source_context` o de `visit_requests.origin_context` usa `TASKS`, no hace nada y lo deja documentado. Si ninguna lo usa, recrea el tipo sin `TASKS` y migra **las dos columnas** con `USING <columna>::text::work_order_source_context`.
   - Registrar la migración en `runner.ts` y agregar su spec y su integración (`up`, `down` y re-`up`, con **dos schemas tenant**, como pide C6).
3. **Prueba de que el contrato y la base coinciden:** un test que compare los valores de `WorkOrderSourceContext` con `pg_enum` del tipo, en un schema migrado. Debe fallar si en el futuro se agrega un valor al contrato sin migración.
4. **Participante de privacidad de WFM:** la comparación `origin_context::text = 'TASKS'` de `wfm-titular-erasure.participant.ts:226` sigue siendo válida. **No se toca.**

## Evidencia obligatoria

- La suite unitaria completa de `@iwana/api` y `@iwana/db` sin caché, con 0 fallos.
- `test:integration` de `@iwana/db` y de `@iwana/api` contra una base **desechable** (`iwana_it_g7_ci`, nunca `dbiw`), con el test del paso 1 en `PASS` después del cambio, y su fallo `22P02` antes.
- `pnpm exec turbo run test --force --continue` con los totales por paquete.
- **No migrar `dbiw`:** eso lo decide el CTO después del commit, con `pnpm db:backup` antes.

## Reglas

- Propiedad: `packages/database/src/migrations/tenant/152_*` y `runner.ts`, los tests nuevos de WFM y `tasks`, y el test de paridad. No modificar el contrato de `@iwana/shared` ni código de producto, salvo que la reproducción muestre otro defecto; en ese caso, `[BLOQUEO]`.
- Ninguna PII ni clave real. No commitear.
- Informe: `docs/informes/INFORME-WFM-ENUM-ORIGEN-TASKS-v1.0.md`, con la ruta verificada como libre.
