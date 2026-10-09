---
name: iwana-test-evidence
description: Ejecuta las pruebas de uno o mas paquetes de iWana neXt sin cache de Turbo y reporta el conteo real de suites, tests y cobertura. Usar antes de declarar verde una fase, un informe, una ola o el gate de cobertura ≥80 %, y siempre que una corrida termine sospechosamente rapido o sin cifras. Complementa a verification-before-completion con los comandos y trampas propios de este monorepo.
metadata:
  category: testing
  triggers: tests verdes, evidencia, conteo de tests, cobertura, gate, turbo cache, passWithNoTests, cierre de fase, informe
---

# Evidencia de pruebas real

**Regla:** un verde sin conteo no es evidencia. En este monorepo hay tres formas comprobadas de
obtener un verde que no ejecuto nada:

| Trampa | Por que ocurre | Como se detecta |
| --- | --- | --- |
| Cache hit de Turbo | `pnpm test` es `turbo run test`; con entradas sin cambios reproduce la salida anterior | La salida dice `cache hit, replaying logs` o `FULL TURBO` |
| `--passWithNoTests` | `@iwana/db test:integration` lo usa; un patron que no matchea da verde con 0 tests | `Tests: 0 total` o ninguna linea `Tests:` |
| Integracion en skip | Las specs de integracion hacen `describe.skip` sin `IWANA_DB_INTEGRATION_AVAILABLE=true` | `skipped` en el resumen, aviso `describe.skip activo` |

## Pasos

1. **Lista lo que va a correr.** Si la lista esta vacia, detente y reportalo.

   ```bash
   pnpm --filter <paquete> exec jest <ruta-o-patron> --listTests
   ```

2. **Corre sin cache.**

   ```bash
   pnpm exec turbo run test --filter=<paquete> --force
   # o un archivo concreto, sin Turbo:
   pnpm --filter <paquete> exec jest <ruta>
   ```

   Paquetes: `@iwana/api`, `@iwana/worker`, `@iwana/portal`, `@iwana/web`, `@iwana/db`,
   `@iwana/shared`, `@iwana/ui`, `@iwana/storage`.

3. **Copia literal** las lineas `Test Suites:` y `Tests:` de la salida. Si hay `skipped`, explica por que.

4. **Cobertura** (gate ≥80 % en modulos core):

   ```bash
   pnpm test:coverage
   ```

   Lee `coverage/coverage-summary.json` del paquete y reporta lines/statements/branches/functions
   de los modulos tocados, no solo el total.

5. **Integracion con base real** solo si la fase la exige y hay PostgreSQL de dev arriba:
   `IWANA_DB_INTEGRATION_AVAILABLE=true pnpm --filter @iwana/db test:integration`.

## Formato de entrega

| Paquete | Comando | Suites | Tests | Skipped | Cobertura (modulo) | Fecha y hora |
| --- | --- | --- | --- | --- | --- | --- |

Nunca escribas «pasa», «verde» o «OK» sin las cifras de la fila. Si un paquete no se pudo
correr, la fila dice por que y el gate queda abierto.
