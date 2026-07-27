# INFORME — Auditoría de gate: DEF-2 (cota de `page`) + Ola 1 de ADR-065 + escalaciones

**Versión:** 1.0
**Fecha:** 2026-07-24
**Modo activo:** **Architect + EM** (auditoría de gate, sin ejecución de código)
**Autor:** AI-EM-ARCH
**Clasificación:** Uso interno

**Artefactos auditados**
- [`docs/prompts/PROMPT-API-DEF2-COTA-PAGE-v1.0.md`](../prompts/PROMPT-API-DEF2-COTA-PAGE-v1.0.md)
- [`docs/plans/2026-07-24-escalaciones-abiertas-paginacion.md`](../plans/2026-07-24-escalaciones-abiertas-paginacion.md)
- Ola 1 de [`docs/plans/2026-07-24-paginacion-numerada-adopcion.md`](../plans/2026-07-24-paginacion-numerada-adopcion.md)

**Antecedente:** [INFORME-API-DEF2-COTA-PAGE-v1.0](INFORME-API-DEF2-COTA-PAGE-v1.0.md) (veredicto NO-GO, 7 disposiciones).
**Skills aplicados:** `iwana-identity-ui-review` (modo review, alcance acotado — ver §4), `ui-ux-pro-max` (subordinado).

---

## Veredicto

| Gate | Veredicto | Razón en una línea |
| --- | --- | --- |
| **DEF-2 hotfix** | **GO-CON-DEUDA** | El bloqueante de merge (H-2) está cerrado; el objetivo del parche **no** se cumple todavía en CRM (H-1 vivo). |
| **Ola 1 de ADR-065** | **NO-GO** | DEF-1 no ejecutado, DEF-4 a medias, y el orden por columna tiene un defecto latente que lo dejará inoperante y silencioso en la Ola 2. |
| **Escalaciones E-1…E-4** | **Cerradas con reparos** | Dos artefactos vigentes se contradicen sobre E-1 y dos cierres se emitieron sin el dato que ellos mismos exigían. |

---

## 1. Evidencia recolectada

Verificación estática sobre el árbol de trabajo (253 archivos modificados, sin commitear) más las tres compuertas ejecutables:

| Compuerta | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api typecheck` | **Verde** (exit 0) |
| `pnpm --filter @iwana/api lint` | **Verde** — 0 errores, 1 warning (directiva `eslint-disable` sobrante en `audit-query.service.spec.ts:41`) |
| `pnpm --filter @iwana/api test` | **Verde** — 199 suites, 2.260 tests, 27 s |
| `grep '\.skip('` en `apps/api/src/modules` | 15 sitios de producción, **los 15 con `clampPage` previo** |
| Utilidades duplicadas (`commercial-/inventory-/taxation-pagination`) | **Retiradas** — solo quedan sus specs, apuntando a `common/pagination` |

Estas tres compuertas cubren exactamente lo que el informe anterior dejó **NO VERIFICADO**. Con eso, la disposición 7 queda cerrada en su parte ejecutable; sigue faltando la matriz de cobertura por endpoint, y ahora hay dato duro sobre ella (§2, D-7).

**La suite verde sigue sin ser evidencia de corrección**: los tres hallazgos altos de este informe son invisibles para ella.

---

## 2. DEF-2 — estado de las 7 disposiciones del informe anterior

| # | Disposición | Estado | Evidencia |
| --- | --- | --- | --- |
| 1 | H-2 `slaBreachStatus` al SQL | **Cerrada (sin su test)** | D-1 |
| 2 | H-1 `@Max(100)` en `limit` de CRM | **ABIERTA** | D-2 |
| 3 | H-3 `tenant.service.ts` con `clampPage` | **Cerrada (con efecto colateral)** | D-3 |
| 4 | H-4 rama `documentNumber` | **ABIERTA — mitigación inefectiva** | D-4 |
| 5 | H-5 clamp dentro de la transacción | **ABIERTA** | D-5 |
| 6 | H-6 nota sobre validación Zod | **Sin evidencia** | D-6 |
| 7 | Auditoría de QA completa | **Parcial** | D-7 |

### D-1 · Cerrada, pero sin la condición que la cerraba — MEDIA

`assurance/services/tickets.service.ts:280-352`. El filtro bajó al `WHERE` con un `CASE` en SQL (`:330-333`), el `getCount()` se computa **después** del filtro (`:335`) y el `slice()` en memoria desapareció. La regresión que bloqueaba el merge está corregida y bien corregida.

La disposición decía «**con un test que lo cubra**». `grep slaBreachStatus **/*.spec.ts` → **cero resultados**. La misma frase del informe anterior —«el portal usa ese filtro y ningún test lo cubre»— sigue siendo cierta hoy sobre una implementación nueva y más compleja.

Riesgo adicional no cubierto: el merge `entities[idx] ↔ raw[idx]` de `getRawAndEntities()` (`:346-349`) asume alineación posicional, y el `CASE` usa `NOW()`, evaluado dos veces (count y página). Ambos son correctos hoy —sin joins y con ventana de milisegundos— y ambos son exactamente lo que un test de contrato debe congelar.

**Acción:** test de integración de `list()` con `slaBreachStatus` en las cinco variantes del `CASE` + un caso de página 2. Bloqueante del cierre de DEF-2.

### D-2 · El parche sigue sin cumplir su objetivo en CRM — ALTA · **ABIERTA**

Sin cambios respecto al informe anterior. `clampPage` acota el **producto**, no `limit`, y los cuatro endpoints de CRM siguen sin tope en ninguna capa:

- `crm/subscribers/subscribers.controller.ts:103` → `limit ? Number(limit) : undefined` → `subscribers.service.ts:285` `clampPage(page ?? 1, limit ?? 20)`.
- `crm/expedientes/expedientes.controller.ts:108-110` y `:355-357` → idéntico patrón.

`GET /crm/subscribers?page=1&limit=10000` → `1 × 10000 ≤ 10_000` → **pasa**, y devuelve 10.000 suscriptores con documento, teléfono y correo **descifrados** (`subscribers.service.ts:317`). Amplificador de extracción masiva de datos personales, relevante a Ley 1581.

`GET /crm/expedientes?page=1&limit=9999` → pasa, y `expediente.service.ts:678-680` dispara un `Promise.all` que abre dos `runInTenantSchema` por fila contra un pool de ~8 conexiones útiles.

El helper que resolvería esto **ya existe y no se usa**: `common/pagination/clamp-limit.ts` expone `clampLimit(limit, MAX_LIMIT=100)`. Ningún endpoint de CRM lo invoca.

**Acción:** `clampLimit` en los cuatro endpoints, o DTO con `@Type(() => Number) @IsInt() @Min(1) @Max(100)`. Sin esto, DEF-2 no está remediado, sólo desplazado.

### D-3 · Cerrada, con un cambio de comportamiento silencioso — BAJA

`tenant/tenant.service.ts:269-273` ya usa `clampPage`. Verificado por casos: `?offset=-5` → `page = 0` → 400; `?limit=-5` → 400. Los 500 con traza que reportaba H-3 desaparecen.

**Nuevo:** la traducción `page = Math.floor(offset / limit) + 1` **redondea el offset a frontera de página**. Con `offset=7, limit=50` la ruta de plataforma devuelve hoy las filas 1-50 donde antes devolvía 8-57. Es un cambio de comportamiento en una ruta de `apps/web`, precisamente lo que la restricción 2 del prompt prohibía. Inocuo si el consumidor sólo pide múltiplos de `limit` — **hay que verificarlo antes de cerrar**, no suponerlo.

### D-4 · Mitigación que no mitiga — MEDIA · **ABIERTA**

`crm/expedientes/expediente.service.ts:645-676`. La rama `documentNumber` sigue omitiendo `skip`/`take`: `getMany()` sobre la tabla completa (`:657`), descifrado AES-GCM fila a fila (`:664`) y `slice()` en memoria (`:673`).

Lo que se añadió es `const safeLimit = Math.min(limit, 20)` (`:656`) con el comentario «para acotar el costo de descifrar todo el conjunto, el limit se reduce a 20 en esta ruta». **`safeLimit` sólo acota el `slice()` posterior; el descifrado ocurre sobre `filteredItems` completo, antes.** El comentario afirma una mitigación que el código no implementa — peor que no mitigar, porque desactiva la siguiente revisión.

**Acción:** retirar el comentario engañoso y llevar la búsqueda por documento a un índice sobre hash determinista (ya existe `common/crypto/hash-email.util.ts` como precedente de patrón), o acotar la rama con un `take` duro y un mensaje de «refine la búsqueda».

### D-5 · Clamp dentro de la transacción — BAJA · **ABIERTA**

`parties/services/party.service.ts:96`, `parties/adapters/party-read.adapter.ts:63`, `wfm/services/visit-requests.service.ts:175`, `inventory/services/write-off.service.ts:293`. Sin cambio. Se absorbe en la Ola 1 según lo dispuesto; hoy la Ola 1 no lo ha absorbido.

### D-6 · Sin evidencia

No encontré la nota documental sobre que la validación efectiva de assurance es Zod (`assurance.controller.ts:103`) y no el `ValidationPipe` global. Es una línea; su ausencia hace que el próximo lector repita el diagnóstico equivocado.

### D-7 · Auditoría de QA — parcial

`typecheck`, `lint` y suite: **verificados y verdes** (§1). La matriz de cobertura por endpoint sigue sin producirse, y el barrido de este informe da el dato que la habría motivado:

- `apply-sort.ts` y `clamp-limit.ts`: **sin spec propio**.
- `sortBy` / `sortableFields`: 0 tests fuera de `build-page-meta.spec.ts`.
- `slaBreachStatus`: 0 tests.
- Los 5 casos exigidos por el prompt (`page` en el límite, justo por encima, no numérica, negativa, cero) están cubiertos **en el helper** (`clamp-page.spec.ts`), no por endpoint.

Además, el entregable 4 del prompt («`@ApiQuery` de `page` con `minimum: 1`») no se cumplió: `assurance.controller.ts:104` y `tasks.controller.ts:65` declaran `@ApiQuery({ name: 'page', required: false, type: Number, example: 1 })`, sin `minimum` ni mención de la cota.

---

## 3. Ola 1 de ADR-065 — estado por entregable

| # | Entregable | Estado |
| --- | --- | --- |
| O-1 | Contrato `ListMeta` / `ListResponse<T>` en `@iwana/shared` | **Hecho** |
| O-2 | Helper común + retiro de las 3 utilidades duplicadas | **Hecho** (con reparo de forma) |
| O-3 | **DEF-1** desempate por `id` en las 7 órdenes | **NO EJECUTADO** |
| O-4 | **DEF-2** clamp en los endpoints de listado | **Hecho en `page`, no en `limit`** (ver D-2) |
| O-5 | **DEF-3** keyset de auditoría | **Hecho** |
| O-6 | **DEF-4** SQL en assurance + retiro de la paginación in-memory de expedientes | **Parcial** |
| O-7 | Orden `sortBy` / `sortDir` con lista blanca | **Andamiaje correcto + defecto latente alto** |
| O-8 | Dual-emit + OpenAPI | **Parcial** (4 de 35 endpoints) |
| O-9 | Cobertura de tests del contrato nuevo | **Insuficiente** |

### O-3 · DEF-1 no ejecutado — ALTA · **bloqueante del gate**

DEF-1 pedía «desempate por `id` en las 7 órdenes que no lo tienen». Las siete siguen sin él, y son precisamente listados con paginación por offset — el caso donde un `ORDER BY` no determinista **repite y pierde filas al cambiar de página**, que es el defecto que la paginación numerada vuelve visible:

| Servicio | Línea | Orden actual |
| --- | --- | --- |
| `tasks/services/tasks.service.ts` | 229 | `created_at DESC` |
| `crm/expedientes/expediente.service.ts` | 643 | `createdAt DESC` |
| `crm/expedientes/expediente.service.ts` | 1105 | `attemptedAt DESC` |
| `inventory/services/asset-lifecycle.service.ts` | 50 | `created_at DESC` |
| `inventory/services/serialized-asset.service.ts` | 249 | `updated_at DESC` |
| `parties/adapters/party-read.adapter.ts` | 82 | `displayName ASC` |
| `tenant/tenant.service.ts` | 277 | `createdAt DESC` |

Nueve endpoints sí lo tienen (tickets, subscribers, party.service, asset-loan, supplier-profile, write-off, visit-requests, stock-movement-query por `movement_number` único, audit). El patrón está claro y aplicado en la mitad del repo; falta terminarlo.

Nótese la coincidencia con E-2: `tasks.service.ts:229` es a la vez la evidencia que sostiene la clasificación «feed» **y** una de las siete órdenes sin desempate.

### O-6 · DEF-4 parcial

Assurance: hecho (D-1). Expedientes: el plan nombra explícitamente `expediente.service.ts:666-669` como paginación in-memory a retirar; **sigue viva** en la rama `documentNumber` (`:672-674` tras el corrimiento). Es el mismo código que D-4.

### O-7 · Orden: andamiaje correcto, defecto latente alto — ALTA · **bloqueante del gate**

**Lo que está bien y no es hallazgo.** `SORTABLE_FIELDS: string[] = []` está vacío en los cuatro servicios (`tickets.service.ts:65`, `subscribers.service.ts:101`, `party.service.ts:38`, `tasks.service.ts:54`). Eso **es correcto** por secuenciación: el plan reserva a la Ola 2 el cierre de la lista blanca, y sólo publica una columna «si tiene índice de soporte y su p95 de página profunda ordenada se mantiene bajo 1,5 s». Publicar campos ahora sería el error.

**Lo que está mal.** En **3 de los 4 sitios, `applySort()` se invoca antes de un `.orderBy(...)` que lo sobrescribe.** En TypeORM, `orderBy()` **reemplaza** el `ORDER BY` acumulado; `addOrderBy()` lo extiende:

| Servicio | `applySort` | `.orderBy(...)` posterior |
| --- | --- | --- |
| `assurance/services/tickets.service.ts` | `:338` | `:341` |
| `crm/subscribers/subscribers.service.ts` | `:308` | `:310` |
| `parties/services/party.service.ts` | `:117` | `:120` |
| `tasks/services/tasks.service.ts` | `:272` | — (**patrón correcto**) |

Hoy es inocuo porque la lista blanca está vacía. **El día que la Ola 2 la puebla, el orden por columna no se aplicará en esos tres recursos — y nadie lo notará**, porque `buildPageMeta` deriva `meta.sort` de la **entrada del cliente**, no del retorno de `applySort` (`tickets.service.ts:367`, `subscribers.service.ts:328`, `party.service.ts:136`, `tasks.service.ts:289`). El servidor respondería «ordenado por X» sobre datos ordenados por el default. Eso viola literalmente el contrato: `ListMeta.sort` = «orden **efectivamente aplicado**». En `tickets.service.ts:338` el retorno se asigna a `sortResult` y no se consume en ninguna parte.

**Corrección de raíz (una sola):** `buildPageMeta` debe alimentarse del retorno de `applySort`, no de la entrada. Con eso, el defecto de orden deja de ser silencioso y se vuelve un fallo visible en el primer test.

**Contrato del helper sin decidir — resolver antes de la Ola 2.** `apply-sort.ts:26` emite `qb.orderBy(sortBy, dir)` con el nombre lógico **crudo**, mientras el desempate sí usa `${qb.alias}.${idAlias}` (`:27`). No está definido si `sortableFields` contiene campos lógicos (`createdAt`) o rutas de alias (`s.createdAt`). En las dos consultas con `innerJoin` (`party.service.ts:105-113`, `party-read.adapter.ts:69-75`) un `ORDER BY created_at` sin prefijo es ambiguo o falla. **Decisión requerida:** `sortableFields` publica nombres lógicos y `applySort` resuelve el prefijo con `qb.alias`; el nombre lógico es lo que viaja en `meta` y en la URL, y nunca se expone un identificador SQL al cliente.

### O-2 y O-8 · Reparos de forma

- `common/pagination/clamp-limit.ts` es un cajón: además de `clampLimit` alberga los tipos de meta legacy de tres módulos, el fragmento Zod de inventory y `sliceDateIdDescPage`. El nombre no describe el contenido y la Ola 2 tendrá que volver a abrirlo. **P3** — separar en `legacy-compat.ts` cuando se toque.
- Dual-emit: los 4 servicios migrados emiten `meta` junto a los campos planos, y los planos llevan `@deprecated` en JSDoc (`assurance/dto/index.ts:387-391`, `tasks/dto/index.ts:261-265`). Correcto en forma.
- Cobertura del envelope: **4 de 35 endpoints**. Si la intención de la Ola 1 era migrar los 35, el gate está lejos; si era establecer contrato + helper + patrón de referencia, está cumplido. **El plan no lo dice con precisión y hay que fijarlo** (§5, decisión 1).

---

## 4. Escalaciones E-1…E-4

### C-1 · Dos artefactos vigentes se contradicen sobre E-1 — **corregir hoy**

| Artefacto | Dice |
| --- | --- |
| `INFORME-ADR065-ESCALACIONES-RESOLUCION-v1.0.md` (v1.1) | «E-1 pendiente de aprobación CTO», «**ADR-066 Propuesto**» |
| `2026-07-24-escalaciones-abiertas-paginacion.md` | «CTO (ADR-066 **Aprobado** 2026-07-24) — **Cerrada**» |
| `ADR-066-…-Runner.md` | «Estado: **Aprobado** · Aprobado por: CTO (2026-07-24)» |

Es el anti-patrón declarado del perfil: dejar dos artefactos contradictorios vigentes tras una decisión. **Acción: informe a v1.2 alineado con el ADR.** Coste: cinco minutos. Coste de no hacerlo: el próximo agente que lea el informe primero cree que la Ola 2 sigue bloqueada por firma.

### C-2 · E-1 se cerró saltándose su propio procedimiento — MEDIA

El plan fijaba el estándar de evidencia: «AI-PLAT-OPS **mide**, sobre un tenant representativo, cuánto dura un `CREATE INDEX` bloqueante… **Ese número decide, no la preferencia**», y «si la medición confirma que (i) sirve para todo, no se toca el runner — es la salida barata y **hay que descartarla explícitamente** antes de tocar infraestructura compartida».

El informe descarta la medición: «se descarta la medición de AI-PLAT-OPS porque el dato ya es concluyente», apoyándose en «`stock_movements` y `audit_logs`: 1M+ filas por tenant en operadores maduros». Eso es una **estimación de escala objetivo**, no una medición de duración de DDL sobre un tenant real.

La decisión es probablemente correcta y el gate formal está cubierto (el CTO firmó ADR-066, y el aprobador no es el productor). Lo que falta es trazabilidad: **el supuesto debe quedar declarado como supuesto**, no como dato. **Acción:** una línea en ADR-066 §Contexto — «volumen estimado, no medido; medición diferida a la ventana de ejecución de la Ola 2».

### C-3 · E-1 está cerrada en decisión, no en ejecución — precisión necesaria

`packages/database/src/migrations/tenant/runner.ts:225` sigue con `startTransaction()` **incondicional**; no existe flag `transactional` en el repo. El plan cierra con «**Ola 2 desbloqueada (ADR-066 aprobado por CTO)**», lo cual es cierto en gobierno y falso en ejecución: la Ola 2 no puede empezar hasta que el runner y `revert.ts` implementen la bifurcación. **Acción:** reformular a «Ola 2 desbloqueada en decisión; su primer entregable es la implementación de ADR-066 en `runner.ts` y `revert.ts`».

### C-4 · E-3 cerrada sin el dato que ella misma declaraba imprescindible — BAJA

El plan es explícito: «**Recomendación:** la 2 si el percentil 95 está por debajo de 100 eventos; la 3 si no» y «**Dato necesario primero:** distribución real de eventos por expediente». El cierre adopta la opción 2 con «cardinalidad acotada por modelo», sin el p95. El código no cambió (`SeguimientoTab.tsx:247`). Riesgo real bajo —es un timeline por expediente, no un listado de tenant— pero el cierre no es reproducible. **Acción:** o se aporta el p95, o el cierre se reetiqueta «excepción de preview **por criterio**, a revisar si el timeline crece».

### C-5 · E-2 cerrada correctamente ✔

`tasks.service.ts:229` ordena `created_at DESC`: coincide con la lectura del plan («hoy es `created_at DESC`, lo que apunta a feed») y con el PRD MOD11 citado. `TasksTable.tsx:158` conserva `PortalTablePagination`. Clasificación **feed**, sostenida por PRD y por código. Sin reparos — salvo que ese mismo `ORDER BY` es una de las siete órdenes sin desempate (O-3).

### C-6 · E-4 correctamente derivada ✔

Plan propio emitido ([`2026-07-24-pickers-softcap-remediacion.md`](../plans/2026-07-24-pickers-softcap-remediacion.md)). El soft-cap sigue vivo (`AssuranceClient.tsx:48`, `USERS_PAGE_SIZE = 100`), que es lo esperado para una P1 fuera del camino crítico.

### Nota de precisión menor

E-3 cita `PORTAL_PAGE_SIZE_OPTIONS` como si existiera («no lo contempla»). Es un **nombre congelado en el contrato DS** (`docs/specs/2026-07-24-paginacion-numerada-ds-contrato.md:83`), todavía no código. La frase es correcta en intención y engañosa en tiempo verbal. Reformular a «el contrato DS no lo contempla».

---

## 5. Revisión de UI — alcance acotado

**Aplicación de la disciplina, declarada.** `iwana-identity-ui-review` establece: «Si el problema es solo backend, contratos API o arquitectura técnica sin superficie visual, esta skill no aplica». **DEF-2 y la Ola 1 son backend puro** — no emito informe de review de UI sobre ellos, y hacerlo habría producido hallazgos inventados. De las escalaciones, sólo E-3 tiene código de UI vivo y auditable hoy; E-2 y E-4 no cambiaron superficie en este ciclo.

### Review UI — pie de paginación del timeline de expediente (MOD05)

**Modo:** código.
**Script de auditoría mecánica:** no ejecutado sobre este archivo (revisión dirigida a un componente, no a la pantalla); los hallazgos siguientes son todos deterministas y citados por línea.
**Puntaje:** 64/100 (P0: 0, P1: 3, P2: 2)

Superficie: `apps/portal/src/components/crm/expedientes/ExpedienteTimelinePanel.tsx:436-502` (el paginador que `SeguimientoTab` alimenta). Tarea principal: recorrer el historial de un expediente sin perder el hilo.

#### [P1][Accesibilidad] Ningún botón del pie tiene foco visible
- **Evidencia:** `ExpedienteTimelinePanel.tsx:442, :455, :466, :489, :498` — los cinco botones declaran `rounded-*`, `border` y `px/py`, y **ninguno** `focus-visible:` ni `interactiveFocusClassName`.
- **Impacto:** el operador que navega por teclado no sabe en qué botón está; es la única forma de avanzar por el historial sin ratón.
- **Recomendación:** aplicar `interactiveFocusClassName` de `apps/portal/src/components/shared/portal-ui.tsx`.
- **Esfuerzo:** S — **quick win**.

#### [P1][Accesibilidad] Objetivos táctiles de ~24 px
- **Evidencia:** `:442`, `:466`, `:498` — `px-2 py-1` sobre `text-xs` (contenedor `:437`) da ≈24 px de alto, frente al mínimo de 44 px.
- **Impacto:** en tablet —el dispositivo del técnico en campo— cambiar de página exige puntería; los botones numéricos están además separados por `gap-1`.
- **Recomendación:** `min-h-11` y `gap-2`, o adoptar el primitive del contrato DS cuando exista.
- **Esfuerzo:** S — **quick win**.

#### [P1][Identidad / ADR-065 §9] El estado de paginación no vive en la URL
- **Evidencia:** `SeguimientoTab.tsx:104-105` — `timelinePage` y `timelinePageSize` en `useState`; ningún `searchParams`.
- **Impacto:** el botón Atrás del navegador no devuelve a la página anterior del historial y el expediente no se puede compartir por enlace en la vista que el operador estaba mirando.
- **Recomendación:** entra por `useTableQueryState` en la Ola 3; **no rehacerlo antes a mano**.
- **Esfuerzo:** M — diferido a Ola 3/5 por secuenciación, no por severidad.

#### [P2][Accesibilidad] La página actual se comunica sólo por color
- **Evidencia:** `:468-472` — el botón activo se distingue por `border-iwana-primary bg-iwana-primary text-white`; sin `aria-current="page"`, sin cambio de peso, sin texto accesible.
- **Impacto:** un lector de pantalla enumera diez botones idénticos. WCAG 1.4.1.
- **Recomendación:** `aria-current="page"` en el activo y `aria-label={\`Página ${page}\`}` en todos.
- **Esfuerzo:** S — **quick win**.

#### [P2][Ingeniería frontend] Variante local de un patrón firma
- **Evidencia:** `:436-502` — ventana de cinco botones, elipsis y saltos a primera/última implementados a mano.
- **Impacto:** deuda ya inventariada; su destino es `PortalTablePager` en la Ola 5. Se reporta para que el conteo del gate no lo pierda, no como trabajo nuevo.
- **Esfuerzo:** M (absorbido por la Ola 5).

**Verificado sin hallazgo:** el lima **no** aparece en el pie (usa `iwana-primary`), que es lo correcto — página es posición, no avance. Sin `dark:bg-gray-*`. Sin hex de marca. Los botones numéricos se ocultan en móvil conservando Anterior/Siguiente: degradación aceptable.

**Salvedad de legacy en fases:** este pie es preexistente y su consolidación ya está planificada. Los dos hallazgos de accesibilidad **no se acogen a esa salvedad** —accesibilidad prevalece— y son quick wins de esfuerzo S.

**Veredicto UI:** Aprobada con cambios. Bloqueantes: foco visible y objetivo táctil.

### Criterios que las Olas 3 y 5 deberán cumplir (para no auditarlos dos veces)

`aria-sort` en todo encabezado ordenable y **uno solo** distinto de `none` por tabla; el lima fuera del pager y del control de orden; nunca los dos pies montados a la vez; página, tamaño, filtros y orden en la URL; columnas ordenables **leídas de `meta.capabilities.sortableFields`**, jamás de una lista local; skeleton con forma en vez de spinner.

---

## 6. Disposición

| # | Acción | Severidad | Responsable | Momento |
| --- | --- | --- | --- | --- |
| 1 | **O-7(b)**: alimentar `buildPageMeta` con el retorno de `applySort` y mover `applySort` **después** del `.orderBy` default en tickets, subscribers y party | ALTA | AI-SR-FULL | **Bloqueante del gate de Ola 1** |
| 2 | **O-3 / DEF-1**: `addOrderBy('<alias>.id')` en las 7 órdenes listadas | ALTA | AI-SR-FULL | **Bloqueante del gate de Ola 1** |
| 3 | **D-2 / H-1**: `clampLimit(…, 100)` en los 4 endpoints de CRM | ALTA | AI-SR-FULL · revisión AI-SEC-ENG | **Bloqueante del cierre de DEF-2** |
| 4 | **D-1**: test de `list()` de assurance con `slaBreachStatus` (5 variantes + página 2) | MEDIA | AI-SR-QA | Bloqueante del cierre de DEF-2 |
| 5 | **C-1**: informe de escalaciones a v1.2, alineado con ADR-066 Aprobado | MEDIA | AI-EM-ARCH | Hoy |
| 6 | **O-7(d)**: fijar en ADR-065 que `sortableFields` publica nombres lógicos y `applySort` resuelve el prefijo con `qb.alias` | MEDIA | AI-EM-ARCH | **Antes de la Ola 2** |
| 7 | **D-4 / O-6**: retirar el comentario engañoso de `expediente.service.ts:653-655` y acotar la rama `documentNumber` | MEDIA | AI-SR-FULL | Ticket propio |
| 8 | **C-3**: reformular el cierre de E-1 («desbloqueada en decisión; primer entregable = implementar ADR-066 en runner y revert») | MEDIA | AI-EM-ARCH | Hoy |
| 9 | **D-3**: verificar que ningún consumidor de `apps/web` pide `offset` no múltiplo de `limit` | BAJA | AI-SR-FULL | Antes de cerrar DEF-2 |
| 10 | **D-7**: `@ApiQuery` de `page` con `minimum: 1`; specs de `apply-sort.ts` y `clamp-limit.ts` | BAJA | AI-SR-FULL | Con la disposición 1 |
| 11 | **UI**: foco visible y `min-h-11` en el pie del timeline; `aria-current="page"` | BAJA | AI-FE-PLATFORM | Quick wins, S |
| 12 | **C-2 / C-4**: declarar como supuestos los datos no medidos (duración de DDL; p95 de eventos por expediente) | BAJA | AI-EM-ARCH | Hoy |
| 13 | **D-6**: nota en el módulo de assurance sobre validación efectiva por Zod | BAJA | AI-SR-FULL | Con la disposición 4 |

Con 1 y 2 cerradas, el gate de Ola 1 pasa a **GO-CON-DEUDA**. Con 3 y 4 cerradas, DEF-2 queda efectivamente remediado y su gate cierra.

---

## 7. Decisiones de gobierno que emito

**Decisión 1 — alcance de la Ola 1 sobre el envelope.** Hoy 4 de 35 endpoints emiten `meta`, y el plan admite dos lecturas. **Fijo la lectura estrecha:** la Ola 1 entrega *contrato + helper + patrón de referencia aplicado a 4 recursos representativos*; la migración de los 31 restantes se reparte en las Olas 5, 6 y 7 junto a su frontend, para no dejar meses de dual-emit sin consumidor. **Justificación:** un envelope emitido y no consumido es deuda, no avance; y la regla de convivencia ya exige migrar por módulo completo. **Impacto:** sin cambio multi-tenant, seguridad ni regulación; reduce el riesgo de rama larga. **Requiere ADR:** no — es precisión del plan, dentro de ADR-065. **Requiere CTO:** no.

**Decisión 2 — contrato de `sortableFields`.** Nombres **lógicos**, resueltos por `applySort` contra el alias del query builder. Ningún identificador SQL viaja al cliente ni a la URL. Se registra en ADR-065 §18 antes de que la Ola 2 cierre la lista blanca. **Requiere CTO:** no.

**Sin escalación al CTO.** Nada de lo hallado cambia stack, boundary, patrón ni presupuesto.

---

## 8. Hallazgo de proceso

El informe anterior recomendaba que el stop/go incluyera «una verificación explícita de alcance —un diff acotado a los archivos previstos— y no sólo la suite verde». Esta auditoría lo confirma desde el otro lado: **las tres compuertas ejecutables están verdes y los tres hallazgos altos son invisibles para ellas.**

Los tres comparten una firma: *código presente, efecto ausente*. `applySort` invocado y sobrescrito; `safeLimit` calculado y aplicado al paso equivocado; `sortResult` asignado y no consumido. Ninguno rompe tipos, lint ni tests, porque **ninguno cambia la forma — sólo el resultado**. La defensa contra esta clase de defecto no es otra compuerta ejecutable: es que el contrato observable (`meta.sort`) se derive de lo que el código **hizo** y no de lo que el cliente **pidió**. Por eso la disposición 1 encabeza la lista aunque hoy no rompa nada.
