# Actualización R5 — repetición E2E y conciliación

- **Versión:** 1.3
- **Fecha:** 2026-10-06
- **Agente:** AI-SR-QA (`sr-qa`)
- **Base:** [R5 v1.2](INFORME-MOD11-CONSOLA-OT-OLA2B-R5-SR-QA-v1.2.md)
- **Plan vigente:** plan v1.2, §Registro de bloqueos — Ola 2
- **Adenda aplicada:** A1 de `PROMPT-MOD11-CONSOLA-OT-OLA2B-R5-CIERRE-SR-QA-v1.0.md`

## Repetición E2E

Se verificó libre el puerto **3002** antes de la corrida. Se ejecutó la suite con `PW_FORCE_FRESH_SERVER=1`; en `e2e/playwright.portal.config.ts` esto desactiva `reuseExistingServer` y arranca el servidor propio con Webpack en 3002. No se detuvo ningún proceso ajeno. Al terminar, Playwright cerró su servidor y el puerto 3002 quedó libre. Windows denegó (`Acceso denegado`) la lectura WMI de commandlines de procesos; por ello la evidencia de aislamiento es el puerto objetivo libre y el arranque forzado, no un inventario global de procesos Next en otros puertos.

Comando exacto:

```powershell
$env:PW_FORCE_FRESH_SERVER='1'; node node_modules/@playwright/test/cli.js test --config e2e/playwright.portal.config.ts e2e/tests/portal-operations-consola-ot-b0.spec.ts e2e/tests/portal-operations-consola-ot-r2.spec.ts e2e/tests/portal-operations-consola-ot-r3.spec.ts e2e/tests/portal-operations-consola-ot-ola1.spec.ts e2e/tests/portal-operations-origen-ot-e4.spec.ts --reporter=list
```

**Resultado: 16/16 aprobados**, 0 fallidos, 45.2 s; proceso finalizó con código 0. Desglose: B0 2, R2 5, R3 4, Ola 1 2 y E4 3. `AuthProvider` no volvió a fallar, por lo que esta repetición no genera hallazgo para `fe-platform` ni traza de error.

## Conciliación de inventario de OTE-20261006-003

La lectura SQL de solo consulta a las **20:04:19 UTC** encontró la OT `COMPLETED`, pero el uso sigue `PENDING` y `stock_movement_id` continúa `NULL`. El `inventoryRequestId` es **`42cb6c95-a3e7-4179-95db-b6b47e55c4d6`**.

La outbox contiene `InventoryConsumptionRequestedV1` para esa solicitud, publicado a las 19:23:05 UTC sin error. El inbox registra ese evento procesado por `mod11-operation-projection` a las 19:23:05 UTC. El handler de ese tipo en `apps/worker/src/processors/execution-order-events.processor.ts` acusa recibo sin ejecutar conciliación: el comentario del código delega el consumo a MOD12; la actualización a `CONFIRMED` sólo se dispara al recibir `InventoryMovementConfirmedV1`. No hay evento `InventoryMovementConfirmedV1` ni `InventoryMovementRejectedV1` para la solicitud, ni movimiento de stock con origen en esta OT. Por tanto, el estado no convergió tras el procesamiento observado.

**Hallazgo para `sr-backend`:** investigar la ruta de consumo/confirmación entre MOD12 y la conciliación MOD11 para `inventoryRequestId=42cb6c95-a3e7-4179-95db-b6b47e55c4d6`. Evidencia al corte: uso `PENDING`, sin movimiento ni evento de respuesta; solicitud original publicada y procesada por el worker de proyección como evento emisor. No se fabricó una confirmación ni se cambió el estado manualmente.

## Alcance heredado y veredicto

- **CA-09:** se conserva cerrado con evidencia de API y SQL según v1.2. No se repitió.
- **NVDA:** los datos aceptados en v1.2 permanecen listos; la ejecución manual sigue asignada a una persona. No se repitió ni automatizó.
- **P95:** permanece en G7; no se midió.
- **Criterios técnicos de R5 según A1: GO.** Los 16 E2E pasan contra servidor fresco y CA-09 está demostrado. El veredicto final de R5 sigue condicionado al recorrido manual NVDA. El hallazgo de conciliación se registra por separado para `sr-backend`.
- No se modificaron OT de `tenant_iwana`, no se cambió código de producto y no se creó ningún commit.
