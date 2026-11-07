---
name: iwana-test-evidence
description: Ejecuta las pruebas de uno o mas paquetes de iWana neXt sin cache de Turbo y reporta el conteo real de suites, tests y cobertura. Usar al iniciar una ola para fijar la linea base de conteos, antes de declarar verde una fase, un informe, una ola o el gate de cobertura ≥80 %, y siempre que una corrida termine sospechosamente rapido o sin cifras. Complementa a verification-before-completion con los comandos y trampas propios de este monorepo.
metadata:
  category: testing
  triggers: tests verdes, evidencia, conteo de tests, linea base, carraca, cobertura, gate, turbo cache, passWithNoTests, inicio de ola, cierre de fase, informe
---

# Evidencia de pruebas real

**Regla:** un verde sin conteo no es evidencia. En este monorepo hay tres formas comprobadas de
obtener un verde que no ejecuto nada:

| Trampa | Por que ocurre | Como se detecta |
| --- | --- | --- |
| Cache hit de Turbo | `pnpm test` es `turbo run test`; con entradas sin cambios reproduce la salida anterior | La salida dice `cache hit, replaying logs` o `FULL TURBO` |
| `--passWithNoTests` | `@iwana/db test:integration` lo usa; un patron que no matchea da verde con 0 tests | `Tests: 0 total` o ninguna linea `Tests:` |
| Integracion en skip | Las specs de integracion hacen `describe.skip` sin `IWANA_DB_INTEGRATION_AVAILABLE=true` | `skipped` en el resumen, aviso `describe.skip activo` |

Las tres dan verde. Lo que las delata es comparar contra el conteo de **antes** de la ola:
una prueba borrada, saltada o que no corrio hace bajar `Tests` o subir `Skipped` aunque todo
pase. Por eso cada ola fija una linea base al empezar y la contrasta al cerrar.

## Linea base (al iniciar la ola, antes de tocar codigo)

1. Para cada paquete que la ola va a tocar, corre los pasos 1–3 de abajo sobre el arbol tal
   como esta, sin cambios propios de la ola.
2. Registra la tabla de **Formato de entrega** bajo el titulo `Linea base de pruebas` en el plan
   de la ola (`docs/plans/`) o, si no hay plan, en el INFORME de la fase. Anade el SHA de `HEAD`
   y la conclusion de la ultima corrida de CI de `main` (`gh run list --branch main --limit 1`).
3. Si un paquete ya esta rojo en la linea base, anota que suites fallan: son deuda previa, no
   de la ola, y el cierre no puede sumar fallos nuevos.

**Si la ola empezo sin linea base**, usa como sustituto los conteos de la ultima corrida de CI
verde del commit de partida (`gh run view <id> --log | grep -E "Test Suites:|Tests:"`) y
declaralo: el CI omite suites (por ejemplo B5), asi que un sustituto solo vale para los
paquetes cuyas suites corren completas en CI.

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

## Comparacion con la linea base (al cerrar la ola)

| Paquete | Tests antes → despues | Skipped antes → despues | Suites antes → despues | Justificacion de cada baja |
| --- | --- | --- | --- | --- |

- `Tests` o `Suites` que **bajan**: cada prueba borrada se nombra (`archivo` y `it`) y debe
  tener veredicto **justificado** de `test-change-reviewer`. Sin eso, el gate queda abierto.
- `Skipped` que **sube**: cada skip nuevo lleva su causa. Un skip por entorno (base o Redis
  ausentes) no es justificacion para cerrar: deja el gate **sin evidencia**.
- Fallos nuevos frente a la linea base: el gate **falla**, aunque el paquete ya estuviera rojo.
- Una subida de conteos no prueba nada por si sola: solo la baja es senal.
