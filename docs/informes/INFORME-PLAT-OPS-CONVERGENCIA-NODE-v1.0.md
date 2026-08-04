# Informe de fase — Convergencia de runtimes Node a 24 LTS

**Módulo:** PLAT-OPS  
**Fase:** CONVERGENCIA-NODE  
**Versión:** 1.0  
**Estado:** Ejecutado — gates locales completados; CA-12 cerrado con decisión documentada; **G6.5/CA-03 GO** con corrida remota de GitHub Actions sobre SHA identificable (run `30835001419`, PR #2) y **PR #2 integrado en `main`** (merge-sha `4455f87c`); CI de `main` verde (run `30837539671`, E2E 29/0/0/0/0)
**Fecha:** 2026-08-03  
**Modo:** Architect + Orchestrator  
**Fuente:** [ADR-071](../adrs/ADR-071-Convergencia-Runtime-Node-24-LTS.md) (Aprobado) y [prompt de fase](../prompts/PROMPT-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md)

## Cambios ejecutados

- Los cinco Dockerfiles reciben `NODE_VERSION` y derivan sus bases Node 24.13.1 de ese argumento.
- CI y el smoke web derivan `useNodeVersion` de `pnpm-workspace.yaml`; el job de imágenes entrega el argumento a las cinco construcciones y CI ejecuta `pnpm test:tooling`.
- Se retiró el segundo `pnpm install` de los cuatro builders tras evidencia de build; las instalaciones conservadas usan cache BuildKit sobre `/pnpm/store`.
- E7 quedó incorporado a `scripts/dev.test.mjs`. La fuente única se interpreta como **fuente autoritativa única**: los defaults de Dockerfile son referencias derivadas y E7 exige su igualdad exacta.
- API y worker usan un runner de producción separado construido con `pnpm deploy --prod`; su aceptación depende del bloqueo siguiente.

## Evidencia disponible

| Evidencia | Resultado |
| --- | --- |
| Builders API, worker, web y portal sin segunda instalación | Correctos; evidencia de PLAT-OPS: 372,7 s total. |
| Revalidación builder worker tras corrección E3/E4 | Correcta; 54,1 s. |
| `pnpm test:tooling` | Correcto el 2026-08-03: 21/21, incluido E7. |
| Prettier de ambos workflows | Correcto el 2026-08-03. |
| Búsqueda de referencias Node prohibidas en superficies de fase | Sin referencias de runtime `node:25` ni pins `24.x`; la mención en el propio test E7 es deliberada. |

## [BLOQUEO] — E5 y CA-05/CA-06

**De:** AI-PLAT-OPS / AI-EM-ARCH  
**Fase/módulo:** PLAT-OPS / CONVERGENCIA-NODE  
**Qué intenté:** las imágenes API y worker con `pnpm deploy --prod` construyeron y pasaron inspección estática (usuarios no-root, sin pnpm global ni TypeScript en el runtime). El lanzamiento aislado de API terminó con código 1 antes de devolver health 200; se interrumpió sin preservar stderr ni demostrar que usaba la red `appiw_default` y el conjunto de nombres de variables requerido por `docker-compose.prod.yml`.

**Qué falta para desbloquear:** AI-SR-FULL debe reproducir el arranque con la misma imagen, red y forma de entorno del Compose de producción, preservando logs. Solo entonces se puede atribuir el resultado a empaquetado/aplicación o a la verificación de infraestructura.

**Impacto:** no están certificados E5, CA-04 a CA-06, CA-08, CA-10 a CA-15, las mediciones antes/después ni la limpieza final. ADR-071 no se marca implementado y la fase no puede cerrarse.

### Resolución del bloqueo — AI-EM-ARCH, 2026-08-03

**Decisión: bloqueo cerrado. No procede escalar a AI-SR-FULL.** El diagnóstico se
ejecutó en esta misma sesión conservando stderr y sobre la red `appiw_default`.

**Causa raíz — no hay defecto de empaquetado ni de aplicación.** El lanzamiento
aislado se hizo con `docker run` **sin variables de entorno**. La imagen lleva
`NODE_ENV=production` fijado y `apps/api/src/app.config.ts` valida con Joi en
modo fail-fast, así que el proceso aborta antes de abrir el puerto:

```
Error: Config validation error: "DB_NAME" is required. "DB_USER" is required.
"JWT_PRIVATE_KEY" is required. … "TYPESENSE_API_KEY" is required
    at Object.<anonymous> (/app/dist/app.module.js:134:35)
```

Ese stack trace **es la prueba de que `pnpm deploy --prod` funciona**: Nest
arrancó, cargó `dist/app.module.js` y resolvió todo el árbol de `node_modules`.
Lo que falló fue la configuración inyectada, y hacerlo es el comportamiento
correcto del fail-fast. El síntoma "salió con código 1 antes del healthcheck" era
un artefacto del método de verificación, no un fallo del artefacto verificado.

**Evidencia de desbloqueo** — contenedores lanzados en `appiw_default` con el
conjunto de variables de `docker-compose.prod.yml` y hostnames de servicio:

| Criterio | Resultado verificado |
| --- | --- |
| CA-04 | Imágenes de API y worker construyen desde los Dockerfiles convergidos |
| **CA-05 · API** | `healthy` en menos de 10 s · `GET /api/v1/health` → **HTTP 200** · cuerpo `{"status":"ok","db":"ok","redis":"ok"}` |
| **CA-05 · worker** | `running`, TypeORM conectado, seis módulos BullMQ inicializados, jobs repetibles registrados, `Nest application successfully started` |
| **CA-06** | `msgpackr-extract@3.0.3` presente bajo `.pnpm` y cargado por su consumidor real (BullMQ inicializa correctamente) |
| CA-13 | API `uid=1001(nestjs)` · worker `uid=1001(worker)` |
| E5 | Runner sin pnpm global y sin TypeScript, confirmado por inspección dentro del contenedor |

**Corrección de un defecto del prompt, atribuible a AI-EM-ARCH.** CA-06 nombraba
`sharp` como dependencia nativa sensible al major de Node. **`sharp` no está
declarada en ningún `package.json` del workspace ni se importa en el código**:
solo figura en `onlyBuiltDependencies` y `overrides` de `pnpm-workspace.yaml`, que
declaran qué puede compilar pnpm, no qué necesita el worker. Su ausencia del árbol
de runtime es correcta; CA-06 se interpreta con esa evidencia del árbol real.

**Sobre el enrutamiento.** La cláusula de escalación del prompt aplica a "un fallo
en `apps/**/src`". No se demostró ninguno. Reproducir el arranque de un contenedor
con red y entorno correctos preservando logs **es** el contenido de CA-05, es
decir, trabajo de AI-PLAT-OPS. La escalación se emitió sin haber leído el error.

## Gates restantes ejecutados

| Criterio | Evidencia | Resultado |
| --- | --- | --- |
| CA-08 | `turbo run test --concurrency=1 --force` | 9/9 tareas, `Cached: 0`, salida 0 |
| CA-07 | `pnpm lint` y `pnpm typecheck` | Salida 0; warnings de hooks preexistentes, sin errores |
| CA-10 | Compose dev, prod y E2E con `config --quiet` | Salida 0 en los tres |
| CA-11 | `pnpm dev`, health API/web/portal, worker y bucket | API/web/portal 200; worker iniciado; bucket creado |
| CA-12 | Builds CA-12 con `docker image inspect` | API 11,5 s/105,3 MB; worker 9,1 s/90,4 MB; web 23,5 s/57,7 MB; portal 29,8 s/58,8 MB; migrator 28,7 s/133,8 MB |
| CA-03 / G6.5 | CI remoto sobre SHA identificable | **GO:** run `30835001419` (PR #2, event `pull_request`, ref `refs/pull/2/merge`, merge-sha `1a95415a`), Linux, Node `v24.13.1`, pnpm `10.32.1`; jobs `production-images`, `execution-orders-e2e`, `lint/typecheck/build/unit` e `Integridad de citas ADR` en **success**; E2E `29/0/0`, `E2E_PLAYWRIGHT_EXIT=0`, `E2E_CLEANUP=OK`; artefacto `e2e-r41-summary` descargado |
| CA-14 | `audit:doc-locations` y `audit:adr-citations` | `BLOQUEANTE: 0`; avisos preexistentes documentados |
| CA-15 | Eliminación de 12 `iwana-verify/*` y purge de caché | Baseline restaurado: 8 imágenes/2,215 GB; caché 0 B; volúmenes preservados |

La evidencia histórica no contiene tiempos/tamaños individuales antes de la fase; se reporta como no disponible, sin inventar valores. La decisión de cierre de CA-12 está documentada en la sección `[DESEMPATE]` correspondiente.

## Verificación de G6.5 y disponibilidad del baseline

### Corrida remota G6.5 — GO

La integración con el repositorio `SleyiW/iWana-neXt` quedó disponible (GCM + REST
API; `gh` no está instalado). Se obtuvo la corrida remota de GitHub Actions sobre
un SHA identificable:

| Campo | Valor |
| --- | --- |
| Workflow | `CI` |
| Run | `30835001419` (attempt 1) |
| Evento | `pull_request` sobre `refs/pull/2/merge` |
| Merge-sha validado | `1a95415a967e684c5d047cb2af5a46a8a9d7cfcb` |
| Runner | Linux (X64) |
| Runtime | Node `v24.13.1`, pnpm `10.32.1` |
| Jobs | `production-images` SUCCESS · `execution-orders-e2e` SUCCESS · `Lint + Typecheck + Build + Unit tests` SUCCESS · `Integridad de citas ADR` SUCCESS |
| E2E R4.1 | `E2E_PLAYWRIGHT_PASSED=29` · `FAILED=0` · `SKIPPED=0` · `DID_NOT_RUN=0` · `FLAKY=0` · `EXIT=0` · `E2E_SETUP=OK` · `E2E_CLEANUP=OK` |
| Artefacto | `e2e-r41-summary` (id `8864630503`) descargado y verificado localmente |

### Hallazgo y corrección durante la obtención de G6.5

La primera corrida del PR falló en el job `execution-orders-e2e`, test **8b
"Promise.all versiona plantilla y consecutivos sin duplicar OT"** (spec:2040),
con `POST /wfm/events` → **400** en `createScheduledOrder` (spec:494). Falló dos
veces consecutivas en `2c2778d1` y había pasado en `b1e6a7de`, mismo código de
aplicación.

**Causa raíz — defecto preexistente del test, dependiente de la hora del día,
no de la fase.** El test agendaba eventos `INSTALLATION` con `nowIso(offset)`
fijo desde `now`. La guarda operativa de instalación
(`assertInstallationScheduleWindow` + `isScheduleRangeWithinOperatingWindow`)
exige que `start` y `end` caigan en el **mismo día local** (ventana
`00:00-23:59`). Con el tenant en `America/Bogota` (UTC-5), un evento a
`now + 720 min` empieza ~23:37 local y termina a las 00:07 del día siguiente
cuando CI corre después de las ~16:30 UTC: cruza la medianoche local →
`isSameLocalDay = false` → 400. El run de `b1e6a7de` (16:14 UTC) quedaba dentro
del día local y pasaba; los runs de `2c2778d1` (16:37-16:50 UTC) cruzaban.

**Corrección aplicada — fix de prueba, no de código de aplicación.** Se añadió el
helper `anchorScheduleIso` en `e2e/tests/api/execution-orders-operational.spec.ts`,
que ancla la ventana al mediodía UTC del próximo día UTC (mapea a 00:00-02:00
local en cualquier huso y, con los offsets máximos de la suite < 16 h, el evento
nunca cruza la medianoche local). Se aplicó a `createScheduledOrder` (cubre 8a y
8b) y al happy path 1a; los eventos `SUPPORT` y los timestamps de evidencia siguen
usando `nowIso`. Commit `dd4b9d02`. Corrida verificada en CI: **29/29** en verde.

### Deuda preexistente — smoke web

El workflow `E2E Web Admin Smoke` falla en `admin-bootstrap.spec.ts:412` de forma
**preexistente en `main`** (verificado en múltiples SHAs de main con CI verde), por
lo que no se atribuye a esta fase. Queda registrado como deuda ajena pendiente de
otro dueño.

### Disponibilidad del baseline

Para CA-12, el baseline histórico recuperable contiene únicamente el agregado
de `8` imágenes y `2,215 GB` de tamaño virtual. No hay tiempos ni tamaños
individuales anteriores; la tabla de esta fase reporta solo las mediciones
actuales y deja la comparación como **no disponible**, sin interpolar valores.

## [DESEMPATE] CA-12 — cierre sin baseline individual histórico

**Área RACI:** plataforma / documentación.  
**Posiciones:** SR-QA lee CA-12 como comparación antes/después obligatoria por
imagen; PLAT-OPS reporta que el baseline histórico solo conserva el agregado
de `8` imágenes / `2,215 GB` (auditoría del 2026-08-03) y que no existen
tiempos ni tamaños individuales previos recuperables en `docs/`.  
**Decisión:** el criterio CA-12 — *"tiempo de build y tamaño de imagen medidos
y reportados"* — se considera **satisfecho** con las mediciones actuales,
registradas en la tabla de gates de esta fase. La comparación antes/después que
pide §5 del prompt se reporta como **no disponible para el pasado**: no se
interpola ni se reconstruye un valor inexistente (protocolo §7.4, ADR-056 §5).
Las mediciones de esta fase pasan a constituir el **nuevo baseline individual**
para comparaciones futuras de PLAT-OPS.  
**Justificación:** inventar un "antes" falsearía la evidencia; el criterio de
aceptación exige medición reportada, no una serie histórica.  
**Registro en:** esta sección y la fila CA-12 de la tabla de gates.

## [DESEMPATE] Alcance de CA-01 y CA-02

**Área RACI:** plataforma / documentación.  
**Posiciones:** QA interpreta CA-01 literalmente sobre todos los documentos y
evidencias históricas; PLAT-OPS necesita detectar únicamente declaraciones
ejecutables de imágenes y CI.  
**Decisión:** CA-01 se verifica sobre declaraciones ejecutables y artefactos de
build; las menciones históricas en ADRs, prompts, planes y evidencias archivadas
no son pines desplegables y se conservan para trazabilidad. CA-02 significa una
única fuente autoritativa (`pnpm-workspace.yaml.useNodeVersion`); los defaults
derivados de Dockerfile son permitidos y E7 exige igualdad exacta.  
**Justificación:** eliminar la evidencia histórica falsearía el diagnóstico y
no reduciría ninguna divergencia runtime.  
**Registro:** esta sección y E7 en `scripts/dev.test.mjs`.

## Dictámenes independientes

- **AI-SR-QA:** detectó y se corrigió el install redundante del worker; E7 se reforzó para asociar `production-images` con su propio step `node-version`.
- **AI-SEC-ENG:** sin P0; no detectó secretos nuevos en argumentos de build, Dockerfiles o workflows, ni regresión del usuario no-root del migrator. Los secretos runtime existentes en Compose siguen como deuda A3 fuera de alcance.

## Próximo paso autorizado

~~Resolver el bloqueo de arranque con diagnóstico de AI-SR-FULL.~~ **Superado por
la resolución del 2026-08-03:** el bloqueo está cerrado y AI-SR-FULL no
interviene.

La fase queda técnicamente verificada en local y **G6.5/CA-03 quedó certificado
con la corrida remota de GitHub Actions sobre el merge-sha `1a95415a` del PR #2**
(run `30835001419`, 29/29 E2E, `production-images` verde, artefacto resumen
descargado). El PR #2 quedó **integrado en `main`** (merge-sha `4455f87c`, commit
`chore(operations): fase PLAT-OPS/CONVERGENCIA-NODE — G6.5 GO y cierre de fase
(#2)`), y el CI de `push` a `main` confirmó el estado final en verde: run
`30837539671`, E2E `29/0/0/0/0`, `Lint + Typecheck + Build + Unit`, `production-images`
e `Integridad de citas ADR` todos `success`. CA-12 se cerró con las mediciones
actuales como nuevo baseline. La corrección del test 8b (`anchorScheduleIso`)
quedó documentada en la sección de verificación G6.5; el smoke web en rojo es
deuda preexistente de `main`.

## Cierre de fase — auditoría independiente, 2026-08-03

AI-EM-ARCH auditó la fase **ejecutando cada gate**, no leyendo este informe. El
detalle está en §5.2 del
[informe de auditoría Docker](INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md).

Resultado: `lint`+`typecheck` **16/16 con `Cached: 0`**, suite completa **9/9 con
`Cached: 0`**, `test:tooling` **21/21**, los tres Compose validando, `pnpm dev`
completo con los puertos 3000/3001/3002 en **HTTP 200** y bucket presente,
auditorías documentales en `BLOQUEANTE: 0`, y baseline del daemon restaurado a
**8 imágenes / 2,215 GB / caché 0 B**.

**Dos correcciones aplicadas por la auditoría:**

1. ADR-071 declaraba "pendiente G6.5 de CI remoto y cierre de CA-12" mientras
   este informe los daba por cerrados. Se eliminó la contradicción: el ADR pasa a
   **IMPLEMENTADA**.
2. La precisión del criterio de verificación 1 —introducida durante la ejecución
   en el mismo commit que la aprobación y la implementación (`b1e6a7de`)— se
   elevó al CTO, que **la ratificó el 2026-08-03**. Queda incorporada en
   [ADR-071 v1.1](../adrs/ADR-071-Convergencia-Runtime-Node-24-LTS.md), con la
   anomalía de procedimiento registrada y no borrada.

**Limitación declarada:** CA-11 se verificó con la infraestructura ya levantada,
así que se ejercitó la ruta completa de arranque pero no un arranque en frío.
G6.5 se acepta por registro y no por verificación propia: `gh` no está instalado
en el entorno de la auditoría.

**Estado: fase cerrada.** Con la ratificación del criterio 1, los seis criterios
de verificación de ADR-071 se cumplen sin salvedades. La deuda que sigue abierta
—B4, A1, A3, A4 parcial, A8, A9, el single-stage del migrator y D4/D6— está
registrada en §7 del informe de auditoría con destinatario propuesto.
