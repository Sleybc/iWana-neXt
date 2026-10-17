# Informe V1 QA — Privacy Fase 1b · ejecución v1.0

**Fecha:** 2026-10-16  
**Estado:** **[BLOQUEO]** — el tenant configurado para E2E está `INACTIVE` y no tiene las migraciones 149–151.  
**Prompt:** [`PROMPT-PRIVACY-FASE-1B-V1-EJECUCION-v1.0.md`](../prompts/PROMPT-PRIVACY-FASE-1B-V1-EJECUCION-v1.0.md).  
**Suite:** [`portal-privacy-fase-1b-live.spec.ts`](../../e2e/tests/portal-privacy-fase-1b-live.spec.ts).  
**Skills consultadas:** `playwright-skill`, `e2e-testing-patterns`, `iwana-test-evidence`, `verification-before-completion`.

## [BLOQUEO] Precondición de tenant

Se resolvió la configuración de `.env.development`/`.env.development.local` a `dbiw:5433` y se hizo una comprobación de solo lectura en una transacción `READ ONLY`. Se buscó el tenant de `E2E_TENANT_SLUG` en `public.tenants`, consultando las migraciones en el ledger `typeorm_migrations` y columnas mediante `pg_catalog.pg_attribute`. No se consultó `information_schema`.

| Verificación del tenant configurado | Resultado |
| --- | --- |
| Estado | `INACTIVE` |
| Migración 149 (`PrivacyErasureRecord1490000000000`) | No aplicada |
| Migración 150 (`TitularAnonymizationMarker1500000000000`) | No aplicada |
| Migración 151 (`SeedBlockedDataPermission1510000000000`) | No aplicada |
| Columnas esperadas encontradas en `pg_attribute` | 0 |

El tenant configurado es `e2e-privacy-mv8kvz61-61187e`. El prompt v1.0 ordena bloquear si el tenant no está `ACTIVE` o no tiene las tres migraciones. No migré ni restauré `dbiw`.

## Ejecución y conteo

**Playwright:** no ejecutado. **Conteo real:** no disponible; no equivale a 0 tests. **Retries:** no aplican porque no hubo ejecución. **Traces de fallos:** ninguno generado, pues ningún test llegó a arrancar.

No se arrancaron la API ni el portal, no se consultó `GET /access-control/me/effective-permissions`, no se creó/actualizó actor y no se sembraron ni mutaron fixtures. Se detuvo el flujo al comprobar la precondición obligatoria de base.

## Matriz R1–R16 ↔ test

La tabla mapea el spec existente; no representa una corrida ni resultados de runtime. El test actual contiene cuatro escenarios. El caso adicional de R10 v1.4 todavía no está en el spec: no añade transición de estado ni archivo de contrato sobre un titular bloqueado.

| Requisito | Test asociado en el spec | Límite / estado |
| --- | --- | --- |
| R1 — rechazo legal bloquea; contractual no | `ex suscriptor dentro de retención: rechazo legal, listado redactado, búsqueda excluida y seis subrecursos`; `contrato vigente: rechazo por deber contractual sin marca de bloqueo` | Mapeo estático; no ejecutado. |
| R2 — confirmación y anonimización transaccional | `prospecto: SUPRIMIR, vista previa, resolver y anonimizar expediente, visita y órdenes` | No ejecutado. |
| R3 — prospecto sin Party | `prospecto: ...` | No cubre colisión HMAC; no ejecutado. |
| R4 — candidatos de resolver coinciden con vista previa | `prospecto: ...` | No fuerza concurrencia entre preview y resolve; no ejecutado. |
| R5 — cuenta activa impide supresión | Sin caso E2E | Cobertura complementaria en integración PostgreSQL, fuera de esta corrida. |
| R6 — conservar solicitud, eventos, autorizaciones, marcas y registros | `prospecto: ...` | Comprueba solicitud/evento y consentimiento; no inspecciona directamente todas las tablas. No ejecutado. |
| R7 — anonimización operativa WFM/tasks | `prospecto: ...` | Comprueba visita, evento, orden de trabajo y orden de ejecución. No ejecutado. |
| R8 — redacción por defecto y lectura auditada según permiso | `ex suscriptor ...` | Incluye listado, 360 y seis subrecursos con permisos; no ejecutado. |
| R9 — búsqueda excluye titular bloqueado | `ex suscriptor ...` | Búsqueda exacta y libre; no ejecutado. |
| R10 — mutación bloqueada con 409 antes de escribir | `ex suscriptor ...` (edición genérica del suscriptor) | **Pendiente v1.4:** añadir transición de estado y archivo de contrato sobre bloqueado; no se modificó el spec por el bloqueo. |
| R11 — traslado tardío derivado del evento | `traslado fuera de plazo: muestra la insignia “Traslado extemporáneo”` | No ejecutado. |
| R12 — bloqueo derivado de marcas, sin puerto legado | `ex suscriptor ...` | El E2E observa el estado bloqueado; no sustituye la comprobación estática del puerto. No ejecutado. |
| R13 — CLI comparte participantes | Sin caso E2E | Corresponde a integración del CLI, no a esta suite. |
| R14 — contratos/cotizaciones anonimizados y conservados | Sin caso de anonimización de contrato | Corresponde a integración del CLI; el test de contrato vigente solo verifica rechazo. |
| R15 — marca de anonimización visible | `prospecto: ...` | Verifica encabezado e insignia en UI; no ejecutado. |
| R16 — acceso contable a datos bloqueados | `ex suscriptor ...` | Contrasta ACCOUNTANT con/sin `crm.blocked_data.read` y otros perfiles; no ejecutado. |

## Reanudación

Para continuar, debe seleccionarse/configurarse un tenant E2E que esté `ACTIVE` y tenga las migraciones 149–151 aplicadas. No se deben migrar tenants como parte de este encargo. Después se podrá evaluar el actor auditor con `GET /access-control/me/effective-permissions`, preparar actor solo si hace falta, arrancar API/portal y ejecutar Playwright con `--retries=0`, incluyendo los dos casos R10 v1.4.

## Cierre

La ruta del informe estaba libre antes de crearlo (`Test-Path` → `False`). No se modificó código, tests, fixtures ni `.env.development.local`; no se expusieron credenciales, tokens ni datos personales; no se hicieron migraciones ni commit.
