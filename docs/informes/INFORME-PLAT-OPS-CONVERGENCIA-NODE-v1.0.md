# Informe de fase — Convergencia de runtimes Node a 24 LTS

**Módulo:** PLAT-OPS  
**Fase:** CONVERGENCIA-NODE  
**Versión:** 1.0  
**Estado:** Ejecutado — gates locales completados; CA-12 cerrado con decisión documentada; G6.5/CA-03 pendiente de corrida remota (evidencia en actualización posterior)
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
| CA-03 / G6.5 | CI remoto sobre SHA identificable | **Pendiente:** los workflows están cableados, pero no existe una corrida GitHub Actions identificable en esta ejecución |
| CA-14 | `audit:doc-locations` y `audit:adr-citations` | `BLOQUEANTE: 0`; avisos preexistentes documentados |
| CA-15 | Eliminación de 12 `iwana-verify/*` y purge de caché | Baseline restaurado: 8 imágenes/2,215 GB; caché 0 B; volúmenes preservados |

La evidencia histórica no contiene tiempos/tamaños individuales antes de la fase; se reporta como no disponible, sin inventar valores. La decisión de cierre de CA-12 está documentada en la sección `[DESEMPATE]` correspondiente.

## Verificación de G6.5 y disponibilidad del baseline

Se intentó obtener una corrida remota de GitHub Actions para un SHA
identificable. La integración disponible devolvió `404 Not Found` para el
repositorio privado `SleyiW/iWana-neXt`; `git ls-remote` confirmó que la rama
`codex/plat-ops-convergencia-node` aún no existe en `origin`, y `gh` no está
instalado en el entorno. Por tanto no se atribuye un run remoto ni un SHA que
no puedan ser auditados. G6.5/CA-03 permanece pendiente hasta que un runner con
acceso publique esa evidencia.

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

La fase queda técnicamente verificada en local. El cierre requiere una corrida
G6.5 de GitHub Actions asociada a un SHA y una decisión documentada sobre la
ausencia de baseline individual histórico para CA-12; no se inventa ninguna de
las dos evidencias.
