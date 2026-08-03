# PROMPT DE EJECUCIÓN — Convergencia de runtimes Node a 24 LTS y optimización de imágenes

**Módulo:** PLAT-OPS (plataforma de ejecución)
**Código:** PLAT-OPS
**Fase:** CONVERGENCIA-NODE
**Versión:** 1.1
**Fecha:** 2026-08-03
**Cambio v1.0 → v1.1 (2026-08-03):** CA-06 nombraba `sharp`, que **no está
declarada en ningún `package.json` ni se importa en el código** — defecto del
prompt, atribuible a AI-EM-ARCH. Se corrige el criterio, se añade la §10 con el
método de verificación de runtime, se precisa la cláusula de escalación y se
registran CA-04, CA-05, CA-06 y CA-13 como ya satisfechos.
**Generado por:** AI-EM-ARCH (modo Architect + Orchestrator)
**Agente destinatario:** AI-PLAT-OPS
**Revisor obligatorio:** AI-SEC-ENG (cambia la base de las cinco imágenes desplegables)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*

> **Condición de entrada — SATISFECHA.**
> [ADR-071](../adrs/ADR-071-Convergencia-Runtime-Node-24-LTS.md) fue **aprobado
> por el CTO el 2026-08-03**, sin cambios de contenido. La fase está autorizada y
> **en curso**: E1-E4, E6 y E7 están ejecutados y E5 está verificado. Lo que
> queda es el bloque de gates de la **§10.3**; el resto de este prompt es la
> referencia de alcance y restricciones, no trabajo por rehacer.

---

## 0. Contexto (ya diagnosticado — no repetir el análisis)

Cuatro versiones de Node conviven en el repositorio, y **el runtime que CI valida
no es el que se despliega**: la suite corre en Node 24.x mientras las imágenes de
API, worker, web y portal se construyen sobre `node:25.8.2`, que terminó su vida
el 2026-06-01. El diagnóstico completo está en
[ADR-071](../adrs/ADR-071-Convergencia-Runtime-Node-24-LTS.md) §Contexto y en
[INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md)
§2.2 A7 y §2.3.

**No vuelvas a auditar esto.** El trabajo de esta fase es ejecutar la decisión y
aprovechar el rebuild obligatorio para pagar la deuda de build que ya está
identificada.

## 1. Objetivo exacto de la fase

**Resultado esperado:** las cinco imágenes del repositorio se construyen sobre
Node 24 LTS con la versión de patch declarada en un único lugar, CI valida y
construye sobre esa misma versión, y los Dockerfiles quedan sin el trabajo
duplicado que hoy los hace lentos.

**Lo que sí entra**

| # | Alcance | Origen |
| --- | --- | --- |
| E1 | Migrar `apps/{api,web,portal,worker}/Dockerfile` de `node:25.8.2` a Node 24 LTS, en ambas variantes (`-bookworm`, `-alpine`) | ADR-071 §Decisión.1 |
| E2 | Fuente única de versión: `pnpm-workspace.yaml` → `useNodeVersion`; los Dockerfiles la reciben por `ARG NODE_VERSION`; CI la lee del workspace en vez de `'24.x'` flotante | ADR-071 §Decisión.2 y .3 |
| E3 | Eliminar el **doble `pnpm install`** del stage `builder` de los cuatro Dockerfiles de apps | Auditoría C1 |
| E4 | Añadir `RUN --mount=type=cache` sobre el store de pnpm en los cinco Dockerfiles | Auditoría C2 |
| E5 | Runner de API y worker sobre base sin pnpm global y sin devDependencies | Auditoría C3 |
| E6 | Construir **api, web y portal** en CI, no solo worker y migrator | Auditoría propuesta 8 |
| E7 | Test que falle si las declaraciones de versión vuelven a divergir | ADR-071 §Riesgo |

**Lo que NO entra**

- Adoptar Node 26. Está descartado en ADR-071 §Alternativas con fecha de
  reevaluación propia (2026-10-28).
- Convertir `engines.node` en un pin. Su función es declarar el mínimo
  compatible; se queda en `>=24.0.0`.
- Multi-stage del migrator, escaneo CVE/SBOM/firma, segmentación de redes,
  límites de recursos, pgBouncer, heartbeat del worker. Son propuestas 7, 11 y
  15-21 de la auditoría, cada una con su propia decisión pendiente.
- Cambiar la variante de base de web y portal (`-alpine`) por `-bookworm` ni
  viceversa. La mezcla actual es preexistente y su unificación no está decidida.
- Cualquier cambio en `nginx.prod.conf`, dominio, TLS o HSTS: bloqueado por
  [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md).

## 2. Artefactos de entrada obligatorios

- **ADR aplicable:** [ADR-071](../adrs/ADR-071-Convergencia-Runtime-Node-24-LTS.md) — **debe estar `Aprobado`**
- **Informe de origen:** [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) §2.2, §2.3, §6
- **Antecedente:** [INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md) §5.1 y §5.6
- **Stack:** `docs/prds/Stack_Tecnologico.md`
- **Restricción vigente:** [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) — G7 diferido; nada de esta fase presupone entorno productivo
- **Perfil:** `docs/roles/Perfil_IA_Platform_Ops_Engineer_v1.md`
- **Skills:** `.agents/skills/INDEX.md` → dispatch de infraestructura y CI

**Artefacto faltante detectado:** no existe ADR ni spec que fije la variante de
base (`bookworm` frente a `alpine`) por tipo de servicio. Se documenta como
supuesto, no se decide en esta fase.

## 3. Instrucciones de ejecución

Ejecutar **en este orden**. La secuencia importa: cambiar la base invalida todo
el caché, así que E1-E2 van primero y las optimizaciones después, en un solo
rebuild.

1. **Fijar la versión.** Determinar la versión 24 LTS vigente y actualizar
   `useNodeVersion` en `pnpm-workspace.yaml`. Confirmar que el tag existe para
   **las dos variantes** (`-bookworm` y `-alpine`) antes de referenciarlo.
2. **Parametrizar los Dockerfiles.** `ARG NODE_VERSION` con default igual a la
   fuente, en las cinco imágenes. El migrator ya está en la línea 24: alinearlo
   al mismo mecanismo, no dejarlo con la versión escrita a mano.
3. **Cablear CI.** Sustituir las cuatro apariciones de `node-version: '24.x'`
   (`ci.yml:36,162,380`, `e2e-web-admin-smoke.yml:27`) por la lectura de la
   versión del workspace, y pasar `NODE_VERSION` como build-arg a los `docker
   build`. **Verificar que no queda ningún pin flotante.**
4. **E3 — quitar el doble install.** El stage `builder` copia `node_modules`
   desde `deps` y acto seguido reejecuta `pnpm install --frozen-lockfile`. El
   comentario del código dice que es para "rehidratar el grafo del monorepo":
   **verificar empíricamente si sigue siendo necesario** con la versión actual
   de pnpm. Si lo es, documentar por qué en el propio Dockerfile y dejarlo; si
   no, eliminarlo. No lo quites sin comprobar que los enlaces de workspace
   sobreviven.
5. **E4 — cache mounts** sobre el store de pnpm. Medir el tiempo de build en
   frío y en caliente, antes y después.
6. **E5 — runner limpio** de API y worker: base sin pnpm global y árbol de
   runtime sin devDependencies. Medir el tamaño de imagen antes y después.
7. **E6 — build de api, web y portal en CI.**
8. **E7 — test de no regresión** que compare la versión de los cinco
   Dockerfiles y de los workflows contra `useNodeVersion` y falle ante cualquier
   divergencia. Seguir el patrón del test que la auditoría añadió en
   `scripts/dev.test.mjs`, que deriva la lista esperada del propio
   `docker-compose.yml` en lugar de duplicarla.

## 4. Restricciones no negociables

- **No tocar código de aplicación.** Esta fase es de plataforma. Si la migración
  revela un fallo en `apps/**/src`, emitir `[BLOQUEO]` y escalar a AI-SR-FULL;
  no parchear.
  - **Umbral de escalación:** solo procede con el **error real capturado**. Un
    contenedor que sale con código 1 no es evidencia de defecto de aplicación
    mientras no se haya leído su stderr. Reproducir un arranque con la red y el
    entorno correctos preservando logs es contenido de CA-05, es decir, trabajo
    de esta fase — no motivo de escalación. *(En la ejecución v1.0 se escaló sin
    haber leído el error; la causa era el propio método de verificación.)*
- **No adoptar Node 26** ni ninguna versión fuera de la línea 24.
- **No usar tags flotantes.** Ni `node:24`, ni `24.x`, ni `latest`. La auditoría
  del 2026-08-03 ya tuvo que retirar dos tags flotantes reintroducidos por
  descuido; el informe de limpieza había retirado otros dos antes.
- **No introducir `:latest`** en ninguna referencia nueva.
- **No romper la ejecución no privilegiada** ya aplicada: API (`nestjs`), worker
  (`worker`) y migrator (`node`) corren como uid 1001/1000. Si el cambio de base
  altera los usuarios disponibles, resolverlo sin volver a root.
- **No borrar volúmenes ni datos.** El rebuild no requiere tocar
  `iwana_*_data_*`.
- **No modificar** `nginx.prod.conf`, `.env.production.example` ni ningún
  placeholder `REPLACE_ME_*` / `approval-required`: ADR-070 los conserva intactos.
- **No exponer secretos** en `ARG`, `ENV` ni argumentos de proceso.

## 5. Entregables técnicos obligatorios

- Cinco Dockerfiles migrados y parametrizados
- `pnpm-workspace.yaml` como fuente única de versión
- Dos workflows de CI actualizados, con build de api, web y portal
- Test de no regresión de versiones (E7)
- Tabla de medición: tiempo de build y tamaño de imagen, **antes y después**,
  por imagen

## 6. Entregables documentales obligatorios

- **Informe de fase:** `docs/informes/INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md`
  con evidencia de los criterios de aceptación, la tabla de medición y la deuda
  que quede abierta.
- **Actualizar** [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md)
  §7 y §8: marcar A7, C1, C2, C3 y las propuestas 6, 8, 9, 10 con su estado
  real. **No crear un informe de auditoría nuevo.**
- **Actualizar** `docs/prds/Stack_Tecnologico.md` si declara versión de Node.
- **Actualizar** `CLAUDE.md` y `AGENTS.md` si mencionan la versión.
- **Marcar ADR-071 como implementado** en su §Criterio de verificación.

## 7. Criterios de aceptación

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| CA-01 | Ninguna referencia `node:25` sobrevive | Búsqueda en todo el repositorio, resultado vacío |
| CA-02 | La versión de patch está declarada **una sola vez** | Inspección + test E7 |
| CA-03 | CI valida y construye sobre la misma versión | Workflows sin pin flotante; log de CI mostrando la versión |
| CA-04 | Las cinco imágenes construyen | `docker build` de las cinco, correcto |
| CA-05 | **API y worker arrancan realmente en contenedor** | Contenedor en `healthy`; `GET /api/v1/health` → 200. Un build correcto **no** satisface este criterio. **Verificar con el método de la §10** |
| CA-06 | Las dependencias nativas del árbol de runtime cargan | El worker inicializa BullMQ y registra sus jobs repetibles sin error de binario nativo. La dependencia nativa real es `msgpackr-extract`, que vive bajo `.pnpm` y la resuelve su consumidor (BullMQ): un `require('msgpackr-extract')` suelto desde `/app` falla por el aislamiento estricto de pnpm y **no** es un defecto. **`sharp` no aplica**: no está declarada en ningún `package.json` ni se importa en el código; solo figura en `onlyBuiltDependencies`, que declara qué puede compilar pnpm, no qué necesita el worker |
| CA-07 | `pnpm lint` y `pnpm typecheck` correctos | Salida de ambos |
| CA-08 | Suite completa en verde **con `Cached: 0`** | `turbo run test --concurrency=1 --force`. Un `pnpm test` verde con caché no es evidencia |
| CA-09 | `pnpm test:tooling` correcto, incluido E7 | Salida del runner |
| CA-10 | Los tres Compose siguen validando | `config --quiet` en dev, prod y e2e |
| CA-11 | `pnpm dev` arranca completo | API, web, portal y worker disponibles; bucket presente |
| CA-12 | Tiempo de build y tamaño de imagen **medidos y reportados** | Tabla en el informe de fase |
| CA-13 | Los tres runtimes siguen sin privilegios | `id -u` ≠ 0 en API, worker y migrator |
| CA-14 | Auditorías documentales en `BLOQUEANTE: 0` | `pnpm audit:doc-locations` y `pnpm audit:adr-citations` |
| CA-15 | El entorno queda **sin artefactos residuales** | Imágenes y caché de verificación retirados; comparar con el baseline de la auditoría (8 imágenes, 2,215 GB) |

CA-15 no es cosmético: la propia auditoría del 2026-08-03 dejó 3 imágenes y
1,681 GB de caché que hubo que retirar después.

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**

- ADR-071 no está `Aprobado` al iniciar.
- Alguna dependencia exige Node ≥ 25 — invalidaría la premisa de riesgo bajo de
  ADR-071 §Riesgo.
- `sharp` o `msgpackr-extract` no compilan o no cargan en Node 24.
- La suite falla por diferencia de runtime y no por un defecto propio del cambio.
- Eliminar el doble `pnpm install` rompe los enlaces de workspace y no hay forma
  de conservarlos sin él.

**Documentar causa en:** `docs/informes/INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md`

**Escalar a:** AI-EM-ARCH mediante `[BLOQUEO]`. Si el bloqueo invalida la
decisión del ADR, AI-EM-ARCH emite `[ESCALACIÓN AL CTO]` con opciones.

**Recomendación esperada ante bloqueo:** aislar el subalcance afectado y
entregar el resto. E1-E2 tienen valor por sí solos —cierran el riesgo de
seguridad— aunque E3-E6 se difieran. **No** revertir toda la fase por un fallo
en la optimización de build.

## 9. Criterio de salida de la fase

- Las cinco imágenes en Node 24 LTS con fuente única de versión: **sí**
- API y worker verificados **arrancando en contenedor**, no solo construyendo: **sí**
- CI validando y construyendo sobre la misma versión, con api/web/portal incluidos: **sí**
- Tests en verde con `Cached: 0`: **sí**
- Medición de build y tamaño reportada: **sí**
- Informe de fase archivado y auditoría actualizada: **sí**
- Entorno Docker devuelto al baseline: **sí**

---

## 10. Verificación de runtime — método obligatorio y estado actual

*(Sección añadida en v1.1 tras la resolución del `[BLOQUEO]` de la ejecución v1.0.
Ver [INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md](../informes/INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md)
§Resolución del bloqueo.)*

### 10.1 Cómo se verifica CA-05, y cómo no

**Un `docker run` desnudo no sirve.** Las imágenes llevan `NODE_ENV=production`
fijado y `apps/api/src/app.config.ts` valida el entorno con Joi en modo
fail-fast: sin variables, el proceso aborta con código 1 **antes** de abrir el
puerto. Eso es correcto, y no dice nada sobre el empaquetado.

El arranque debe reproducir la forma del Compose de producción:

1. **Red:** la del stack de desarrollo (`appiw_default`), para que `postgres`,
   `redis`, `minio` y `typesense` resuelvan por nombre de servicio.
2. **Entorno:** el conjunto exacto que declara `docker-compose.prod.yml` para
   `api-prod` y `worker-prod`, con `DB_HOST=postgres`, `REDIS_HOST=redis`,
   `S3_ENDPOINT=http://minio:9000` y `TYPESENSE_HOST=typesense`.
3. **JWT:** `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` deben ser un par RSA **real**; los
   placeholders `CHANGE_ME_*` pasan Joi pero rompen después. Generarlo en
   memoria, como ya hace `scripts/e2e-provision-operational.mjs`. **Nunca
   escribir claves en el repositorio.**
4. **Logs:** lanzar con `-d` y leer `docker logs`, o capturar stderr. **Nunca
   interrumpir sin conservar la salida** — es lo que convirtió un fallo de método
   en un bloqueo de fase.

Los artefactos de esta verificación (imágenes y contenedores) se retiran al
terminar, conforme a CA-15.

### 10.2 Criterios ya satisfechos — no repetir el trabajo

Verificados por AI-EM-ARCH el 2026-08-03 con el método de la §10.1:

| Criterio | Evidencia |
| --- | --- |
| CA-04 | Las imágenes de API y worker construyen desde los Dockerfiles convergidos |
| CA-05 · API | `healthy` en menos de 10 s; `GET /api/v1/health` → **HTTP 200**; cuerpo `{"status":"ok","db":"ok","redis":"ok"}` |
| CA-05 · worker | `running`; TypeORM conectado; seis módulos BullMQ inicializados; jobs repetibles registrados; `Nest application successfully started` |
| CA-06 | `msgpackr-extract@3.0.3` presente y cargado por BullMQ |
| CA-13 | API `uid=1001(nestjs)`; worker `uid=1001(worker)` |
| E5 | Runner sin pnpm global ni TypeScript, confirmado dentro del contenedor |

### 10.3 Estado actualizado de la fase

Los gates locales CA-07, CA-08, CA-10, CA-11, CA-14 y CA-15 quedaron
ejecutados el 2026-08-03. CA-12 tiene mediciones actuales reproducibles, pero
la evidencia histórica solo conserva el agregado de 8 imágenes/2,215 GB y no
los tiempos/tamaños individuales anteriores; no se inventa una comparación.

| Criterio | Estado |
| --- | --- |
| CA-07, CA-08 | Verificados localmente; lint, typecheck y suite `Cached: 0` en verde |
| CA-10, CA-11 | Verificados localmente; Compose válido y `pnpm dev` operativo |
| CA-12 | Medición actual registrada; comparación antes/después no disponible por falta de baseline individual |
| CA-14, CA-15 | Verificados; auditorías sin bloqueantes y baseline Docker restaurado. CA-15 retiró doce referencias en total (siete previas más cinco creadas para CA-12) |
| CA-03 / G6.5 | Pendiente de una corrida GitHub Actions asociada a un SHA identificable |
| Documental | ADR-071, Stack Tecnológico e informes actualizados; cierre formal depende de G6.5 y decisión CA-12 |

La comprobación de G6.5 de esta ejecución no pudo obtener un run remoto: el
conector GitHub devolvió 404 para `SleyiW/iWana-neXt`, no existe la rama de
trabajo en `origin` y `gh` no está instalado. La fase queda técnicamente
verificada en local, pero no se declara cierre completo sin esa evidencia.
