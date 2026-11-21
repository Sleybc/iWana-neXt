# Spec — Importación UISP · Estado del suscriptor importado

**Versión:** 1.0
**Estado:** Sustituida por la [v1.1](2026-11-21-transversal-importacion-estado-del-suscriptor-v1.1.md). Su G0 del 2026-11-21 («G0 aprobado», D1–D4) quedó sin efecto por el bloqueo H7
**Fecha:** 2026-11-21
**Relacionado:** [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) · [complementar titular](2026-11-15-transversal-importacion-uisp-complementar-titular.md) · [usuarios UISP](2026-11-15-transversal-importacion-uisp-usuarios.md)

## 1. Hechos

| # | Hecho | Fuente |
|---|---|---|
| H1 | La importación crea todo suscriptor en `PROSPECT` con `activated_at` nulo, tenga o no servicio | `crm-migration-import.adapter.ts:195` (`createSubscriber`) |
| H2 | Los contratos importados conservan su estado real (`ACTIVE`, `SUSPENDED`, `TERMINATED`) y su `start_date`; las suspensiones quedan en el historial | `crm-migration-import.adapter.ts` (`createContract`, `recordSuspensionHistory`) |
| H3 | Desde `7bebb5eb`, la lista, la búsqueda y los conteos de colas de suscriptores solo incluyen a quien tiene `activated_at` y estado `ACTIVE`, `SUSPENDED` o `CANCELLED` | `subscribers.service.ts` (`ACTIVATED_SUBSCRIBER_SCOPE_SQL`) |
| H4 | Por H1 y H3, una cartera importada no aparece en la lista de suscriptores. Las E2E `portal-importacion-uisp-live:385` y `portal-importacion-uisp-usuarios-live:541` fallan en el CI de `main` (run 44908811979) | CI |
| H5 | El dashboard no cuenta como altas a los suscriptores con `import_batch_id` | `subscribers-dashboard.service.ts:33` |
| H6 | La regla de estado a partir de contratos ya existe y es pura | `subscriber-lifecycle.util.ts` (`deriveSubscriberStatusFromContracts`) |
| H7 | **[BLOQUEO] detectado al implementar (2026-11-21):** `ck_subscribers_fiscal_complete_when_active` exige `vat_responsibility` (y representante legal si es jurídica) para `ACTIVE` y `SUSPENDED`. La importación no trae esos datos, así que las filas `ACTIVE` y `SUSPENDED` de §2 violan la restricción. Implementación revertida; §2 queda pendiente de una nueva decisión | `157_subscriber_fiscal_completeness.ts`; `migration-promotion.postgres.integration.spec.ts:394` |

## 2. Regla

Al promover un titular **creado por el lote**, una vez promovidos sus contratos:

| Contratos importados del titular | `activated_at` | `status` |
|---|---|---|
| Ninguno llegó a activarse (sin contratos o solo `DRAFT`/`ARCHIVED`) | nulo | `PROSPECT` (sin cambio) |
| Al menos uno `ACTIVE` | `start_date` más antigua entre sus contratos activados | `ACTIVE` |
| Ninguno `ACTIVE` y al menos uno `SUSPENDED` | ídem | `SUSPENDED` |
| Todos los activados están `TERMINATED` | ídem | `CANCELLED` |

- «Activado» = `ACTIVE`, `SUSPENDED` o `TERMINATED`.
- Si ningún contrato activado tiene `start_date`, `activated_at` toma `registeredOn` (`converted_at`).
- La fecha se guarda como medianoche en la zona horaria del tenant.
- El estado se calcula con `deriveSubscriberStatusFromContracts`, no con una copia.
- La escritura va en el puerto CRM de migración (un método del adaptador), dentro de la misma transacción y del mismo savepoint del titular. La revertida del lote no cambia: borra al suscriptor.

**Fuera de alcance:**

- El titular **complementado** (modo `COMPLEMENTO`, ya existía antes del lote): su estado y su `activated_at` no se tocan. Ver D2.
- La auditoría de transiciones de estado (`SUBSCRIBER_ACTIVATED`): la importación no la emite, igual que hoy no emite la creación.

## 3. Criterios de aceptación

| # | Criterio |
|---|---|
| CA-1 | Una prueba por fila de la tabla de §2 en el adaptador o el servicio de promoción: `status` y `activated_at` esperados |
| CA-2 | Sin `start_date` en los contratos activados, `activated_at` toma `registeredOn` |
| CA-3 | Un titular complementado conserva su `status` y su `activated_at` |
| CA-4 | La revertida del lote sigue sin dejar suscriptores del lote |
| CA-5 | `portal-importacion-uisp-live` y `portal-importacion-uisp-usuarios-live` pasan sin cambiar sus aserciones |
| CA-6 | Las altas del mes del dashboard no cambian tras importar un lote |

## 4. Decisiones para el G0

| # | Decisión | Propuesta |
|---|---|---|
| D1 | Fecha de activación | `start_date` más antigua; si no hay, `registeredOn` |
| D2 | Titular complementado con servicio importado activo, pero que sigue en `PROSPECT` | Fuera de esta spec; seguiría fuera de la lista. Se decide aparte si aparece un caso real |
| D3 | Lotes ya promovidos antes de este cambio | Contar primero los afectados con una consulta de solo lectura: `import_batch_id IS NOT NULL`, `activated_at IS NULL` y algún contrato activado. `report-lifecycle-inconsistencies` no los detecta, porque con `activated_at` nulo la regla devuelve el estado actual. Si hay alguno con datos reales, reproceso puntual con la misma regla y su propio G0 |
| D4 | ¿Requiere enmienda de ADR-110? | No: ADR-110 no fija el estado del suscriptor importado. Se registra en el informe de cierre |
