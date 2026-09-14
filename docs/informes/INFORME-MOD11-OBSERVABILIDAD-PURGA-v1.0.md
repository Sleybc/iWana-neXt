# Informe de fase — MOD11: la purga de retención deja rastro

**Versión:** 1.0
**Fecha:** 2026-09-14
**Agente:** AI-SR-FULL (`sr-backend`)
**Encargo:** `docs/prompts/PROMPT-MOD11-OBSERVABILIDAD-PURGA-v1.0.md` v1.0
**Tramo base:** `INFORME-MOD11-RETENCION-v1.0.md` (exigencia 3 cerrada; este encargo no la reabre)

## 1. Hallazgo y corrección

`ExecutionOrderTombstoneProcessor` descartaba la fila de seis conteos de `purge_execution_order_retention_batch`. Desde la migración 134 uno de ellos (`status_transitions_anonymized`) es cumplimiento de retención de dato personal: la corrida ahora captura el resultado por tenant y emite resumen por corrida.

**Archivos tocados (2):**

- `apps/worker/src/processors/execution-order-tombstone.processor.ts` — `processTenant` devuelve `PurgeRetentionCounts` (normaliza BIGINT/string a número; sin filas = ceros); `process()` acumula totales, emite `debug` por tenant y `log` de resumen **siempre** (incluso todo en cero), antes del `AggregateError` si algún tenant falló. Sin PII: solo `schema_name` y conteos.
- `apps/worker/src/processors/execution-order-tombstone.processor.spec.ts` — 3 casos nuevos; los 5 existentes intactos.

**No tocado:** función SQL, migración 134, cron (`0 4 * * *`), `jobId`, lote (500), transacción (BEGIN/COMMIT/ROLLBACK intactos — lo aserta el caso 2 por orden de llamada), `@iwana/shared`, métricas/alertas.

## 2. Evidencia (jest directo, `--ci --runInBand --no-cache`, sin `--passWithNoTests`)

- Spec del procesador: **8/8** (5 existentes + 3 nuevos: conteos no-cero, ceros que igual emiten línea, texto emitido sin PII verificado con `not.toMatch(/reason|changed_by|actor/i)`).
- Worker completo: **15 suites, 108/108**.
- `eslint` ficheros tocados: limpio. `tsc --noEmit` worker: limpio.

## 3. Stop/go (§6)

- Corrida deja seis conteos + tenants procesados en el log: **sí**.
- Corrida sin nada que purgar deja rastro: **sí** (línea incondicional).
- Sin PII, verificado sobre texto emitido: **sí**.
- Cinco casos existentes en verde con conteo real: **sí**.

**Veredicto: GO.**

## 4. Deuda por severidad

- **Ninguna nueva.** Semántica a conocer: el resumen refleja tenants exitosos; un tenant fallido aparece en el `error` existente y en el `AggregateError`, no en los conteos. Un fallo total de la query de tenants sigue sin resumen (propaga excepción: «no corrió» visible como error, no como silencio).
