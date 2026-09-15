# INFORME — API: la suite nunca terminaba (fuga Redis/BullMQ en `app.bootstrap.spec.ts`)

**Versión:** 1.0
**Fecha:** 2026-09-15
**Autor:** AI-SR-QA (`sr-qa`)
**Encargo:** `docs/prompts/PROMPT-API-SUITE-NO-TERMINA-HANDLE-REDIS-v1.0.md`
**Estado:** **GO.** Criterios de stop/go cumplidos sin `--forceExit`, sin `skip` y sin borrar el spec.

Skills aplicadas (leídas como documentación antes de tocar nada): `testing-patterns`,
`nestjs-expert`, `bullmq-specialist`, `typescript-expert`.

---

## 1. Veredicto stop/go

| Criterio del encargo | Resultado |
| --- | --- |
| `pnpm exec jest --ci --runInBand` termina solo | **Sí, exit 0** (antes: cuelgue indefinido) |
| Cero `ECONNREFUSED` en el log completo | **0** (antes: 470) |
| Los 3 tests del spec existen y verifican lo mismo | **Sí**, mismas aserciones, 3/3 en verde |
| Conteo sin regresión | **0 fallos.** 323 suites en verde + 4 omitidas de siempre; 4048 tests en verde + 15 omitidos. Ver §5 sobre el delta 4040→4063 |
| La suite también termina sola con `maxWorkers 50%` (config real de `pnpm test`) | **Sí, exit 0**, conteos idénticos |
| Sin `--forceExit`, sin `skip`, sin borrar el spec | **Cumplido** |

## 2. Causa raíz (confirmada empíricamente)

El segundo test de `apps/api/src/app.bootstrap.spec.ts` compila un `TestingModule`
con `HealthModule`. El grafo `Health → Tasks → Assurance` (más `Users`, `Media`,
`Tenant`, `SearchQueue` en el mismo cierre) contiene varios
`BullModule.registerQueue`. Al compilar, `@nestjs/bullmq` hace
`new Queue(name, opts)` reales: sin `forRoot` en ese subgrafo la conexión cae al
default `localhost:6379`, donde nadie escucha; ioredis reintenta para siempre y el
handle sobrevive a `moduleRef.close()`.

Hallazgo propio de la investigación (sonda temporal, ya borrada): el `compile()`
de ese test **hoy ni siquiera tiene éxito** — falla con
`can't resolve dependencies of REDIS_CLIENT ... ConfigService` (no hay
`ConfigModule` en el subgrafo y el test lo absorbe en el `catch`, que solo
rechaza `UndefinedModuleException`) — **y aun así las colas ya se habían
instanciado antes del fallo**. Moraleja: el cuelgue no depende de que el
`compile()` llegue lejos; basta con que Nest instancie los providers de cola en
el camino. Por eso la corrección neutraliza la *construcción*, no el cierre.

Evidencia antes/después sobre el spec aislado:

| | Antes | Después |
| --- | --- | --- |
| `jest src/app.bootstrap.spec.ts --ci --runInBand` | Cuelgue (timeout 180 s superado) | **exit 0 en ~6 s** |
| `ECONNREFUSED` | sí (firma `127.0.0.1:6379`) | **0** |
| Tests | 3 pasan | 3 pasan, mismas aserciones |

## 3. Mecanismo elegido y justificación

**Dos dobles, cero conexiones, cero enumeración de colas:**

1. **`jest.mock('bullmq')` en el spec** — sustituye `Queue`, `Worker`,
   `FlowProducer` y `QueueEvents` por clases falsas cuyo constructor no conecta y
   cuyos `close()/disconnect()` son no-ops. Es el *punto de construcción* que usa
   internamente `@nestjs/bullmq` (`new queueClass(name, opts)`), así que cubre
   **todas las colas de hoy y las que el grafo sume mañana** (incluidas
   `registerQueueAsync` y futuros `FlowProducer`), sin nombrar ninguna.
2. **`.overrideProvider(REDIS_CLIENT).useValue({})`** en el `TestingModule` —
   neutraliza el `new Redis()` de `RedisModule`. Es **un token único y estable**,
   no una enumeración, luego tampoco envejece. Hoy el provider falla antes de
   conectar (falta `ConfigService`), pero fiarse de eso es frágil: si mañana el
   subgrafo resolviera `ConfigService`, el cliente real se abriría y volvería el
   cuelgue.

**Descartados (los dos que el encargo pedía razonar):**

- *Enumerar colas con `getQueueToken(...)`*: envejece mal — cada cola nueva
  exige editar el spec, y el olvido es silencioso (exactamente el defecto que
  costó dos horas).
- *Cerrar colas en `afterAll`*: no es vía — una cola que nunca conectó puede
  colgarse al cerrarse, y hereda el mismo problema de enumeración.

El scanner de Nest recorre el **mismo grafo** (mismos módulos, mismos
imports/providers; solo cambian las instancias de infraestructura), así que el
valor del test —detectar `UndefinedModuleException` en ese camino— queda
íntegro. No se tocó código de producción ni `modules/tasks/` (restricción E1
respetada: los únicos ficheros cambiados son el spec, su `package.json` y un
script de arnés).

## 4. Guarda contra la regresión silenciosa

**`scripts/jest-exit-guard.mjs`** + script `test:exit-guard` en `@iwana/api`
(`node ../../scripts/jest-exit-guard.mjs`). No toca CI: **cablearla a
`.github/workflows/ci.yml` requiere consulta previa a plat-ops** (pendiente,
ver §7). Corre `pnpm exec jest --ci` sobre `apps/api` (respeta el
`maxWorkers 50%`; acepta args tras `--`, p. ej. `-- --runInBand`) y falla con
exit 1 y mensaje explícito si:

1. jest escribe *"did not exit"* (fuga confirmada) — mata el árbol colgado;
2. el resumen (`Test Suites:`/`Tests:`) aparece y el proceso no sale solo en la
   gracia (30 s por defecto) — cuelgue mudo;
3. el log contiene cualquier `ECONNREFUSED` — firma de conexiones reales a Redis;
4. jest sale con código != 0 — se propaga.

Además **rechaza `--forceExit` en voz alta** (nota R-14): pasarlo sería tapar la
fuga que vigila.

Validación de la guarda (controles positivo/negativo, artefactos temporales ya
borrados):

| Control | Resultado |
| --- | --- |
| `--forceExit` | Rechazado, exit 1 |
| Spec arreglado (sale solo) | `OK ... Tests: 3 passed ... ECONNREFUSED=0`, exit 0 |
| Sonda sintética con handle abierto (`setInterval` vivo) | `FALLO: jest informo "did not exit"...`, árbol matado, exit 1 |

## 5. Barrido: no queda otra fuga

- **`--ci --runInBand`** (criterio GO): exit 0 solo, `Test Suites: 4 skipped,
  323 passed`, `Tests: 15 skipped, 4048 passed`, `ECONNREFUSED=0`.
- **Sin `--runInBand`** (config real de `pnpm test`, `maxWorkers 50%`): exit 0
  solo, conteos idénticos. No hay segunda fuente bajo paralelismo.
- **`jest.integration.config.js`**: 3 suites / 7 tests omitidos (sin DB
  disponible, skip ruidoso por diseño), exit 0 solo. Inspección: ninguno de los
  3 specs usa `TestingModule`, `BullModule`/`registerQueue` ni `REDIS_CLIENT`
  (solo TypeORM + servicios); no arrastra este defecto.

**Nota sobre el conteo 4040→4063:** el árbol trae cambios en curso de E1 sobre
`modules/tasks/` (specs modificados + spec nuevo, ajenos a este encargo y no
tocados). El delta son +23 tests en verde y **0 fallos, 0 omitidos nuevos**:
4 suites omitidas (las de siempre) y 15 tests omitidos preexistentes. Mi cambio
no añade, quita ni omite ningún test.

## 6. Ficheros cambiados

- `apps/api/src/app.bootstrap.spec.ts` — `jest.mock('bullmq')` con dobles sin
  conexión + `overrideProvider(REDIS_CLIENT)` en el segundo test. Mismas 3
  pruebas, mismas aserciones.
- `scripts/jest-exit-guard.mjs` — **nuevo**, guarda ruidosa (§4).
- `apps/api/package.json` — solo añade el script `test:exit-guard`; el pipeline
  `test` que corre CI queda intacto.

## 7. Pendiente (fuera de mi autoridad)

- **Cablear `test:exit-guard` en `.github/workflows/ci.yml`** (p. ej. paso tras
  los unit tests): requiere **consulta a plat-ops** antes de tocar el workflow.
  Sin ese paso, la guarda es manual; con él, el cuelgue futuro rompería CI en
  vez de colgarlo en silencio.
