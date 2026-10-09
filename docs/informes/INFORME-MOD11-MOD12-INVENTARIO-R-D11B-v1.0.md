# Informe de implementación MOD11 ↔ MOD12 — R-D11b

**Fecha:** 2026-10-09  
**Agente:** sr-backend  
**Dictamen:** **GO para el alcance implementado y los gates ejecutados**  
**Método:** limpieza por edad en ambas colas de origen, programada desde API y worker. Pruebas Jest sin caché. No se consultaron ni modificaron jobs de Redis del caso histórico. **Sin commit.**

## Cambios

- `InventoryExecutionRequestProcessor` registra cada hora un job repetible en la cola de solicitudes. Al procesarlo, limpia `inventory-execution-requests` y `operations-execution-events`.
- `ExecutionOrderRelayService` registra el mismo ciclo horario en la cola del relay. El `ExecutionOrderRelayProcessor` también limpia ambas colas. Los IDs de los repetibles son distintos para que API y worker puedan mantener su propio ciclo.
- Cada limpieza llama `queue.clean(86_400_000, 1_000, 'failed')`, sin inspeccionar nombre, `eventType` ni payload. Repite por lotes mientras BullMQ devuelva exactamente 1.000 IDs; así un backlog mayor que un lote no queda esperando al siguiente ciclo.
- Los fallos del cleaner se registran por cola y tipo de error permitido, sin texto crudo de la excepción.

## Pruebas

Los tests modelan cada proceso por separado: el caso API activa solo su processor y el caso worker solo el relay processor. Ambos cubren ambas colas, un job malformado vencido, la eliminación de 1.001 jobs vencidos en más de un lote y la conservación de un job reciente. Las pruebas del worker verifican además el registro del repetible horario desde `onApplicationBootstrap()`.

Comandos ejecutados desde `C:\appiw`:

```text
pnpm --filter @iwana/api exec jest --no-cache --runInBand src/modules/inventory
Test Suites: 3 skipped, 78 passed, 78 of 81 total
Tests:       8 skipped, 798 passed, 806 total

pnpm --filter @iwana/worker exec jest --no-cache --runInBand
Test Suites: 17 passed, 17 total
Tests:       142 passed, 142 total
```

La configuración del API excluye `*.postgres.integration.spec.ts`; el worker excluye `*.integration.spec.ts`. Estos gates no conectaron a Postgres ni Redis y no tocaron el consumo SQL histórico. Los conteos reflejan una ejecución sin caché.

## [CONSULTA] Precisión del límite temporal de D11

La implementación sigue la cadencia y el umbral explícitos: limpieza cada hora con `grace = 86_400_000` ms. Un job que supera 24 horas justo después de un ciclo puede esperar casi una hora al siguiente; por tanto, el diseño puede borrarlo entre 24 y menos de 25 horas desde `failedAt`, suponiendo que el proceso que mantiene el repetible pueda procesarlo y que Redis esté disponible. La iteración por lotes evita sumar ciclos horarios por tener más de 1.000 jobs vencidos.

Esto no demuestra un límite literal de 24 horas desde el fallo. La frase de D11 “máximo de 24 horas mientras API o worker esté activo” y la combinación prescrita de ciclo horario más `grace=24h` no son matemáticamente equivalentes. Se eleva para aclaración de diseño; no cambié ni la cadencia ni el `grace` contra la decisión vigente.

## Cierre

Los dos procesos programan una limpieza que puede operar por sí sola y borra los fallidos con más de 24 horas de edad sin depender del contenido del job. Los tests de retención y los gates solicitados pasan. La precisión de la garantía temporal queda como consulta; el informe no declara demostrado un máximo literal de 24 horas desde `failedAt`.

**Sin commit.**
