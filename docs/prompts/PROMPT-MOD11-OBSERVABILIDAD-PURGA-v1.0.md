# PROMPT DE EJECUCIÓN — MOD11: la purga de retención deja de correr a ciegas

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`)
**Estado:** Ejecutable. Corrección acotada sobre el tramo de retención ya entregado.

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec del tramo: `docs/specs/2026-09-14-mod11-retencion-linea-tiempo-design.md` v1.0
- Dictamen: `docs/informes/INFORME-MOD11-B3-FINALIDAD-RETENCION-v1.0.md` §3.4 (logs sin PII)
- ADR marco: [ADR-089](../adrs/ADR-089-Linea-de-Tiempo-de-la-OT-de-Ejecucion.md) (Aprobado)
- Informe del tramo: `docs/informes/INFORME-MOD11-RETENCION-v1.0.md`

---

## 1. El hallazgo

`ExecutionOrderTombstoneProcessor` (`apps/worker/src/processors/execution-order-tombstone.processor.ts`) ejecuta:

```
SELECT * FROM "<schema>".purge_execution_order_retention_batch($1)
```

y **descarta el resultado entero**: no lo asigna a ninguna variable. La función devuelve **seis conteos** —`idempotency_records_deleted`, `outbox_events_deleted`, `inbox_events_deleted`, `audit_intents_deleted`, `evidence_upload_intents_deleted` y `status_transitions_anonymized`— y nadie mira ninguno.

**No es un defecto introducido por el tramo de retención.** El procesador ya era así, y su encargo no pedía tocarlo.

Lo que cambió es **la naturaleza de lo que se purga**. Hasta ahora esos conteos eran de infraestructura —idempotencia, outbox, intents—: saber cuántas filas se borraron era útil, no crítico. Desde la migración 134, uno de ellos es **el cumplimiento de una obligación de retención de dato personal** con plazo declarado de 24 meses.

Una obligación de cumplimiento que no puede verificarse en ejecución es una obligación a ciegas. Hoy, en producción, no habría forma de saber si la purga anonimiza, cuántas filas, ni si dejó de funcionar — y se descubriría tarde: el día que alguien pregunte por qué existen asientos de hace tres años con su actor intacto.

## 2. Qué hay que hacer

1. **Capturar el resultado** de la llamada a la función, por tenant, en vez de descartarlo. Viene como **una sola fila** con las seis columnas.
2. **Emitir una línea de log agregada por corrida** con los seis conteos y el número de tenants procesados. Patrón a replicar: `refresh-token-purge.processor.ts` (`logger.log` con el resumen de la corrida, `logger.debug` para el detalle por tenant).
3. **La línea se emite siempre, incluso con todos los conteos en cero.** Es la parte que no es obvia: sin ella, *«no purgó nada»* y *«no corrió»* son indistinguibles en los logs, y la segunda es justamente el fallo que este encargo quiere hacer visible.
4. El detalle por tenant va en `debug`; el resumen de la corrida en `log`. Mantén el `logger.error` de fallo tal como está.

## 3. Restricciones no negociables

- **No toques la función SQL** ni la migración 134. Esto es observabilidad del consumidor, no cambio de la purga.
- **No toques `@iwana/shared`** ni ningún contrato.
- **Sin PII en los logs** (dictamen B3 §3.4): identificadores operativos y conteos. Nunca `reason`, nunca `changed_by`, nunca volcado de filas. El `schema_name` ya se loguea hoy y sigue siendo aceptable.
- **No añadas métricas ni alertas.** Un exportador de métricas es trabajo distinto y desproporcionado aquí: el encargo es que la corrida deje rastro legible.
- **No cambies el cron, el `jobId`, el tamaño de lote ni la transacción.** El `COMMIT`/`ROLLBACK` se queda como está.
- Si capturar el resultado obligara a reestructurar la transacción, **detente y emite `[BLOQUEO]`**.

## 4. Tests

5. El spec del procesador tiene **cinco casos** hoy (`execution-order-tombstone.processor.spec.ts`). **Ninguno debe romperse**; se extienden, no se reescriben.
6. Caso nuevo: una corrida con conteos distintos de cero **loguea los seis**.
7. Caso nuevo: una corrida con todos los conteos en cero **también emite la línea** — es el paso 3, y es el que evita que el silencio se confunda con el éxito.
8. Caso nuevo: el log **no contiene PII**. Verifícalo sobre el texto emitido, no por inspección visual.
9. Conteo real: jest directo, `--ci --runInBand`, sin turbo y sin `--passWithNoTests`.

## 5. Entregables

- Procesador capturando y reportando los seis conteos.
- Los tres casos nuevos, con los cinco existentes intactos.
- Informe de fase en `docs/informes/` con la deuda que quede, si queda alguna.

## 6. Stop/go

**GO si y solo si:**

- Una corrida deja en el log los seis conteos y el número de tenants procesados.
- Una corrida sin nada que purgar **también deja rastro**: cero no equivale a silencio.
- Ningún log contiene PII, verificado sobre el texto emitido.
- Los cinco casos existentes siguen pasando, con conteo real.

**NO-GO si:** se modificó la función SQL, se añadieron métricas o alertas, o la línea de resumen solo se emite cuando hay filas afectadas. Esto último dejaría el hallazgo abierto con apariencia de cerrado.
