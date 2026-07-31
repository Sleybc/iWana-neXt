# Informe de datos — R2.4 G6

**Módulo:** MOD11 — órdenes de ejecución
**Responsable:** AI-DATA-ENG
**Estado:** Remediación R2.4 implementada para revisión cruzada
**Fecha:** 2026-07-31
**Commit:** `fix(db): complete migration rollback and real down coverage`

## Alcance

Se revisaron las migraciones tenant 090, 091, 093, 094, 095, 096 y 097, la migración
pública 020 y la ruta de revert tenant. No se modificaron entidades, API, worker,
UX ni contratos públicos.

## Cambios aplicados

- `down()` destructivos usan la guarda exacta
  `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`; sin ella bloquean ante datos y con
  ella expresan una pérdida intencional. La ruta `tenant/revert.ts` anuncia 090,
  093, 094, 095 y 096 además de 000 en el plan dry-run.
- 094 hace el preflight antes de eliminar constraints. 090, 093, 095, 096 y la
  pública 020 también fallan antes de cualquier DDL destructivo.
- 020 conserva el bloqueo sin flag, y con
  `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true` elimina explícitamente las filas
  `usage='execution_evidence'` antes de reinstalar el CHECK histórico. Así el
  `down()` completa de forma coherente con la pérdida destructiva declarada; no
  deja un CHECK inválido ni convierte assets en huérfanos mediante UPDATE.
- 091 es el único dueño de
  `uq_execution_orders_tenant_schedule_event`; elimina previamente el índice no
  único heredado y su `down()` restaura
  `idx_execution_orders_tenant_schedule_event` como índice no único.
- 093 agrega `occurred_at` nullable y hace el backfill
  `occurred_at = created_at` en ventanas de 500 filas antes de fijar
  `DEFAULT NOW()` y `NOT NULL`; el update ya no es inalcanzable por un default
  previo.
- 093 tiene una estrategia válida para enum PostgreSQL: el `down()` bloquea si
  quedan filas con `IN_EXECUTION`, `CLOSED` o `REQUIRES_RESCHEDULE`, sin mapear
  estados con pérdida semántica; cuando no quedan, reconstruye el tipo con los
  siete valores históricos y recastea `visit_requests.status`. No se requiere
  excepción CTO ni ADR para una limitación irresoluble.
- 095 incorpora `CHECK` de estado para `PENDING_ANALYSIS`, `AVAILABLE`,
  `REJECTED` y `EXPIRED`, además de su guard y prueba.
- 096 fue revisada como cambio aditivo nullable. Su `down()` conserva la
  reversibilidad mediante guard si `captured_at` ya tiene valores; no modifica
  el backfill ni el significado del dato agregado por R1.
- 097 queda incluida en la revisión: valida antes del cambio que `quantity` sea
  positiva y entera, convierte a `INTEGER` con CHECK y su `down()` restaura
  `NUMERIC(12,2)` eliminando el CHECK. No se altera porque su round-trip actual
  es coherente.

## Retención operativa propuesta

La migración instala índices parciales sobre las columnas de corte de las cinco
tablas de crecimiento lineal:

| Tabla                                     | Corte          | Retención                           | Protección de pendientes                                                                            |
| ----------------------------------------- | -------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `execution_order_idempotency_records`     | `expires_at`   | vencimiento del horizonte de replay | un `PENDING` con más de 90 días y vencido se considera huérfano y se elimina; libera la clave única |
| `execution_order_outbox_events`           | `published_at` | 30 días publicado                   | no se toca lo no publicado                                                                          |
| `execution_order_inbox_events`            | `processed_at` | 30 días procesado                   | no se toca lo no procesado                                                                          |
| `execution_order_audit_intents`           | `delivered_at` | 30 días entregado                   | no se toca lo no entregado                                                                          |
| `execution_order_evidence_upload_intents` | `expires_at`   | vencimiento del intent              | incluye `PENDING_ANALYSIS` vencido                                                                  |

095 crea `purge_execution_order_retention_batch(batch_size)` para ejecutar cada
barrido con `SELECT ... ORDER BY ... LIMIT` dentro de un `DELETE` por PK. Valida un
tamaño de lote entre 1 y 10000 y devuelve el conteo por tabla. El procedimiento
solo borra transporte, control de reintento e intents; no borra OT, actividades,
evidencia canónica, settlement ni `audit_logs`.

## Evidencia de pruebas añadida

- Spec de 090: índices de retención y bloqueo antes de `DROP` con datos.
- Spec de 091: deduplicación previa y propiedad única del índice.
- Spec de 093: backfill alcanzable y orden nullable → update → default/not-null.
- Spec de 095: `CHECK`, función de lote, guard y revert explícito.
- Spec de pública 020: ausencia de los `UPDATE` destructivos y protección ante
  `execution_evidence`/claim, además de completar el down con el flag explícito.
- Spec de 096: `captured_at` nullable y `down()` correspondiente.
- Integración PostgreSQL real en schemas efímeros: 091 restaura el índice; 093
  ejecuta backfill de 1001 filas, rechaza estados nuevos y revierte datos
  históricos; 094 revierte tablas/columnas pobladas con flag; 096 revierte
  `captured_at` poblado con flag. La limpieza usa `DROP SCHEMA ... CASCADE`
  sobre nombres aleatorios propios del test.

Verificación ejecutada el 2026-07-31 contra PostgreSQL real en
`127.0.0.1:5433/dbiw`: suite unitaria de `@iwana/db` — 11 suites y 56 tests
pasaron; suite de integración — 3 suites y 21 tests pasaron. También pasaron
`pnpm --filter @iwana/db typecheck` y ESLint sobre los archivos modificados.

## Regulación y dependencia abierta

No se inventa regulación ni se fija una ventana legal de conservación. La
retención de transporte descrita arriba es una decisión operativa del bloque y
no altera el registro de verdad. El derecho de supresión/ARCO queda como
**dependencia de CTO + Legal**, requiere verificación con fuente oficial y no se
implementa en R2.4.

## Bloqueos y verificación

- La ejecución contra PostgreSQL real requiere credenciales y una base de
  integración disponible; no se incluyen credenciales ni datos reales.
- Antes del merge deben ejecutarse typecheck, lint y las suites unitaria e
  integración de `@iwana/db`, más un apply/revert real en schema tenant vacío y
  una comprobación de dry-run con datos sintéticos. La integración de este
  informe no usa mocks; si PostgreSQL no está disponible, Jest emite un skip
  ruidoso y la evidencia se considera incompleta, no verde.
