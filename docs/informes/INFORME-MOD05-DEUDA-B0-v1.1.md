# INFORME — MOD05 deuda de código · B0 · v1.1

- **Fecha:** 2026-10-17.
- **Estado:** **S1 confirmado**.
- **Agente:** `sr-backend`.
- **Plan:** [2026-10-17-mod05-deuda-codigo.md](../plans/2026-10-17-mod05-deuda-codigo.md).
- **Encargo:** [PROMPT-MOD05-DEUDA-CODIGO-v1.0.md](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md), §2.1 y §4 B0.
- **Continuación de:** [INFORME-MOD05-DEUDA-B0-v1.0](INFORME-MOD05-DEUDA-B0-v1.0.md).

## Resultado de sincronización

Docker estaba arriba y saludable. PostgreSQL respondió en `127.0.0.1:5433`; la base `iwana_it_g7_ci` ya existía y tenía la tabla `public.tenants` y el rol de migración requerido. Se ejecutó la integración con `DB_NAME=iwana_it_g7_ci`; no se creó ni migró `dbiw`.

Los 8 casos de `subscriber-deuda-153-156.integration.spec.ts` se ejecutaron contra PostgreSQL real, sin omisiones: preparan dos schemas tenant con la cadena de migraciones, comprueban `up/down/re-up` y traducción de 153, enum y constraint `NOT VALID` de 154, columnas e índices de cifrado de 155, y la FK/preflight de 156, incluyendo el aborto al insertar un huérfano. Resultado dirigido: **1 suite, 8 pruebas aprobadas, 0 omitidas y 0 fallos**.

También se ejecutó la integración completa de `@iwana/db`: **35 suites, 123 pruebas aprobadas, 0 omitidas y 0 fallos**. La suite unitaria sin caché pasó: **73 suites, 414 pruebas aprobadas, 0 fallos**. Por la evidencia real de dos schemas y el aborto de 156 ante huérfanos, **se anuncia S1**.

## Ajuste de fixture

La primera corrida real descubrió que los inserts del fixture omitían `vat_treatment`, una columna `NOT NULL` preexistente. Se corrigió solo el fixture de [subscriber-deuda-153-156.integration.spec.ts:116](../../packages/database/src/migrations/tenant/subscriber-deuda-153-156.integration.spec.ts:116) y la fila jurídica correspondiente: ahora incluyen valores sintéticos `EXEMPT` y `STANDARD`. La integración volvió a ejecutarse y pasó. No se alteró ninguna migración ni contrato.

## Comandos y entorno

La descarga automática de Node 24.13.1 por `pnpm` encontró `ENOTFOUND` al consultar `nodejs.org`; no se cambió la configuración del workspace. Las suites se ejecutaron directamente con el Jest local y `--no-cache` bajo Node 24.18.0, usando la configuración de integración y las variables `DB_HOST=127.0.0.1`, `DB_PORT=5433`, `DB_NAME=iwana_it_g7_ci` e `IWANA_DB_INTEGRATION_AVAILABLE=true`.

## Ruta y estado

La ruta de este informe se comprobó libre antes de crearlo. No se modificaron contratos ni migraciones, no se migró `dbiw` y no se creó commit. Se preservaron los demás cambios locales preexistentes.
