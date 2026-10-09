# Informe I3 — Consola MOD11 ↔ MOD12

**Fecha:** 2026-10-06  
**Agente:** fe-platform  
**Estado:** implementación lista; gate global de `operations/` con cuatro fallos fuera del alcance I3. Sin commit.

## Implementación

- `ExecutionOrderMaterialAction.tsx` muestra el motivo de rechazo en dos partes usando el copy literal de la spec §4 para `CUSTODY_INSUFFICIENT`, `SERIAL_NOT_IN_CUSTODY`, `SUBSCRIBER_REQUIRED` e `ITEM_INACTIVE`. El código interno no se presenta al técnico.
- El aviso de pendiente prolongado muestra las dos partes del copy de §4 cuando un consumo sigue `PENDING` y supera los 15 minutos desde `createdAt`. Un refresco cada minuto hace aparecer el aviso si la pantalla permanece abierta.
- `INVENTORY_CONSUMPTION_PENDING_THRESHOLD_MS` concentra los 15 minutos en `@iwana/shared`; la comprobación de fecha inválida no genera un aviso engañoso.
- Se añadieron pruebas del copy de los cuatro rechazos, del corte temporal y de las fechas inválidas.

## Gates y resultados

| Gate | Comando / resultado |
| --- | --- |
| Typecheck portal | `pnpm --filter @iwana/portal typecheck` llegó a `tsc` pero no pudo escribir `apps/portal/tsconfig.tsbuildinfo` por `EPERM`. Repetido sin artefacto incremental: desde `apps/portal`, `./node_modules/.bin/tsc.CMD --noEmit --incremental false` — **PASS**. |
| Suites directamente modificadas | Desde `apps/portal`: `./node_modules/.bin/jest.CMD --config jest.config.js --runInBand --no-cache src/components/operations/ExecutionOrderMaterialAction.spec.tsx src/components/operations/use-execution-order-custody.spec.ts` — **2 suites, 61/61 tests PASS**, sin caché. |
| `operations/` completo | Desde `apps/portal`: `./node_modules/.bin/jest.CMD --config jest.config.js --runInBand --no-cache src/components/operations` — **44 suites, 767 tests: 763 PASS, 4 FAIL**, sin caché. Mi prueba de corte quedó verde en la segunda corrida; persisten los mismos cuatro casos de `use-execution-order-console.spec.ts` detallados abajo. |
| `audit-ui.mjs` | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations` — **sin hallazgos**. El recorrido global también terminó con código 0 y cero hallazgos deterministas bloqueantes; sus avisos heurísticos `[revisar]` están en rutas ajenas a I3. |
| Formato | `prettier --check` de los cuatro archivos de operaciones y los dos archivos de `@iwana/shared` — **PASS**. |

El intento de ejecutar Jest con Turbo (`turbo run test --filter=@iwana/portal --force`) se detuvo porque Turbo no pudo escribir sus logs/cache (`Acceso denegado`, `EPERM`). Por eso los resultados anteriores usan el binario local de Jest con `--no-cache`, que ejecuta las pruebas sin reutilizar caché.

## Fallos observados fuera de I3

Los siguientes cuatro fallos de `apps/portal/src/components/operations/use-execution-order-console.spec.ts` aparecieron en ambas corridas completas. No se modificó ese archivo ni su hook; se clasifican como hallazgo preexistente aparente, fuera del cambio I3:

1. `espera a que el archivo quede disponible antes de registrar la evidencia`: esperaba `getEvidenceAsset('eo-evidence-001', 'asset-001')`; recibió cero llamadas.
2. `muestra un error si el análisis termina en REJECTED`: esperaba `El archivo no superó la revisión y no se registró. Selecciona otro archivo para continuar.`; recibió `No fue posible completar la operación. Intenta de nuevo.`
3. `muestra un error si el análisis termina en EXPIRED`: esperaba `El archivo venció antes de completar la revisión y no se registró. Vuelve a seleccionarlo para adjuntarlo.`; recibió `No fue posible completar la operación. Intenta de nuevo.`
4. `limita a seis consultas y deja la evidencia sin registrar si sigue en análisis`: esperaba seis llamadas a `getEvidenceAsset`; recibió cero.

La suite global alcanza el mínimo numérico de 759, pero no queda completamente verde por esos cuatro fallos. Los dos suites modificados pasan.

## Nota de integración

La consola compara `createdAt` con la ventana compartida de 15 minutos, que es el valor por defecto de D7. Si el worker se configura con un umbral distinto, la UI necesitará recibir esa configuración para conservar el mismo corte; el contrato actual de `ExecutionOrderItemUsage` no expone `last_requested_at` ni `request_attempts`.
