# Informe C1 — reparación de CI para G6.5

**Fecha:** 2026-10-09
**Versión:** 1.0
**Responsable:** `sr-backend`
**Estado local:** **GO**
**Encargo:** `docs/prompts/PROMPT-PLAT-REDIS-AUTH-DEUDA-G7-v1.0.md`, adenda del 2026-10-09, punto C1

## Cambios

- Los fixtures de configuración del API usan `REDIS_PASSWORD` de prueba y claves `INTERNAL_QUEUE_SIGNING_KEY` generadas en memoria a partir de 32 bytes. Se añadió un caso negativo que elimina la clave HMAC de un entorno de producción válido y comprueba que el schema la rechaza.
- CA-04 ya no importa `ExecutionOrderEventsProcessor` desde `apps/worker`. El helper `apps/api/src/modules/inventory/tests/helpers/sign-inventory-execution-request.ts` valida el envelope con `@iwana/shared`, lo canoniza mediante `canonicalizeInventoryExecutionRequest` y firma su HMAC con la clave de prueba. La integración encola el trabajo firmado directamente al API y comprueba el recibo y el evento de rechazo publicado.
- La conexión Redis de la integración usa `REDIS_PASSWORD` del entorno; no se copia ni registra el secreto.
- La búsqueda de imports cruzados en tests de `apps/` encontró el import del worker que se retiró. No se encontraron otros imports de código fuente entre apps.

## Gates

| Gate                                                                        | Resultado                                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @iwana/api build`                                            | **PASS**                                                                                               |
| `pnpm typecheck`                                                            | **PASS**, 8/8 tareas; seis usaron cache de Turbo                                                       |
| `pnpm --filter @iwana/api exec jest --no-cache --runInBand`                 | **PASS**, 326 suites y 4.145 tests; 4 suites/15 tests omitidos por el filtro normal de integración     |
| CA-04 con `jest.integration.config.js`, `--no-cache --runInBand`            | **PASS**, 4/4 sobre PostgreSQL y Redis locales, usando el tenant sintético `i4-qa-a-20261006-9d3098f4` |
| `pnpm exec prettier --check` sobre los cuatro archivos de código del bloque | **PASS**                                                                                               |

La suite CA-04 se ejecutó explícitamente con `DB_NAME=i4_qa_20261006_a1`, el tenant sintético indicado y `IWANA_DB_INTEGRATION_AVAILABLE=true`. El proceso tomó la contraseña de Redis del entorno local. Jest informó una advertencia deprecada de `pg` sobre consultas concurrentes; no afectó el resultado 4/4.

## Límite del spec

CA-04 ahora verifica el trabajo propio del API: solicitud firmada, recibo y evento de respuesta. El consumo/reencolado del worker y la actualización de la proyección pertenecen al lado worker y no se importan desde este spec del API.

**Sin commit**, según el encargo.
