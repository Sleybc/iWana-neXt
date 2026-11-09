# SPEC — DT-4: el aprovisionamiento no debe reactivar un tenant marcado para eliminación

**Versión:** 1.1
**Estado:** Aprobado — G0 de la v1.0 por el CTO el 2026-11-09 («G0, por el CTO»). G0 de la v1.1 por el CTO el 2026-11-09: inclusión de R1 y R2 («Sí, inclúyelos») y enmienda de §3.3 («Sí, apruebo»), transmitidos por AI-EM-ARCH. La v1.1 manda sobre la v1.0 donde difieren (§8).
**Fecha:** 2026-11-09
**Modo activo:** Triage de solo lectura (AI-PLAT-OPS)
**Autor:** AI-PLAT-OPS
**Módulos:** MOD01 Tenants / Plataforma · worker `tenant-provisioning` · worker `tenant-schema-purge`
**Relacionado:** [ADR-033](../adrs/ADR-033-Ciclo-Vida-Tenant-Purga-Diferida-Limites-Nullable.md) (ciclo de vida y purga diferida) · [INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md) §K4f y observación DT-4 · PRD v2.4 §TenantStatus (`PROVISIONING → ACTIVE ↔ SUSPENDED ↔ INACTIVE → MARKED_FOR_DELETION`)
**Destinatario de ejecución:** AI-SR-FULL (R) · AI-SR-QA (pruebas) · AI-PLAT-OPS (C) · AI-EM-ARCH (A)

---

## 1. Problema

ADR-033 define `MARKED_FOR_DELETION` como eliminación solicitada y retenida, con restauración **solo** por reactivación explícita antes de la purga. El worker de aprovisionamiento no lo respeta: activa cualquier tenant para el que encuentre un job, sin mirar su estado.

### 1.1 Reproducción en lectura de código

| # | Archivo:línea | Qué hace |
| --- | --- | --- |
| 1 | `apps/worker/src/processors/tenant-provisioning.processor.ts:155-161` | Carga el tenant y solo comprueba que exista. No lee `status`. |
| 2 | `apps/worker/src/processors/tenant-provisioning.processor.ts:167-202` | Crea el esquema, migra, siembra y ejecuta `UPDATE public.tenants SET status='ACTIVE' WHERE id=:id`, sin condición de estado. |
| 3 | `apps/worker/src/processors/tenant-provisioning.processor.ts:137-143` | Ruta de recuperación con esquema completo: `if (existing.status !== 'ACTIVE')` pasa a `ACTIVE`. Esto incluye `MARKED_FOR_DELETION`, `INACTIVE`, `SUSPENDED` y `PROVISIONING_FAILED`. |
| 4 | `apps/worker/src/processors/tenant-provisioning.processor.ts:221-228` | `markFailed` sobrescribe el estado con `PROVISIONING_FAILED` sin condición: si falla el job de un tenant marcado, deja de estar en `MARKED_FOR_DELETION`. |
| 5 | `apps/api/src/modules/tenant/tenant.service.ts:1974-1983` | `delete()` marca `MARKED_FOR_DELETION` y `deletedAt`, pero no retira el job `provision-<id>` pendiente de la cola. |
| 6 | `apps/api/src/modules/tenant/tenant-provisioning.service.ts:87-102` y `tenant.controller.ts:974-990` | `retry-provisioning` dice aplicar a `PROVISIONING_FAILED` pero no lo comprueba: sobre un tenant marcado lo pasa a `PROVISIONING` y reencola, y el worker termina en `ACTIVE`. |
| 7 | `apps/worker/src/processors/tenant-schema-purge.processor.ts:51-62` | La purga solo selecciona `status='MARKED_FOR_DELETION' AND deleted_at IS NOT NULL`. Un tenant reactivado por el worker queda fuera para siempre, aunque conserve `deleted_at` (el worker no lo limpia). |

No existe trigger ni restricción de transición en `public.tenants`: la migración pública 007 solo añade el `CHECK` del dominio de valores (`packages/database/src/migrations/public/007_tenant_lifecycle_purge_and_nullable_limits.ts:37-40`). Ninguna prueba del procesador cubre un estado distinto de `PROVISIONING` (`apps/worker/src/processors/tenant-provisioning.processor.spec.ts:143-363`).

### 1.2 Corroboración en la base de desarrollo (solo lectura, 2026-11-09)

`platform_audit_logs` del tenant `srqa-mod05-cf-ed3b00f27351`, en UTC:

| Hora | Acción | Lectura |
| --- | --- | --- |
| 11:56:10 | `CREATE` → `PROVISIONING` | La E2E crea el tenant y el job queda en cola sin worker. |
| 11:56:38 | `DELETE` | El `beforeAll` falla y `cleanupQaTenants` lo marca. Job pendiente. |
| ~12:07 | (sin registro) | K4f arranca el worker: el job lo pasa a `ACTIVE`. El worker no audita la transición. |
| 12:07:22 | `UPDATE` → `INACTIVE` | `cleanupQaTenants` solo hace este `PATCH` si encuentra el tenant en `ACTIVE` (`e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts:82-86`): prueba empírica de la reactivación. |
| 12:07:22 | `DELETE` | Lo vuelve a marcar. |

**El fallo es real.** La inconsistencia de §K4f (16 tenants sintéticos en `MARKED_FOR_DELETION` al final) no lo desmiente: la limpieza de la E2E recorre **todos** los `srqa-mod05-cf-*` y vuelve a marcar el que el worker había reactivado. En entornos sin esa limpieza, el tenant queda `ACTIVE` y escapa de la purga.

## 2. Alcance

**Entra:**

1. Guarda de estado en el worker de aprovisionamiento (§3.1).
2. Transiciones condicionales (*compare-and-set*) en el worker para cerrar la carrera con un `DELETE` concurrente (§3.2).
3. Guarda de estado en `retry-provisioning` (§3.3).
4. Pruebas unitarias e integradas de §4.

**No entra** (ver §6): `PATCH /tenants/:id` con `status` libre, reinicio de `deleted_at` en `delete()`, auditoría de transiciones del worker, coordinación de *locks* entre aprovisionamiento y purga y la limpieza de los tenants sintéticos de desarrollo.

## 3. Corrección propuesta

### 3.1 Guarda de entrada en el worker

Después de tomar el *advisory lock* y **antes** de cualquier DDL, `process()` lee `status` del tenant y decide:

| Estado leído | Acción |
| --- | --- |
| Tenant inexistente | `UnrecoverableError`. **Desviación ratificada por AI-EM-ARCH el 2026-11-09:** el rechazo ya no pasa por `rollbackProvisioning`, así que deja de hacer `DROP SCHEMA` del esquema del payload. Un payload de cola no debe borrar un esquema sin fila en `public.tenants`: es destructivo y no se puede verificar. Los esquemas huérfanos se tratan en R5. |
| `PROVISIONING` | Flujo actual: completo, o recuperación si el esquema ya está migrado. |
| `ACTIVE` | No-op idempotente (hoy ya ocurre en la ruta de recuperación). Reaplicar *grants* solo si el esquema existe. |
| `MARKED_FOR_DELETION`, `INACTIVE`, `SUSPENDED`, `PROVISIONING_FAILED` | No crear esquema, no migrar, no sembrar, no cambiar estado, no hacer `DROP`. Lanzar `UnrecoverableError` con el código estable `TENANT_NOT_PROVISIONABLE` y el estado leído, sin PII. |

`UnrecoverableError` evita reintentos y deja el job visible en `failed` (`removeOnFail: false`) para operación.

**Decisión G0 (2026-11-09):** el job de un tenant no aprovisionable termina como error visible en la cola (`UnrecoverableError` `TENANT_NOT_PROVISIONABLE`). Se descarta completarlo como no-op con `warn`.

La guarda se aplica también a la ruta de esquema existente (`:109-153`): la lectura de estado ocurre antes de `checkSchemaExists`.

### 3.2 Transiciones condicionales

- Paso a `ACTIVE` (`:138-143` y `:197-202`): `UPDATE public.tenants SET status='ACTIVE' WHERE id=:id AND status='PROVISIONING'`. Si afecta 0 filas, un `DELETE` llegó durante el aprovisionamiento: registrar `warn` con el código `TENANT_STATUS_CHANGED_DURING_PROVISIONING`, no reintentar y **no** borrar el esquema: queda retenido para la purga, como cualquier tenant marcado.
- `markFailed` (`:221-228`): `... WHERE id=:id AND status='PROVISIONING'`. Un fallo nunca saca a un tenant de `MARKED_FOR_DELETION`.
- La validación inicial de `schemaName` (`:98-103`) usa el mismo `markFailed` condicional.

### 3.3 Guarda en `retry-provisioning`

`TenantProvisioningService.retryProvisioning` rechaza con `409 Conflict` (código `TENANT_NOT_RETRYABLE`) si el estado no es `PROVISIONING_FAILED`, antes de tocar la cola o el estado.

### 3.4 Lo que no cambia

La restauración que permite ADR-033 sigue siendo `PATCH /tenants/:id/activate` (`tenant.service.ts:1460`, limpia `deletedAt` en `:1962-1964`). Esta spec solo impide que el aprovisionamiento sea una vía de restauración implícita.

## 4. Pruebas que lo cubren

### 4.1 Unitarias — `apps/worker/src/processors/tenant-provisioning.processor.spec.ts`

| ID | Caso | Esperado |
| --- | --- | --- |
| U1 | `it.each` sobre `MARKED_FOR_DELETION`, `INACTIVE`, `SUSPENDED`, `PROVISIONING_FAILED`, sin esquema | `UnrecoverableError` `TENANT_NOT_PROVISIONABLE`; sin `CREATE SCHEMA`, migraciones, seed, `UPDATE` ni `DROP`. |
| U2 | Igual que U1 con esquema completo (ruta de recuperación) | Mismo resultado; sin `UPDATE` a `ACTIVE`. |
| U3 | `PROVISIONING` y el `UPDATE` final afecta 0 filas | Sin `DROP SCHEMA`, sin `markFailed`, `warn` con `TENANT_STATUS_CHANGED_DURING_PROVISIONING`; el job termina sin reintento. |
| U4 | Fallo de migración con tenant `PROVISIONING` | `markFailed` con `WHERE ... status='PROVISIONING'` (aserción sobre el `where`). |
| U5 | Regresión: casos existentes de `:143` y `:314` | Siguen verdes con el `UPDATE` condicional. |

### 4.2 Unitaria — API

| ID | Caso | Esperado |
| --- | --- | --- |
| A1 | `retryProvisioning` sobre `MARKED_FOR_DELETION` y sobre `ACTIVE` | `409 TENANT_NOT_RETRYABLE`; `provisioningQueue.remove` y `add` no se llaman; estado intacto. |
| A2 | `retryProvisioning` sobre `PROVISIONING_FAILED` | Comportamiento actual. |

### 4.3 Integrada contra PostgreSQL real — `apps/worker/src/processors/tenant-provisioning.marked.integration.spec.ts`

Patrón de `apps/worker/src/services/execution-order-relay.integration.spec.ts`, con `DB_NAME=test` y un tenant sintético propio (nunca `tenant_iwana`):

1. Insertar el tenant en `PROVISIONING` y pasarlo a `MARKED_FOR_DELETION` con `deleted_at` 31 días atrás.
2. Ejecutar `process()` del procesador real con su job.
3. Afirmar: estado `MARKED_FOR_DELETION`, `deleted_at` intacto, esquema inexistente.
4. Ejecutar `TenantSchemaPurgeProcessor.process()` con retención 30: la fila desaparece y quedan `TENANT_PURGE_STARTED` y `TENANT_PURGE_COMPLETED` en `platform_audit_logs`.

El paso 4 es el criterio de DT-4: el tenant **no escapa de la purga**. La prueba falla hoy en el paso 3.

### 4.4 Evidencia de cierre

`iwana-test-evidence` sobre `@iwana/worker` y `@iwana/api` sin caché, con conteo real de suites y tests. El cambio no toca ningún `@Module`, pero se corre la suite completa de ambos paquetes.

## 5. Criterios de aceptación

- CA-1: ningún job de aprovisionamiento cambia el estado de un tenant que no esté en `PROVISIONING` (U1, U2, integrada).
- CA-2: un `DELETE` durante el aprovisionamiento deja el tenant en `MARKED_FOR_DELETION` (U3).
- CA-3: un fallo de aprovisionamiento no saca al tenant de `MARKED_FOR_DELETION` (U4).
- CA-4: `retry-provisioning` solo opera sobre `PROVISIONING_FAILED` (A1, A2).
- CA-5: un tenant marcado con job pendiente se purga al vencer la retención (integrada, paso 4).

## 6. Hallazgos relacionados, fuera de esta spec

| ID | Hallazgo | Evidencia | Impacto |
| --- | --- | --- | --- |
| R1 | `delete()` reescribe `deletedAt` aunque el tenant ya esté marcado, y la limpieza de la E2E vuelve a borrar todos los sintéticos en cada corrida: el reloj de retención se reinicia. | `tenant.service.ts:1981-1982`; los 18 `srqa-mod05-cf-*` de desarrollo tienen `deleted_at` = 2026-11-01 22:50:08 UTC, la última corrida. | La purga puede posponerse sin límite. Afecta al mismo objetivo de DT-4. |
| R2 | `PATCH /tenants/:id` acepta cualquier `status` (`tenant.dto.ts:168-170`, `tenant.service.ts:1424`): permite `MARKED_FOR_DELETION → ACTIVE` sin limpiar `deleted_at`, y `→ MARKED_FOR_DELETION` sin `deleted_at`, que la purga nunca selecciona. | Lectura de código. | Otra vía para escapar de la purga, solo por `SYSTEM_ADMIN`. |
| R3 | El worker no registra en `platform_audit_logs` sus transiciones de estado. | §1.2: la reactivación no dejó rastro. | Trazabilidad. |
| R4 | Aprovisionamiento (*lock* 42) y purga (*lock* 43) usan espacios de *advisory lock* distintos para el mismo esquema. | `tenant-provisioning.processor.ts:246`, `tenant-schema-purge.processor.ts:93`. | Residual tras §3.2; la ventana real exige la retención completa. |
| R5 | En desarrollo hay 18 tenants sintéticos marcados y **0** esquemas asociados, aunque ninguno cumplió la retención. §K4f afirmaba 16 esquemas vinculados. | Consulta de solo lectura del 2026-11-09. | Alguien borró los esquemas fuera de la purga. Sin dueño. |
| R6 | `RELAY_FAILURE` con `failed=0`: el relay escanea los tenants con `Promise.allSettled` y solo registra el error por tenant; el job termina bien. Incluye tenants en `PROVISIONING`, `PROVISIONING_FAILED` e `INACTIVE` (`execution-order-relay.service.ts:172-173`), cuyo esquema puede no existir o estar a medio migrar. | Lectura de código; hipótesis no verificada contra el log de K4f. | Ruido operativo, sin pérdida de eventos. |

| R7 | **P1, confirmado el 2026-11-09.** La purga del worker no puede borrar ningún esquema de tenant: `TenantSchemaPurgeProcessor` conecta con `DB_USER`, que es `iwana_app` en `.env`, en `docker-compose.yml` y en `worker-prod` (`docker-compose.prod.yml:329`). Los esquemas pertenecen a `iwana_migrator`, e `iwana_app` no es miembro de ese rol ni superusuario. | `tenant-schema-purge.processor.ts:33-41`. En `dbiw`, los 132 esquemas `tenant_%` son de `iwana_migrator` y `pg_has_role('iwana_app', owner, 'MEMBER') = false`. Base tipo CI `iwana_it_g7_dt4_20261109`: `DROP SCHEMA` como `iwana_app` da `must be owner of schema`. El único `TENANT_PURGE_COMPLETED` de `dbiw` es manual (`request_id manual:tenant-schema-purge`, 2026-11-03); el worker nunca completó una purga. | La purga falla y hace `ROLLBACK` con cualquier tenant que tenga esquema, así que ningún tenant marcado se purga nunca. Es más grave que DT-4, que solo protege la selección. No se corrige en esta ola. |
| R8 | La consola de plataforma muestra un error genérico ante el `409 TENANT_PROVISIONING_IN_PROGRESS` de «Reintentar»: el `catch` no distingue `ApiError.code`. | `apps/web/src/app/(protected)/tenants/page.tsx:291-295` (`PLATFORM_UI_COPY.tenants.actionError`). | Condición de AI-EM-ARCH para el caso límite de §8.2; seguimiento de fe-platform con vocabulario revisado. |

R1 y R2 entran en la v1.1 (§8). R3 a R8 siguen fuera, como seguimiento.

## 7. Riesgos

- Jobs huérfanos visibles en `failed` de `tenant-provisioning`: es el comportamiento buscado. El runbook de operación debe indicar que se eliminan a mano tras revisar el tenant.
- Ningún cambio de esquema ni migración. Ningún dato existente se modifica.

## 8. v1.1 — enmienda de §3.3, R1 y R2

### 8.1 Inventario de consumidores (2026-11-09)

| Ruta | Consumidor | Llamada | Efecto de la v1.1 |
| --- | --- | --- | --- |
| `DELETE /tenants/:id` | Web, `TenantSettingsForm.tsx:220` | Borra un tenant desde su ficha | Sin cambio. |
| `DELETE /tenants/:id` | Aprovisionador, `scripts/e2e-provision-operational.mjs:2128` | Limpieza con reintentos, espera 204 | Sigue en 204: el segundo borrado es idempotente (R1). |
| `DELETE /tenants/:id` | E2E `portal-crm-ciclo-facturacion-live.spec.ts:88`, `billing-flow`, `contact-pending-live`, `conversion-failure-live` | Barrido que vuelve a borrar tenants ya marcados, espera 204 | Sigue en 204, sin reiniciar `deleted_at` (R1). |
| `PATCH /tenants/:id` con `status` | Web | No envía `status` (`UpdateTenantPayload`, `api-client.ts:887`) | Sin cambio. |
| `PATCH /tenants/:id` con `status` | E2E `billing-flow:154`, `ciclo-facturacion-live:83`, `contact-pending-live:84`, `conversion-failure-live:86` | `ACTIVE → INACTIVE` antes del borrado | Permitido (R2). |
| `PATCH /tenants/:id/suspend` | Web, `TenantsTable.tsx:163` | Solo ofrece la acción en `ACTIVE` | Sin cambio (R2). |
| `PATCH /tenants/:id/activate` | Web, `TenantsTable.tsx:164-168` | La ofrece en `SUSPENDED`, `INACTIVE` y `MARKED_FOR_DELETION` | Sin cambio (R2). |
| `PATCH /tenants/:id/retry-provisioning` | Web, `TenantsTable.tsx:169-171` | La ofrece en `PROVISIONING` y `PROVISIONING_FAILED` | Sin cambio (§8.2). |

Ninguna llamada legítima se rompe.

### 8.2 §3.3 enmendada — `retry-provisioning`

Sustituye a §3.3 y a A1/A2 de la v1.0.

- **Regla:** solo se reintenta un tenant en `PROVISIONING` o `PROVISIONING_FAILED`. En `MARKED_FOR_DELETION`, `INACTIVE`, `SUSPENDED` y `ACTIVE` responde `409 Conflict` con código `TENANT_NOT_RETRYABLE`, antes de tocar la cola o el estado.
- **Reintento con el job en curso:** si el job `provision-<id>` está activo, `queue.remove` no puede retirarlo porque lo tiene bloqueado el worker. En `bullmq@5.71.0` eso no lanza error: `removeJob-2.lua` devuelve `0`. La guarda es `removed === 0`, y un error real de `remove` se propaga sin reencolar. Ese caso responde `409` con código `TENANT_PROVISIONING_IN_PROGRESS`, sin reencolar ni cambiar el estado. Si el job está en espera, se retira y se reencola con el mismo `jobId`, así que nunca hay dos jobs del mismo tenant.
- **Ratificación AI-EM-ARCH (2026-11-09):** se acepta `409 TENANT_PROVISIONING_IN_PROGRESS` cuando `removed === 0`. Caso límite aceptado: si el worker se cuelga con el lock tomado, el reintento devuelve `409` hasta que BullMQ detecte el job estancado y lo devuelva a espera. El texto que vea el operador para ese `409` debe decir que el aprovisionamiento sigue en curso, no un error genérico (seguimiento R8).
- **Pruebas:**

| ID | Caso | Esperado |
| --- | --- | --- |
| A1 | `it.each` sobre `MARKED_FOR_DELETION`, `INACTIVE`, `SUSPENDED`, `ACTIVE` | `409 TENANT_NOT_RETRYABLE`; `remove` y `add` no llamados; estado intacto. |
| A2 | `it.each` sobre `PROVISIONING_FAILED` y `PROVISIONING` (job en espera o inexistente) | Comportamiento actual: `remove`, estado `PROVISIONING`, `add` con `jobId: provision-<id>`. |
| A3 | `PROVISIONING` con el job activo (`remove` devuelve `0`) | `409 TENANT_PROVISIONING_IN_PROGRESS`; `add` no llamado; estado intacto. |
| W1 | Worker: dos `process()` seguidos del mismo tenant `PROVISIONING` | El primero aprovisiona; el segundo lee `ACTIVE` y no crea esquema, no migra ni siembra. Demuestra que un reintento colado no aprovisiona dos veces (condición de AI-EM-ARCH). |

### 8.3 R1 — `delete()` idempotente

- **Regla:** si el tenant ya está en `MARKED_FOR_DELETION`, `DELETE /tenants/:id` responde `204` sin cambiar `deleted_at`, sin guardar la fila y sin registrar un segundo `DELETE` en la auditoría del servicio. El plazo de retención corre desde el primer borrado.
- **Corrección:** `tenant.service.ts:1974-1983`, retorno temprano cuando `status === MARKED_FOR_DELETION`.
- **Pruebas:** S1, segundo borrado de un tenant marcado: `save` y `auditService.log` no llamados, `deletedAt` igual al original. S2, primer borrado: comportamiento actual.

### 8.4 R2 — transiciones de estado explícitas

- **Regla:** el estado solo cambia por reglas declaradas:

| Vía | Estados de origen permitidos | Destino |
| --- | --- | --- |
| `PATCH /tenants/:id` con `status` | `ACTIVE`, `SUSPENDED`, `INACTIVE` | `ACTIVE`, `SUSPENDED`, `INACTIVE` |
| `PATCH /tenants/:id/suspend` | `ACTIVE`, `SUSPENDED` (idempotente) | `SUSPENDED` |
| `PATCH /tenants/:id/activate` | `ACTIVE` (idempotente), `SUSPENDED`, `INACTIVE`, `MARKED_FOR_DELETION` | `ACTIVE` |
| `DELETE /tenants/:id` | Cualquiera | `MARKED_FOR_DELETION` |
| Worker de aprovisionamiento | `PROVISIONING` | `ACTIVE` o `PROVISIONING_FAILED` |
| `retry-provisioning` | `PROVISIONING`, `PROVISIONING_FAILED` | `PROVISIONING` |

  Cualquier otra combinación responde `409 Conflict` con código `TENANT_STATUS_TRANSITION_NOT_ALLOWED` y no modifica la fila. En particular, `PATCH` ya no lleva un tenant a `MARKED_FOR_DELETION` ni lo saca de ese estado, y ni `suspend` ni `activate` saltan el aprovisionamiento.
- **Salida de `MARKED_FOR_DELETION`:** solo por `activate`, la restauración de ADR-033. Limpia `deleted_at` como hoy y además registra en la auditoría, desde el servicio, una entrada `UPDATE` con estado anterior y nuevo, igual que `delete()`. No depende solo del interceptor global.
- **Pruebas:**

| ID | Caso | Esperado |
| --- | --- | --- |
| T1 | `PATCH` con `status` desde y hacia cada combinación de la tabla | Permitidas aplican; el resto `409 TENANT_STATUS_TRANSITION_NOT_ALLOWED` sin `save`. |
| T2 | `PATCH` sin `status` sobre un tenant marcado | Actualiza los demás campos; el estado y `deleted_at` no cambian. |
| T3 | `suspend` desde `MARKED_FOR_DELETION`, `PROVISIONING`, `PROVISIONING_FAILED`, `INACTIVE` | `409`. |
| T4 | `activate` desde `PROVISIONING` y `PROVISIONING_FAILED` | `409`. |
| T5 | `activate` desde `MARKED_FOR_DELETION` | `ACTIVE`, `deletedAt = null`, `auditService.log` con estado anterior y nuevo. |
| T6 | HTTP del controlador: el `409` lleva el código en el sobre de error estándar | Contrato de error. |

### 8.5 Criterios de aceptación añadidos

- CA-4 (sustituye al de la v1.0): `retry-provisioning` solo opera sobre `PROVISIONING` y `PROVISIONING_FAILED`, y no reencola con el job en curso (A1-A3).
- CA-6: un reintento no aprovisiona dos veces el mismo tenant (W1, A3).
- CA-7: borrar de nuevo un tenant marcado no reinicia el plazo de retención (S1).
- CA-8: ninguna vía de la API cambia el estado fuera de la tabla de §8.4, y la restauración de un tenant marcado queda auditada (T1-T6).

### 8.6 Riesgo conocido

`activate` sobre un tenant marcado cuyo esquema ya no existe (caso R5 de desarrollo) lo deja `ACTIVE` sin esquema. Queda fuera de la v1.1; se registra con R3-R8.

### 8.7 Notas de implementación (2026-11-09)

- Todo cambio de estado de la API (`PATCH` con `status`, `suspend`, `activate`, `setProvisioningStatus`) se escribe con un `UPDATE ... WHERE id = :id AND status = :expectedStatus`, donde `expectedStatus` es el estado leído que ya pasó la tabla de §8.4. Si afecta 0 filas responde `409` sin tocar caché, auditoría ni índice. Es más estricto que comparar contra todos los orígenes de la vía, y garantiza que el `oldValue` de la auditoría de restauración sea el estado real anterior.
- `setProvisioningStatus` es la vía `provisioning`: a `PROVISIONING` desde `PROVISIONING` o `PROVISIONING_FAILED`, y a `PROVISIONING_FAILED` desde `PROVISIONING`. En `retry-provisioning`, si su `UPDATE` condicional falla después de `remove`, responde `409 TENANT_NOT_RETRYABLE` sin `add`.
- `retry-provisioning` lee el estado de la base, no de la caché (`TenantService.getCurrentStatus`).
- El segundo `DELETE` de un tenant marcado invalida la caché, sin `save` ni auditoría.
- W1 se prueba también contra PostgreSQL real en `tenant-provisioning.marked.integration.spec.ts`.

## 9. G6 (2026-11-09)

| Corrida | Comando | Resultado |
| --- | --- | --- |
| Unitarias api, sin caché | `pnpm --filter @iwana/api exec jest --no-cache --ci` | 489 suites y 6533 pruebas aprobadas; 0 fallos |
| Unitarias worker, sin caché | `pnpm --filter @iwana/worker exec jest --no-cache --ci` | 21 suites y 191 pruebas aprobadas; 0 fallos |
| Integración worker | `R0_3_REAL_DB=1 pnpm --filter @iwana/worker test:integration` (`DB_NAME=test`) | 2 suites y 4 pruebas aprobadas |
| Integración API | Bloque `run` literal de «Integration tests — API» (`ci.yml:669-846`) en una base nueva `iwana_it_g7_dt4_20261109`, sobre un contenedor desechable `postgres:18.3-alpine` preparado como el job: least-privilege, 27 migraciones públicas, `tenant_test` y 174 migraciones tenant | 83 suites aprobadas y 3 omitidas de 86; 570 pruebas aprobadas y 19 omitidas de 589. Gate de omisiones: PASS (3 omisiones declaradas; B5 17/17; K2 5/5) |
| E2E live contra el entorno de desarrollo (API y worker en `--watch` con el árbol actual) | `pnpm exec playwright test --config e2e/playwright.portal.local.config.ts` con las cuatro specs de §8.1 | 6 aprobadas y 5 fallidas, todas en `portal-billing-flow`. ciclo-facturacion, contact-pending y conversion-failure pasan. El triage de `e2e-triage` atribuye los 5 fallos a dos causas ajenas a DT-4 y descarta flaky: el formato COP sin decimales (`:638`, `:659`) y el doble montaje de `next dev` (`:1016`); `:650`, `:672` y `:843` son cascada. El `PATCH` de la limpieza devuelve 200 y el `DELETE` 204, y el tenant queda en `MARKED_FOR_DELETION`. |
| Aprovisionador | `node scripts/e2e-provision-operational.mjs` con las variables del job y `E2E_API_LOG`; API en `127.0.0.1:3100` porque la API de desarrollo ocupa el 3000 | `E2E_SETUP=OK` (3 tenants creados y aprovisionados con el código nuevo) y `E2E_CLEANUP=OK`. Playwright: 303 aprobadas y 37 fallidas de 340; el CI de `main` (run 42632425743, `75528631`) da 339 aprobadas, 0 fallidas y 1 omitida. Ninguno de los 37 fallos es atribuible a DT-4. 8 son capturas `win32`, la diferencia ya conocida en Windows. Los otros 29 son artefacto del puerto: el portal standalone reenvía `/api/v1` a `127.0.0.1:3000` (`apps/portal/next.config.ts:13`), es decir, a la API de desarrollo con otra base, y las specs live usan `/api/v1` relativo; además `portal-billing-flow` recibió `API_BASE_URL` con `/api/v1` duplicado. El resultado son logins con 500 y redirecciones a `/auth/login`. Una corrida fiel exige el 3000 libre o el G6.5 en CI. |

Nota sobre `portal-billing-flow`: Node 24.13.1 (el que fija CI) también formatea `31` COP como `"$ 31"`. Que la spec espere `150,00` depende del formateo del navegador o del build standalone. Corresponde a sr-qa y queda fuera de DT-4.

**Decisión del usuario (2026-11-09):** la corrida fiel del aprovisionador, con la API en el 3000, se deja al G6.5 del CI tras el push. La evidencia local de DT-4 queda en `E2E_SETUP=OK` y `E2E_CLEANUP=OK`. El G6.5 debe mostrar `E2E_PLAYWRIGHT_FAILED=0` en el job «E2E operativo R4.1» del SHA publicado.

## 10. Publicación y G6.5 (2026-11-09)

Commit `965bf5e5`, publicado en un único push `75528631..965bf5e5` junto con el tren de roles y P3-5 (`c5be2ab2`). El CI se lanzó solo sobre el SHA de cabeza (ADR-107), así que su resultado cubre los 5 commits.

| Workflow / job | Id | Conclusión |
| --- | --- | --- |
| CI | run 42678231774 | success |
| Detección de cambios de solo documentación | 129365336074 | success |
| Integridad de citas ADR | 129365336824 | success |
| Lint + Typecheck + Build + Unit tests | 129365452395 | success |
| Build y validación de imágenes production | 129365452519 | success |
| E2E portal | 129365452584 | success |
| E2E operativo R4.1 — API + storage + BullMQ reales | 129365452743 | success: 339 aprobadas, 0 fallidas, 1 omitida; `E2E_CLEANUP=OK` |
| E2E Web Admin Smoke | run 42678231542 | success |
| Admin bootstrap smoke | 129365338978 | success |

Paso «Integration tests — API»: de 19:12:17 a 19:20:27 UTC, **8 min 10 s** con un límite de 10 min. 83 suites aprobadas y 3 omitidas de 86; 570 pruebas aprobadas y 19 omitidas de 589; gate de omisiones PASS (86 specs; 3 omisiones declaradas; B5 17/17; K2 5/5). Queda un margen de 1 min 50 s: el próximo crecimiento de la suite debe vigilar ese límite.

**G6.5: ✅.**
