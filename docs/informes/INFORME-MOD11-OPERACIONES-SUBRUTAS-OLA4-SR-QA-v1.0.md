# INFORME — MOD11 Operaciones · OLA 4 · SR-QA (F6) — Verificación y cierre de H7

**Versión:** 1.0 (revisión post-fix OLA 4.1 incluida — §14)
**Fecha:** 2026-09-13
**Emisor:** AI-SR-QA (`sr-qa`) — único agente de la ola que escribe código (tests)
**Encargo:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA4-SR-QA-v1.0.md` v1.0 · fase **F6** del encargo formal `PROMPT-MOD11-OPERACIONES-SUBRUTAS-F5-F6-v1.0.md` v1.0
**Cierra:** parte de **G6** y el handoff **H7** (F6 → AI-EM-ARCH)
**Plan:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 (§3.4 ola 4, §4, §6, §8, §8.1)
**Spec (matriz):** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 §6 (CA-01…CA-11)
**Contratos congelados consumidos (no modificados):** `execution-orders-list.ts` v1 · `operational-tasks.ts` v1 · contrato de componente de tablas operativas v1.0
**Regla de evidencia:** conteos reales, plataforma y duración; corridas turbo con `Cached: 0` / `--force` (§8.1 del plan; §4 del protocolo v1.5).
**Evidencia de calidad anexa:** `docs/quality/2026-09-13-mod11-operaciones-ola4-matriz-ca-test.md` (matriz + conteos + veredicto D-2).
**Estado post-fix (OLA 4.1, 2026-09-13):** DEF-F6-01 **cerrado** · D-2 **cerrado** (bloque 9 9a–9g verdes, 37/37, exit 0) · CA-01 y CA-03 con capa **E2E-API cerrada** · matriz 11/11 · ver §14.

---

## 1. Estado de entrada (DoR verificado antes de escribir)

| Condición | Estado |
| --- | --- |
| G5 completo y H6 aceptado (OLA3 consolidación §3–§4) | ✅ verificado en el informe de consolidación |
| Contratos localizables y congelados | ✅ `execution-orders-list.ts`, `operational-tasks.ts`, contrato de componente |
| Spec §6 con CA-01…CA-11 | ✅ once criterios leídos como matriz |
| F5 cerrada (integración) | ✅ H6 aceptado |
| Entrada incompleta | No se detectó; **no se emitió `[BLOQUEO]` de arranque** |

---

## 2. Skills leídas (declaración §5.1 del plan)

**Obligatorias:**

- `testing-patterns` — pirámide del repo, factories, anti-test-teatral.
- `e2e-testing-patterns` — selectores semánticos, determinismo, aislación.
- `playwright-skill` — convenciones Windows/VS Code, esperas por estado observable.
- `verification-before-completion` — la ley de hierro: sin evidencia fresca no hay afirmación de verde (aplicada a cada conteo de este informe).

**De apoyo (leídas):**

- `wcag-audit-patterns` — auditoría axe + manual sobre las dos tablas y el pager.
- `test-driven-development` — red-green donde el caso nuevo lo permitía (CA-06 tareas: rojo → causa raíz → verde).
- `systematic-debugging` — aplicada al defecto DEF-F6-01 (causa raíz antes de proponer fix; sin parche de síntoma).

**No usadas (según orden §5):** `brainstorming`, `architecture-decision-records`, `bullmq-specialist`, `turborepo-caching`.

---

## 3. Entregables de F6

### 3.1 Archivos de test creados (7 + 1 E2E)

| Archivo | Casos | Cubre |
| --- | --- | --- |
| `apps/portal/src/components/operations/tasks-query.spec.ts` | 10 | CA-04/CA-09 (serialización URL ⇄ params) |
| `apps/portal/src/components/operations/execution-orders-query.spec.ts` | 8 | CA-04 (estado de bandeja en URL) |
| `apps/portal/src/components/operations/ExecutionOrdersTable.spec.tsx` | 13 | CA-01/CA-05/CA-10 |
| `apps/portal/src/components/operations/TasksTable.spec.tsx` | 14 | CA-05/CA-09/CA-10 |
| `apps/portal/src/components/operations/ExecutionOrdersToolbar.spec.tsx` | 10 | CA-01/CA-04 |
| `apps/portal/src/components/operations/TasksToolbar.spec.tsx` | 9 | CA-04/CA-09 |
| `apps/portal/src/components/operations/OperationsUserPicker.spec.tsx` | 5 | CA-08 + D-P1 (403 visible) |
| `e2e/tests/portal-operations-bandeja-ot.spec.ts` | 9 | CA-01…CA-07 (navegador, HTTP mockeado) |

### 3.2 Archivos de test modificados (solo tests; cero código de producción)

| Archivo | Cambio |
| --- | --- |
| `ExecutionOrdersClient.spec.tsx` | +3 casos ADR-065 §15 con dos alcances (CA-03) |
| `tasks.boundary.spec.ts` | +1 caso CONTRACTOR (SEC-D1) |
| `execution-orders.service-list.spec.ts` | +1 caso CONTRACTOR (SEC-D1) |
| `portal-pager-a11y.spec.ts` | +2 auditorías axe de las bandejas nuevas + mocks de permisos/catálogos |
| `portal-field-flow-ticket-ot-inventory.spec.ts` | +1 caso por URL canónica, mocks de permisos/sedes/listado, 1 corrección de API de Playwright (`getByLabelText`→`getByLabel`) y 1 aserción de emisor legado→canónico (paso 14 de F5-F6). **Las líneas 876/975 originales no se tocaron** (§9) |

### 3.3 Reglas duras respetadas

- No se rehicieron los 11 casos de montaje re-apuntados por F2 (D-A2): corren intactos.
- No se modificó código de producción para que un test pase; el defecto encontrado se reporta con dueño (§6).
- QA-49 (no persistencia en storage) y el descarte de respuesta tardía se conservan íntegros.
- Sin PII real en fixtures: tokens sintéticos, emails `*.invalid`, datos ficticios.

---

## 4. Matriz criterio ↔ test CA-01…CA-11 (entregable central de H7)

> Leyenda: **U** = unit/componente (jest+jsdom) · **E2E-N** = navegador (Playwright, HTTP mockeado) · **E2E-API** = API real + PostgreSQL (provisioner R4.1).

| CA | Criterio (spec §6) | Test(s) nombrados | Estado |
| --- | --- | --- | --- |
| **CA-01** | Desde `/dashboard/operations/execution-orders` un despachador lista, filtra y abre OT sin pasar por Programación | **E2E-N** `CA-01: la bandeja canónica lista, filtra y abre la OT sin pasar por Programación`; **U** `ExecutionOrdersTable › pinta las 8 columnas…`, `ExecutionOrdersToolbar › emite el patch de estado…`, `execution-orders-query › round-trip`; **E2E-API** `9a–9e` (listado, meta ADR-065, orden, filtros, 400s) | ✅ E2E-N/U + **E2E-API cerrada post-fix 4.1** (9a–9e verdes) |
| **CA-02** | `GET /dashboard/operations?executionOrderId=X` sigue abriendo la OT X sin parpadeo (redirect en servidor) | **E2E-N** `CA-02: el deep link legado abre la OT y termina en la URL canónica`; **E2E-N** field-flow `escenario operaciones — cierre OT…` y `operaciones pre-inicio…` (entran por la URL legada, líneas originales 876/975 intactas); **E2E-N** field-flow `operaciones — la URL canónica abre la OT…` | ✅ (4 casos verdes) |
| **CA-03** | Un `TECHNICIAN` solo ve lo asignado a él o su cuadrilla; BOLA; ADR-065 §15: el total no revela el total del tenant | **U** `tasks.boundary.spec.ts › un TECHNICIAN no ve OT asignadas a otro técnico (BOLA)`, `dos técnicos ven conjuntos distintos…`, `ADMIN ve el tenant… total del tenant (ADR-065 §15)`, `un CONTRACTOR queda dentro del scoping restringido (SEC-D1)`; **U** `execution-orders.service-list.spec.ts › aplica scoping por actor…`, `incluye CONTRACTOR… (SEC-D1)`; **U-UI** `ExecutionOrdersClient › ADR-065 §15 — alcance del conteo` (técnico total 1 / admin total 21 / sin recomputo local); **E2E-API** `9f` (técnico vs pool/NOC con `total` scoped) y `9g` (segundo técnico no ve la OT del primero) | ✅ U+UI con dos alcances + **E2E-API cerrada post-fix 4.1** (9f/9g verdes) |
| **CA-04** | Página, tamaño, filtros y orden en la URL; el botón Atrás vuelve al estado anterior | **E2E-N** `CA-04: página en URL — Siguiente empuja y Atrás vuelve…`; **E2E-N** `CA-04: cambiar filtro reinicia a página 1 y lo refleja con replace`; **U** `TasksInboxClient › ADR-065: navega a la página 2 y la URL conserva page=2`, `› al cambiar filtro de estado reinicia en página 1…`; **U** `tasks-query`/`execution-orders-query` (serialización) | ✅ |
| **CA-05** | Cada tabla monta un solo pie, elegido por `meta.capabilities.randomAccess` | **U** `ExecutionOrdersTable › con randomAccess true monta SOLO el pager…`, `› con randomAccess false monta SOLO «Cargar más»`, `› el pie pierde el navegador cuando totalPages <= 1`, `› sin resultados no monta pie`; **U** `TasksTable` (ídem); **E2E-N** `CA-05: cada tabla monta un solo pie…`, `CA-05: con randomAccess false la tabla degrada a «Cargar más»…`; **E2E-N a11y** `v2-34: axe-core… bandeja de tareas/órdenes` (nav único + axe 0 violaciones) | ✅ |
| **CA-06** | Cerrar cualquiera de los dos drawers conserva filtros, página y orden | **E2E-N** `CA-06: cerrar el drawer conserva filtros, página y orden` (OT); **E2E-N** `CA-06: cerrar el drawer de tareas conserva filtros, página y orden` (tareas, cierre con Escape); **U** `TasksInboxClient › deep link ?taskId=` (apertura por URL) | ✅ |
| **CA-07** | Entrar a `/tasks/new` no monta el árbol de la OT | **E2E-N** `CA-07: entrar a crear tarea no monta el árbol de la OT` (assert 0 peticiones al listado de OT); **U** `TaskIntakeClient.spec.tsx` (F2, intacto) | ✅ |
| **CA-08** | Ningún montaje de Operaciones recorre el directorio completo de usuarios | **U** `OperationsUserPicker › busca con el typeahead canónico (q + límite ≤20)…`, `› D-P1: un 403 muestra el aviso visible…`, `› muestra la etiqueta del valor actual (S0) sin lanzar búsqueda`; montajes sin `usersApi.list` en los mocks (una llamada al crawl rompería el render) | ✅ |
| **CA-09** | La bandeja de tareas muestra el vencimiento y permite filtrar por tipo, responsable y ticket | **U** `TasksTable › pinta las 7 columnas… con «Vence»`, `columna «Vence»` (vencida/hoy/mañana/futura/terminal/sin fecha); **U** `TasksToolbar › emite el patch de estado y de tipo…`, `el filtro de ticket es exacto…`, `el responsable usa el typeahead…` | ✅ |
| **CA-10** | `sortableFields` vacío y OpenAPI sin `sortBy`/`sortDir` | **U** `ExecutionOrdersTable › sin aria-sort ni encabezado ordenable…`, `TasksTable › sin aria-sort…`; **API** `tasks.swagger.spec.ts` (F1, en la suite API) | ✅ |
| **CA-11** | `audit-ui.mjs` limpio sobre los archivos tocados | Gate re-ejecutado: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations` → **«sin hallazgos en las rutas analizadas», exit 0** | ✅ |

**Cobertura de matriz:** 11/11 CA con al menos un test nombrado. Post-fix OLA 4.1, los dos CA cuya verificación plena dependía del API (CA-01, CA-03) tienen su capa **E2E-API cerrada**: bloque 9 completo (9a–9g) verde en el entorno canónico (§14).

---

## 5. Evidencia de ejecución — conteos reales

**Plataforma:** Windows 11 (win32) · PowerShell 7 · Node/pnpm del baseline del workspace · jest local (sin turbo) para suites de test · Playwright 1.58 (chromium, 1 worker, sin sharding).
**Árbol:** `main` con cambios F0–F5 + F6 sin commitear (rama única, sin commits en esta sesión).

| Suite | Comando | Resultado real | Duración | Nota de caché |
| --- | --- | --- | --- | --- |
| Lint | `pnpm lint --force` | **8/8 successful** · 0 errores (45 warnings preexistentes) | 15.973 s | **`Cached: 0 cached, 8 total`** |
| Typecheck | `pnpm typecheck --force` | **8/8 successful** · 0 errores | 11.306 s | **`Cached: 0 cached, 8 total`** |
| API (jest) | `pnpm --filter @iwana/api test` | **313 suites passed + 4 skipped** (313/317) · **3927 passed + 15 skipped** (3942) · exit 0 | 29.08 s | jest ejecuta siempre; sin turbo |
| Portal (jest) | `pnpm --filter @iwana/portal test` | **264/264 suites passed** · **2413 passed + 1 skipped** (2414) · exit 0 | 42.024 s | jest ejecuta siempre; sin turbo |
| E2E portal (completa) | `pnpm test:e2e:portal` | **152 passed / 98 failed / 0 skipped / 0 flaky** (250 casos) · exit 1 | 37.3 min | fallos **preexistentes** (§10); ver nota de estado |
| E2E portal (spec F6) | `pnpm test:e2e:portal portal-operations-bandeja-ot.spec.ts` | **9/9 passed** | 20.9 s | corrida dirigida del spec nuevo (estado final) |
| E2E portal (pager a11y) | `pnpm test:e2e:portal portal-pager-a11y.spec.ts` | **9/9 passed** | 25.7 s | incluye las 2 bandejas nuevas |
| E2E portal (flujo de campo) | `pnpm test:e2e:portal portal-field-flow-ticket-ot-inventory.spec.ts` | **4/4 passed** | 14.9 s | legado 876/975 + caso canónico nuevo |
| Gate de identidad | `node .agents/skills/…/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations` | **sin hallazgos**, exit 0 | — | CA-11 |

**Nota de estado de la corrida completa:** la corrida completa registrada (152/98) se ejecutó con todos los tests de F6 **salvo el último caso CA-06 de tareas** (añadido después, verificado en la corrida dirigida 9/9). No se repitió la suite completa una tercera vez: los 98 fallos no dependen del árbol de F6 (§10) y el delta es exactamente +1 caso verde ya acreditado.

**Comparación con líneas base de olas previas:**

- Portal jest: OLA3 → 257 suites / 2341 passed + 1 skipped; **F6 → 264 suites (+7) / 2413 passed (+72) + 1 skipped**.
- API jest: OLA2 → 313 suites / 3925 passed; **F6 → 313 suites / 3927 passed (+2 CONTRACTOR de SEC-D1)**.

---

## 6. D-2 — veredicto: **corrida canónica conseguida; defecto crítico de producto detectado**

### 6.1 Cómo se consiguió la corrida

1. **Entorno canónico:** `node scripts/e2e-provision-operational.mjs` (proyecto compose aislado `iwana-e2e-r41`, puertos propios 15433/16380/19002/18108, PostgreSQL/Redis/MinIO/Typesense/worker reales, migraciones, fixtures y cleanup).
2. **Dos intentos abortados por entorno** (no por la suite): el puerto 3000 estaba ocupado por la API dev de una sesión previa; el watcher de `pnpm dev` la relanzaba al compilar los paquetes. Se detuvo el árbol del supervisor dev (`taskkill /T` sobre el `pnpm dev` raíz) y el tercer intento completó: `E2E_SETUP=OK`, `E2E_API_HEALTH=OK`, `E2E_CLEANUP=OK`.
3. **Resultado real del bloque 9 y la suite completa** (marcadores del provisioner, sin caché):

```text
E2E_SETUP=OK|tenants=e2e-r1-r41-<run>,e2e-tenant-b-<run>
E2E_PLAYWRIGHT_PASSED=30
E2E_PLAYWRIGHT_FAILED=1
E2E_PLAYWRIGHT_SKIPPED=6
E2E_PLAYWRIGHT_DID_NOT_RUN=0
E2E_PLAYWRIGHT_FLAKY=0
E2E_PLAYWRIGHT_EXIT=1
E2E_PLAYWRIGHT_DURATION_MS=133788
E2E_TOTAL_DURATION_MS=195148
E2E_CLEANUP=OK
```

Bloques 1–8: **30/30 verdes** (happy path completo, inmutabilidad, concurrencia, rate limiting, permisos, BOLA multi-tenant, evidencia, gate de material). Bloque 9: **9a falló con HTTP 400** y, por el modo serial, 9b–9g no corrieron.

### 6.2 DEF-F6-01 — `GET /tasks/execution-orders` responde 400 en el API real (colisión de rutas) · **CRÍTICO**

**Síntoma medido:** `GET /api/v1/tasks/execution-orders?page=1&limit=5` con token NOC válido → **400** (el test 9a esperaba 200).

**Causa raíz (systematic-debugging, evidencia en el log de arranque del API del provisioner):**

```text
Mapped {/api/v1/tasks/:id, GET} route                 ← TasksController (registrada primero)
Mapped {/api/v1/tasks/execution-orders, GET} route    ← ExecutionOrdersController (después)
```

- `tasks.module.ts:75` declara `controllers: [TasksController, ExecutionOrdersController, ExecutionOrderTemplatesController]`.
- Express resuelve **en orden de registro**: `tasks/:id` captura `tasks/execution-orders` con `id='execution-orders'` y el `ParseUUIDPipe` de `tasks.controller.ts:102` responde 400.
- El orden interno del `ExecutionOrdersController` es correcto (`@Get()` antes de `:id`): la colisión es **entre controladores** del mismo módulo.

**Por qué no lo detectó nadie antes:** el spec HTTP unitario monta **solo** `ExecutionOrdersController` (`execution-orders.controller.http.spec.ts:326, 726, 986, 1277, 1348, 1418, 1586`), de modo que la colisión no existe en ese banco; y el bloque 9 del E2E API nunca había corrido (D-2).

**Impacto:** la bandeja de OT devuelve 400 en el API real para todos los llamadores; CA-01 y la parte E2E de CA-03/CA-04/CA-10 quedan no verificables contra el stack real; el cableado de F5 al endpoint real no funciona en dev/prod.

**Fix (código de producción, dueño AI-SR-FULL):** reordenar `controllers` en `tasks.module.ts` para registrar `ExecutionOrdersController` **antes** de `TasksController` (o montar el listado en un router propio). **No se aplicó desde QA** (prohibido modificar producción para que un test pase). Regresión recomendada al fix: boot de ambos controladores en un mismo testing module con supertest, o aserción de orden en el módulo.

**Marcador emitido:** `[BLOQUEO]` a AI-EM-ARCH + `[CONSULTA]` (bloqueante) a AI-SR-FULL (§11).

### 6.3 Hallazgo de entorno — credenciales `E2E_PLATFORM_*` desalineadas (explica el 401 heredado)

- `.env.development.local` define `E2E_PLATFORM_EMAIL/PASSWORD` que **no corresponden a ninguna fila de `public.platform_users`**: el HMAC del email no coincide con `email_hmac` y el login manual contra la API dev responde **401 con motivo `USUARIO_NO_ENCONTRADO`** en `public.platform_audit_logs`.
- Las credenciales `PLATFORM_SUPER_ADMIN_*` del mismo entorno **sí** autentican (200 + token).
- El provisioner prefiere `PLATFORM_SUPER_ADMIN_*` (`e2e-provision-operational.mjs:356-370`), por eso la corrida canónica no sufre este problema. El 401 que arrastraba D-2 desde OLA2 era esta desalineación de configuración, no un defecto de la suite.
- **Dueño:** AI-PLAT-OPS (higiene de `.env.development.local`; alinear o retirar las `E2E_PLATFORM_*` obsoletas). Marcador `[CONSULTA]` asíncrona (§11).

### 6.4 Prerrequisito cumplido

`npx tsx e2e/scripts/provision-execution-template.ts` quedó cubierto por el provisioner (provisiona `E2E_HAPPY_PATH` vía API/DB en su setup; `E2E_TEMPLATE=OK`). No se requirió ejecución manual separada.

---

## 7. SEC-D1 — cerrada

El dictamen SEC-ENG OLA2 §4.3 pedía cobertura unitaria del rol **CONTRACTOR** en el scoping (una regresión que lo retirara de `LIST_RESTRICTED_ROLES` no se detectaba). Añadido:

| Suite | Caso nuevo | Qué fija |
| --- | --- | --- |
| `tasks.boundary.spec.ts` | `un CONTRACTOR queda dentro del scoping restringido (SEC-D1): no ve la OT de un técnico` | Predicado `order.assigned_technician_id = :actorSub` presente y parametrizado con `contractor-001`; conjunto exacto (propia + pool ≠ CREATED, nunca la de un técnico); `meta.total` scoped; consistencia bandeja↔detalle |
| `execution-orders.service-list.spec.ts` | `incluye CONTRACTOR en el scoping restringido (SEC-D1)` | Predicado + parámetros (`actorSub`, `poolExcludedStatus`) sobre el servicio real |

Verificación: ambas suites pasan (18/18 en la corrida dirigida; +2 en el total API). Retirar `CONTRACTOR` del array **ahora rompe Jest**.

---

## 8. CA-03 / ADR-065 §15 — verificación con dos alcances

**Texto normativo verificado** (`ADR-065 §15`, línea 238): «El `total` refleja el alcance del operador. QA verifica con **dos usuarios de alcance distinto** que el pie no revela el total global del tenant».

Verificación en tres capas:

1. **Servidor (Jest, `tasks.boundary.spec.ts`):** ADMIN ve 3 con un único `getManyAndCount` sobre el QB ya scopeado; TECHNICIAN ve 1; el total del técnico es estrictamente menor. CONTRACTOR incluido (SEC-D1).
2. **UI (Jest, `ExecutionOrdersClient.spec.tsx` — 3 casos nuevos):** mismo cliente con dos alcances — técnico muestra «1–1 de 1 orden de ejecución» y ninguna vía del pie expone el total del tenant (21); admin muestra «Mostrando 1–20 de 21…»; y con `meta.total=3` y una sola fila pintada el pie dice «3 órdenes de ejecución» → **el total sale de `meta`, nunca del largo de `data`**.
3. **API real (E2E 9f/9g):** existen y están bien construidos (dos técnicos + comparación NOC/técnico), **no ejecutados** por DEF-F6-01. Cierre de esta capa al fix del defecto.

---

## 9. Regla dura — líneas 876/975 del e2e de flujo de campo

- Contenido en `HEAD` de ambas líneas (idéntico): `await gotoAuthedDashboard(page, \`/dashboard/operations?executionOrderId=${EXECUTION_ORDER_ID}\`);`
- `git diff` del archivo: **103 inserciones, 2 eliminaciones**. Las eliminaciones son: (1) `getByLabelText` → `getByLabel` (API inexistente en Playwright, TypeError latente), y (2) la aserción del emisor de agenda legado → canónico, exigida por el paso 14 de F5-F6. **Ninguna eliminación toca las líneas 876/975**: ambas aparecen como contexto sin modificar.
- La ampliación de mocks (permisos, sedes, listado de OT) desplazó sus números de línea; el **contenido de los casos legados no cambió** y ambos corren verdes (2 casos en la corrida 4/4 del spec).
- Caso canónico **añadido**, no sustituto: `operaciones — la URL canónica abre la OT por deep link sin rebotar al legado` (verde).

---

## 10. Hallazgos y deuda residual por severidad

| # | Severidad | Hallazgo / deuda | Evidencia | Dueño |
| --- | --- | --- | --- | --- |
| DEF-F6-01 | ~~Crítica~~ **Cerrado** | `GET /tasks/execution-orders` → 400 por colisión `tasks/:id` ↔ `tasks/execution-orders`. **Corregido en OLA 4.1** (reordenación de `controllers` + `tasks-routing.spec.ts`) y verificado por QA: bloque 9 completo 9a–9g verde | §6.2 y §14 | AI-SR-FULL (fix) · **verificado AI-SR-QA** |
| D-2 residual | ~~Media~~ **Cerrado** | 9b–9g ejecutados post-fix en el entorno canónico: 37/37 passed, exit 0, cleanup OK. Incluye el fixture del segundo técnico (`E2E_TECH2_*`) que el provisioner no creaba | §14.2 | AI-SR-QA · AI-PLAT-OPS (ratificar extensión del provisioner) |
| E2E-PORTAL-DEBT | Media | 98 fallos preexistentes de la suite E2E portal completa: specs que no mockean `/access-control/me/effective-permissions` (migración del endpoint del 2026-08-29, `d5db6239`) y caen en «No pudimos verificar tu acceso»/«No tienes acceso». No afectan a los specs de F6 (verdes). No re-verificada en esta revisión (solo specs de alcance) | §5 | AI-EM-ARCH asigna (programa) · AI-PLAT-OPS si se instrumenta en CI |
| ENV-E2E-CREDS | Media | `E2E_PLATFORM_*` de `.env.development.local` desalineadas con la cuenta de plataforma sembrada (401 `USUARIO_NO_ENCONTRADO`). El provisioner prefiere `PLATFORM_SUPER_ADMIN_*` y no se ve afectado | §6.3 | AI-PLAT-OPS |
| D-6 | Baja | Relevada: `page`/`limit` inválidos **permanecen en la URL** (los helpers `*-query.ts` los ignoran y no normalizan; `useTableQueryState` sí). Confirmado por código (`execution-orders-query.ts:39-43`, `tasks-query.ts:39-43`); no hay `replace` de saneo al montar | orden §3(h) | AI-FE-PLATFORM |
| D-3 | Baja | Selector «Sede» degrada sin aviso si falla `organizationApi.list` (queda operable; cubierto el no-crash) | test toolbar «si el catálogo de sedes falla…» | AI-FE-PLATFORM |
| SEC-O2 | Observación | Fallback a email en `responsibleLabel` — SEC-D4 (batch lookup) corregido por SR-FULL; la degradación a `null` sigue recomendada si Producto no necesita el email | dictamen SEC-ENG OLA2 · OLA 4.1 | AI-SR-FULL |
| Deuda ajena | — | D-1/D-4/D-5 (cuadrillas, «—» vs «Sin fecha», botón «Actualizar») revisadas por PROD-UX/DS-OWNER; los 7 bloqueantes de PROD-UX y el P1-1 de DS quedaron corregidos por FE-PLATFORM en OLA 4.1 (informe propio) | informes OLA4/4.1 en el árbol | AI-PROD-UX / AI-DS-OWNER / AI-FE-PLATFORM |

**Reescrituras de contrato en F6: cero.** Contratos congelados y `execution-orders.ts` intactos. **Sin PII real** en fixtures, logs ni este informe (sección 6.3 usa booleanos y motivos de auditoría, nunca credenciales ni emails).

---

## 11. Marcadores emitidos (§6.3 — exactos)

```text
[BLOQUEO] De: AI-SR-QA | Fase/módulo: MOD11 Operaciones · F6 (OLA4)
Qué intenté: verificación E2E de CA-01/CA-03 contra el API real con el provisioner canónico R4.1
Qué falta para desbloquear: que AI-SR-FULL corrija DEF-F6-01 (colisión de rutas
`tasks/:id` ↔ `tasks/execution-orders`; reordenar `controllers` en tasks.module.ts o router propio)
y se re-ejecute el bloque 9 del E2E API (9b–9g) con conteo real.
Impacto si no se resuelve: la bandeja de OT responde 400 en el stack real; G6 no puede
aceptarse para CA-01/CA-03 y el E2E API de D-2 queda incompleto.
```

```text
[CONSULTA] De: AI-SR-QA → A: AI-SR-FULL
Contexto: MOD11 F6 · bloque 9 E2E API · evidencia: log de arranque del API del provisioner +
400 medido en 9a + ParseUUIDPipe de tasks.controller.ts:102 + orden de controllers en tasks.module.ts:75
Pregunta concreta: ¿confirmas el fix por reordenación de `controllers` (ExecutionOrdersController
antes de TasksController) y asumes la re-ejecución del bloque 9 tras aplicarlo?
Bloqueante: Sí | Supuesto mientras tanto: el defecto es de enrutado, no de scoping ni de proyección
(los tests de servicio/boundary están verdes).
```

```text
[CONSULTA] De: AI-SR-QA → A: AI-PLAT-OPS
Contexto: MOD11 F6 · entorno canónico E2E · `.env.development.local` con E2E_PLATFORM_* obsoletas
Pregunta concreta: ¿alineas/retiras las E2E_PLATFORM_* que no corresponden a la cuenta de
plataforma sembrada (401 USUARIO_NO_ENCONTRADO) y valoras instrumentar el conteo de la suite
E2E portal en CI para que su deuda (98 fallos preexistentes) no pase desapercibida?
Bloqueante: No | Supuesto mientras tanto: el provisioner prefiere PLATFORM_SUPER_ADMIN_* y no se ve afectado.
```

Sin `[DESEMPATE]` (no hubo disputa entre agentes).

---

## 12. Instrumentación (§9 del plan)

- **Skills declaradas:** 4 obligatorias + 3 de apoyo leídas (§2). No usadas: las 4 vetadas por la orden.
- **Reescrituras de contrato:** 0.
- **Consultas emitidas:** 2 (SR-FULL bloqueante; PLAT-OPS asíncrona). **Bloqueos:** 1 (DEF-F6-01). **Desempates:** 0.
- **Latencia de gates:** F6 ejecutada en la misma sesión del despacho; el bloqueo por defecto crítico se emite antes del cierre.
- **Deuda por severidad al cierre:** 1 crítica, 3 medias, 3 bajas/observación (§10).
- **Post-fix OLA 4.1 (§14):** la crítica (DEF-F6-01) y la media D-2 quedan **cerradas**; la deuda vigente al cierre definitivo es: 2 medias (E2E-PORTAL-DEBT, ENV-E2E-CREDS) + 3 bajas/observación (D-6, D-3, SEC-O2) + la ratificación del provisioner solicitada a PLAT-OPS.

---

## 13. Anexo — comandos reproducibles

```bash
pnpm lint --force
pnpm typecheck --force
pnpm --filter @iwana/api test
pnpm --filter @iwana/portal test
pnpm test:e2e:portal
pnpm test:e2e:portal portal-operations-bandeja-ot.spec.ts
pnpm test:e2e:portal portal-pager-a11y.spec.ts
pnpm test:e2e:portal portal-field-flow-ticket-ot-inventory.spec.ts
node scripts/e2e-provision-operational.mjs          # D-2 (requiere puerto 3000 libre)
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations
```

**Juicio de cierre F6 (stop/go §10 de la orden):** CA-03 con dos alcances ✅ · 876/975 intactas ✅ · 11/11 CA con test asociado ✅ · conteo real ✅ · D-2 corrida + explicación precisa ✅ · SEC-D1 presente ✅. **Con un defecto crítico abierto (DEF-F6-01) que QA no puede dejar pasar como verde:** G6 para CA-01/CA-03 en el stack real queda **condicionado al fix de AI-SR-FULL**.
→ **Resuelto en la revisión post-fix (§14):** DEF-F6-01 cerrado y verificado; G6 de CA-01/CA-03 en el stack real **sin condición pendiente** por este informe.

---

## 14. Verificación post-fix (OLA 4.1) — cierre de DEF-F6-01 y D-2

**Fecha:** 2026-09-13 (misma jornada, sesión de reanudación de F6).
**Insumos:** informe de corrección `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-CORRECCION-FE-PLATFORM-v1.0.md`; fix de AI-SR-FULL en `apps/api/src/modules/tasks/tasks.module.ts` + regresión `apps/api/src/modules/tasks/tests/tasks-routing.spec.ts`; SEC-D4.
**Regla:** solo se ejecutaron verificaciones y (una) extensión de infraestructura de tests; cero cambios en código de producción.

### 14.1 DEF-F6-01 — cerrado y verificado

- **Fix aplicado (AI-SR-FULL):** `controllers: [ExecutionOrdersController, ExecutionOrderTemplatesController, TasksController]` en `tasks.module.ts` (el sombreado también afectaba `tasks/execution-order-templates`, ya cubierto).
- **Regresión nueva:** `tasks-routing.spec.ts` — 6 casos que leen el orden real declarado por el módulo y lo montan con supertest: `tasks/execution-orders` → 200 (listado), `tasks/execution-order-templates` → 200, `tasks/:id` → detalle, `health/relay` → 200 (deuda §13.1 verificada: no es sombreable), `events/:eventId/redrive` → 202.
- **Verificación QA:** `pnpm --filter @iwana/api test` → **314 suites passed + 4 skipped (314/318) · 3936 passed + 15 skipped (3951) · exit 0 · 26.784 s** (incluye la regresión nueva; +1 suite / +9 casos vs el corte previo de F6).

### 14.2 D-2 — cerrado: bloque 9 completo (9a–9g) en el entorno canónico

Corrida `node scripts/e2e-provision-operational.mjs` con el fix (puerto 3000 liberado; sin supervisor dev activo). Marcadores reales:

```text
E2E_SETUP=OK|tenants=e2e-r1-r41-mu0f19s9-876335,e2e-tenant-b-mu0f19s9-876335
E2E_PLAYWRIGHT_PASSED=37
E2E_PLAYWRIGHT_FAILED=0
E2E_PLAYWRIGHT_SKIPPED=0
E2E_PLAYWRIGHT_DID_NOT_RUN=0
E2E_PLAYWRIGHT_FLAKY=0
E2E_PLAYWRIGHT_EXIT=0
E2E_PLAYWRIGHT_DURATION_MS=131992
E2E_CLEANUP=OK
E2E_TOTAL_DURATION_MS=179024
```

Bloque 9 (7/7 verdes):

| Caso | Resultado |
| --- | --- |
| 9a. NOC lista con paginación y meta ADR-065 (proyección mínima) | ✅ 64 ms |
| 9b. Orden por defecto: ventana DESC con desempate por id | ✅ 55 ms |
| 9c. Filtros: asignado incluye la OT del técnico; ticket inexistente → 0 filas | ✅ 62 ms |
| 9d. `page*limit` sobre el tope → 400 | ✅ 47 ms |
| 9e. `limit > 100` → 400 y `cursor` rechazado | ✅ 57 ms |
| 9f. BOLA: técnico solo ve sus OT y el pool; el `total` no revela el del tenant (ADR-065 §15) | ✅ 72 ms |
| 9g. BOLA: un segundo técnico no ve la OT asignada al primero | ✅ 256 ms |

**Hueco de fixture cerrado (infra de tests, aditivo):** el provisioner no creaba el segundo técnico que 9g exige (`E2E_TECH2_*`), por lo que la suite abortaba en 9g incluso con el fix. Se extendió `scripts/e2e-provision-operational.mjs` siguiendo su patrón existente: `tech2@<slug>.invalid` + `E2eTech2-<suffix>!` (override por env), creado/activado con perfil `TECHNICIAN` y pasado a Playwright como `E2E_TECH2_EMAIL`/`E2E_TECH2_PASSWORD`. Es **infraestructura de tests, no producción**; se solicita a AI-PLAT-OPS ratificarla (§14.4). Sin esta extensión, el job de CI `execution-orders-e2e` quedaría rojo en 9g.

### 14.3 Suites sobre el árbol final (conteos reales)

| Suite | Comando | Resultado | Duración |
| --- | --- | --- | --- |
| Lint (post-fix) | `pnpm lint --force` | **8/8 successful · 0 errores · `Cached: 0 cached, 8 total`** | 19.404 s |
| Typecheck (post-fix) | `pnpm typecheck --force` | **8/8 successful · 0 errores · `Cached: 0 cached, 8 total`** | 16.111 s |
| Portal jest | `pnpm --filter @iwana/portal test` | **267/267 suites passed · 2440 passed + 1 skipped (2441)** · exit 0 | 42.9 s |
| E2E operaciones (15 casos: 9 F6 + 6 correcciones FE) | `pnpm test:e2e:portal portal-operations-bandeja-ot.spec.ts` (en lote) | **15/15 passed** | lote 56.2 s |
| E2E pager a11y | `pnpm test:e2e:portal portal-pager-a11y.spec.ts` (en lote) | **9/9 passed** | lote 56.2 s |
| E2E flujo de campo | `pnpm test:e2e:portal portal-field-flow-ticket-ot-inventory.spec.ts` (en lote) | **4/4 passed** | lote 56.2 s |
| **Total lote E2E** | `pnpm test:e2e:portal <3 specs>` | **28/28 passed · exit 0** | 56.2 s |
| API jest | `pnpm --filter @iwana/api test` | **314 passed + 4 skipped suites · 3936 passed + 15 skipped** · exit 0 | 26.8 s |
| Gate de identidad | `audit-ui.mjs` sobre operations | **sin hallazgos · exit 0** | — |

**Líneas 876/975 del field-flow:** verificadas intactas en `HEAD` (ambas contienen el `gotoAuthedDashboard` legado) y sin cambios en el diff; las únicas 2 eliminaciones del archivo siguen siendo la corrección de API de Playwright (`getByLabelText`→`getByLabel`) y la aserción del emisor agenda legado→canónico, ninguna sobre las líneas legadas. Los 4 casos del spec (incluidos los dos que entran por la URL legada) pasan.

### 14.4 Estado de CA-01 / CA-03 y marcadores

- **CA-01:** capa E2E-API **cerrada** (9a–9e verdes) + E2E-N/U ya verdes. Sin condiciones pendientes.
- **CA-03:** capa E2E-API **cerrada** (9f ADR-065 §15 con dos alcances + 9g segundo técnico) + U/UI ya verdes. Sin condiciones pendientes.
- **D-2:** **cerrado** (37/37, exit 0, cleanup OK).
- **DEF-F6-01:** **cerrado** (fix + regresión + verificación).
- **Matriz:** 11/11 con sus capas correspondientes verificadas; CA-01 y CA-03 ya sin asterisco.
- **Marcadores:** el `[BLOQUEO]` de §11 queda **resuelto** (no caduca: se cierra con esta verificación). Nueva `[CONSULTA]` asíncrona a AI-PLAT-OPS para ratificar la extensión del provisioner y las credenciales E2E (§10). Sin `[BLOQUEO]` nuevo: nada del fix quedó roto.
