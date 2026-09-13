# Informe — MOD11 Operaciones · G3 · Factibilidad frontend (sub-rutas y bandeja de OT)

**Versión:** 1.0
**Fecha:** 2026-09-13
**Emisor:** AI-FE-PLATFORM (Frontend Platform Engineer)
**Encargo:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA1-FE-PLATFORM-v1.0.md` (dictamen de factibilidad, **sin implementar F2**)
**Cierra:** parte de **G3** (etapa 3 del protocolo v1.5 §3 — factibilidad)
**Dictamen sobre:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F2-F3-v1.0.md` (leído, **no ejecutado**)

---

## 1. Veredicto

> **VIABLE CON AJUSTES.**

Ninguno de los diez puntos del encargo es inviable: la arquitectura de la spec (despachador 307 en la raíz, gate por sub-ruta, split en trece archivos, re-export de tipos, pestañas con `<Link>`, cierre no destructivo) **verifica contra el código real** con evidencia por archivo:línea. Los ocho ajustes de §4 no reabren alcance: son precisiones de implementación y de redacción de la spec que cuesta una línea ahora y una sesión de debugging después. Dos de ellos (**A1** y **A2**) son bloqueantes de facto para que F2 compile y la suite quede verde, y deben entrar al alcance declarado de F2 antes de arrancar.

**Costo estimado de F2:** 5–6.5 sesiones (detalle en §6). **F6:** 1–1.5 sesiones (el grueso del reparto de specs migra a F2 por el ajuste A2).

---

## 2. Alcance y método

- Verificación **contra el código real**, no por inspección de la spec: se abrieron y leyeron los archivos citados en cada punto, incluido `OperationsClient.tsx` completo (1 315 líneas) y su spec completa.
- Búsqueda exhaustiva de emisores hacia `/dashboard/operations?` en `apps/portal/src` y `apps/web/src` (punto 9).
- **DoR de etapa 5 verificado de paso** (§3.1 del protocolo): los contratos congelados de F0 **están publicados** — `packages/shared/src/contracts/operations/operational-tasks.ts` v1 (los nueve tipos, líneas 27–150; `sortBy`/`sortDir` 64–73; `meta` con dual-emit 75–85), `packages/shared/src/contracts/operations/execution-orders-list.ts` existe, y ambos están exportados desde `packages/shared/src/index.ts:53-55`. El encargo de F2-F3 puede arrancar cuando G3 cierre.
- Stack verificado: `apps/portal/package.json` declara `next ^16.2.11`, `react ^19.2.0`. `redirect()` emite 307 y `permanentRedirect()` 308 (semántica estándar de App Router mantenida en Next 16).

**Lectura obligatoria completada:** `AGENTS.md`; protocolo v1.5 (§3, §3.1, §6.3); plan v2.1 (§3.3, §3.4, §4); spec v1.0 aprobada (§4.1–§4.6, §4.9, §4.10); prompt F2-F3 v1.0.

---

## 3. Verificación de los diez puntos del encargo

### 3.1 Despachador de deep links en la raíz — ✅ viable

- `apps/portal/src/app/dashboard/operations/page.tsx:1-10` es hoy un Server Component sin `searchParams` que monta `OperationsClient`. La reescritura como despachador es directa y localizada.
- `redirect()` 307: correcto. El redirect se resuelve **antes de pintar cualquier árbol** — no hay parpadeo de árbol equivocado; el costo es un salto de servidor adicional solo para enlaces legados (notificaciones y correos son cargas de página completa; el salto es imperceptible en ese contexto). 307 no se cachea: el mapeo puede cambiar sin consecuencias (CA-02 protegida).
- El mapeo de spec §4.2 cubre **todos** los shapes que hoy se emiten (verificado en §3.9): `?executionOrderId=`, `?ticketId=&fromAssurance=1`, `?taskId=` y sin parámetros. Las ramas reconocidas preservan la query completa («+ resto de params»).
- **Razonamiento del caso sin parámetros: correcto.** Los permisos viven en contexto cliente: `permissions-context.tsx:2` (`'use client'`), `usePermissions()` en `:227`, y el fallback SSR **deniega por defecto** (`STATIC_FALLBACK_PERMISSIONS_CONTEXT`, `:54-57`, `hasPermission: () => false`). Un Server Component no puede elegir «primera pestaña permitida»; construir un resolvedor de permisos server-side sería un patrón nuevo fuera de alcance. El componente cliente `OperationsLandingRedirect` solo para ese caso es la solución correcta y acotada (coherente con `nextjs-app-router-patterns`: Client Component justificado y mínimo).
- Precendente del gate en layout verificado: `apps/portal/src/app/dashboard/scheduling/layout.tsx:9-14`.
- Nota de implementación (ajuste A8): `useSearchParams()` en cliente requiere `Suspense` o render dinámico; las páginas del portal son dinámicas por cookie de sesión, pero conviene declararlo en F2.

### 3.2 Gate por sub-ruta vs `anyOf` — ✅ confirmado

- `PagePermissionGate.tsx:49-59`: la prop es `permission: AccessPermissionKey` **singular** (`:51`) y el chequeo es una sola llamada `hasPermission(permission)` (`:82`). No hay OR.
- Costo de añadir `anyOf`: **S–M** — unión de tipos en la prop, loop usando `hasAnyPermission` (ya existe en el contexto, `permissions-context.tsx:221`) y actualización de `PagePermissionGate.spec.tsx`. Retrocompatible para los ~7 consumidores actuales (6 layouts + `InventoryClient.tsx`).
- Pero es un cambio en una **primitive transversal del shell** (capa access-control, plano DS-OWNER/EM-ARCH), y **no es necesario**: gatear por sub-ruta es además más preciso — un técnico con `execution_orders.read` y sin `tasks.read` ve OT y no ve tareas, coherente con la semántica OR de la entrada del Sidebar (`Sidebar.tsx:127-131`). **Confirmo la conclusión de spec §4.1**: gate por sub-ruta; `anyOf` queda como mejora futura de la primitive a registrar vía DS-OWNER, no en este módulo.

### 3.3 Split de `OperationsClient.tsx` — ✅ viable con ajustes A1–A3

Verificado contra el archivo real (1 315 líneas):

- **45 `useState`** (líneas 373–448), no ~25 en el archivo completo. El «~25» de la spec es exacto para el **slice de consola**: 26 estados de OT (393–447) + `offline` (448). El hook verbatim es factible con ese conteo.
- **Dos guards secuenciales**, ambos locales y extrapables: `detailRequestRef` (`:449`, bandeja de tareas) y `executionOrderRequestSeqRef` (`:450-452`; escrito en `openExecutionOrder` `:554-555`, leído en `:613-615`, invalidado en el cierre `:1278`).
- **Acoplamientos reales encontrados (ninguno bloquea el split; tres exigen ajuste):**
  1. **A1 — import de tipo desde el drawer:** `ExecutionOrderDrawer.tsx:38` importa `type { ExecutionOrderMissingRequirement } from './OperationsClient'`. El drawer **no se mueve ni se elimina**, así que al borrar el monolito ese import rompe. La interfaz (`OperationsClient.tsx:153-158`) debe vivir en `execution-order-requirements.ts` y el drawer re-punta una línea de import type. Esto **refuta la afirmación de spec §4.5** («su único importador desaparece en el mismo commit»): hay dos importadores — `page.tsx:1` (desaparece) y `ExecutionOrderDrawer.tsx:38` (permanece). El edit es type-only, mecánico y no «mueve» el drawer; su spec (`ExecutionOrderDrawer.spec.tsx`) **no** importa del monolito (verificado).
  2. **A2/A3 — ver §4.** El único estado verdaderamente transversal es el directorio de usuarios (alimenta `responsibleOptions` del intake vía `:466-473` y `userLabelMap` del drawer vía `:475-478`), exactamente como dice la spec §4.5.
  3. **Extracción verbatim de `use-execution-order-console.ts`: factible.** El slice de consola es autocontenido: estados 393–448, `openExecutionOrder` 553–714, handlers 804–1117, `offline` y su efecto 448/454–464. El bloque de reset del `onClose` (1275–1303) se convierte en `closeExecutionOrder()` expuesto por el hook (conserva el incremento del seq-ref) + la escritura de URL en el cliente con `mergeUrlSearchParams`. El efecto de montaje que hoy lee `window.location.search` (716–725) pasa a leer `useSearchParams()` en `ExecutionOrdersClient` — el hook no cambia.
- Rangos de origen de spec §4.5 verificados contra el real: intake (759–787, 1130–1175), bandeja (495–551, 727–757, 788–803, 1177–1215 + drawer 1217–1236), consola (393–448, 553–725, 804–1117, 1238–1312). Coinciden.
- «No mover» verificado: `ExecutionOrderSummary.tsx` es importado por `ScheduleEventDrawer.tsx:13`.

### 3.4 Re-export de los nueve tipos — ✅ viable (y des-riesgado)

- Los nueve tipos declarados localmente en `api-client.ts:6699-6816` coinciden 1:1 con el contrato ya publicado en `@iwana/shared` (`operational-tasks.ts:27-150`), incluidos `sortBy`/`sortDir` en params y `meta` + campos `@deprecated` en la respuesta. Exportados desde `packages/shared/src/index.ts:55`.
- El re-export type-only (`export type { … } from '@iwana/shared'` en `api-client.ts`) mantiene todos los imports de consumidores en `'@/lib/api-client'` — el propio monolito consume varios así (`OperationsClient.tsx:17-31`). Ningún import de consumidor cambia (condición stop/go de F2 satisfecha por construcción).
- Sin colisión de nombres: `OperationalTaskRecord` no existía antes en shared (el archivo es de F0, 2026-09-13).
- Matiz sin impacto: dos DTOs MOD11 quedan locales (`LinkTaskScheduleEventDto`/`LinkTaskWorkOrderDto`, `api-client.ts:6787-6793`) y fuera de los nueve — correcto; si F5 los necesitara compartidos sería adenda de contrato vía AI-EM-ARCH.
- Matiz de tests: `ListOperationalTasksResponse` gana `meta` **requerido**. Los mocks actuales construyen el objeto con `as never` (`OperationsClient.spec.tsx:617-619, 643-648`) y no rompen; los mocks nuevos (F5/F6) deberán incluir `meta.capabilities`.

### 3.5 Pestañas con `<Link>` reales — ✅ viable con el matiz A4

- Los tres class-tokens existen: `portalModuleTabsShellClassName` (`portal-ui.tsx:341-342`), `portalModuleTabTriggerClassName` (`:353-359`), `portalTabActiveClassName` (`:311-312`).
- **Matiz que la spec debe precisar (A4):** el trigger píldora activa su estado con `data-[state=active]:` — convención de Radix. Con `<Link>` real no hay `data-state`; el componente debe fijar `data-state="active"` manualmente en la pestaña activa (atributo válido en un anchor; el selector de Tailwind no distingue quién lo puso). Cero cambio de design system.
- `portalTabActiveClassName` es de la **gramática subrayado** (`border-b-2`, tabs de recurso); mezclarla con la píldora duplica/conflicta la señal activa. La composición correcta es shell (`:341`) + track `portalModuleTabsTrackClassName` (`:349-350`) + trigger con `data-state` manual.
- El shell ya tiene 8 consumidores; el trigger píldora aún ninguno — `OperationsModuleTabs` será el primero y fija el patrón sin conflicto con precedentes.
- `aria-current="page"` + `<nav aria-label>` como pide la spec es correcto para tabs de ruta (links reales, sin roving tabindex de Radix — decisión correcta para rutas compartibles/abribles en pestaña nueva).

### 3.6 Cierre no destructivo con `mergeUrlSearchParams` — ✅ confirmado

- `merge-url-search-params.ts:6-21`: fusiona updates en un `URLSearchParams` y **elimina la clave** con `null`/`undefined`/`''`, preservando el resto — exactamente lo que la spec asume («retira solo su parámetro»). `withSearchParams` (`:24-25`) construye `pathname?query`.
- Es el patrón establecido del repo: lo consume `use-table-query-state.ts` (portado de ADR-065 Ola 3, según la propia cabecera del helper).
- Sustituye 1:1 al `router.replace('/dashboard/operations')` de `OperationsClient.tsx:1303` (que hoy borra todo parámetro restante — CA-06 protegida).

### 3.7 Deep link `?taskId=` sin modificar `TaskDetailDrawer` — ✅ correcto

- `TaskDetailDrawer.tsx:28-39`: 100 % controlado por props (`open`, `task`, `timeline`, `assignmentHistory`, callbacks). Cero lógica de URL interna. Cambia únicamente quién calcula `open` (`TasksInboxClient` desde `?taskId=`), tal como dice la spec §4.6.
- El bootstrap del deep link necesita resolver el registro por id: `tasksApi.get(id)` existe (`api-client.ts:6930`) — la bandeja puede fetchear por id cuando el `?taskId=` no está en la página actual. No falta ninguna pieza.
- Nota menor: `resolveResponsibleLabel` depende del directorio (`userLabelMap`); para NOC/SUPPORT el deep link mostrará el id crudo hasta que `responsibleLabel` (§4.7.4, F1) cubra la visualización — ver punto 3.8.

### 3.8 Fin del crawl — punto sensible — ver §5 (lectura de costo de cada salida)

### 3.9 Compatibilidad de deep links de otros módulos — ✅ ninguno rompe

- Búsqueda exhaustiva en `apps/portal/src` y `apps/web/src` de `/dashboard/operations?`: los únicos emisores productivos son los tres de la spec, y emiten **exactamente** los shapes del mapeo §4.2:
  - `PendingVisitRequestDetailPanel.tsx:517` → `?executionOrderId=…` (href de `<Link>`).
  - `SchedulingClient.tsx:1532` → `?executionOrderId=…` (router.push).
  - `AssuranceClient.tsx:745` → `?ticketId=…&fromAssurance=1`.
- No hay emisores ocultos. Solo aserciones de test las reflejan: `AssuranceClient.spec.tsx:238` y `SchedulingClient.spec.tsx:813` → actualizar a la URL canónica en F2 (van al costo de A2).
- Confirmado lo que la spec §4.2 mantiene sin cambio: `dashboard-role-composition.ts:419` (`fallbackHref: '/dashboard/operations'`, sin params → landing por permiso, exactamente lo que un fallback de rol quiere) y `api-client.ts:4347-4352` (catálogo del buscador, `route: '/dashboard/operations'`; opcionalmente gana hijas).
- El e2e protegido entra por la URL legada (`e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts:876` y `:975`) — el despachador mantiene vivos ambos flujos **sin tocar esas líneas** (plan §10.11 consistente), y la aserción del heading (`:877`) se preserva subiendo el `PageHeader` al `layout.tsx`.

### 3.10 Coste real del reparto de specs (F6) — números verificados

`OperationsClient.spec.tsx`: **30 585 bytes (~30 KB ✅), 891 líneas, 22 declaraciones `it`, 26 casos en runtime** (un `it.each` de 5 filas en `:583-591` concilia el 26 del encargo). Composición real:

| Bloque | Casos | Migración |
| --- | --- | --- |
| Funciones puras (collections + requirements) | 10 `it` + 5 filas `each` = **15 runtime** | **Import-only** ✅ — las 9 funciones ya están exportadas (`OperationsClient.tsx:63, 77, 87, 160, 226, 273, 279, 307, 327`); las dos specs puras cambian solo el import |
| Montaje del componente | **11 `render(<OperationsClient/>)`** (`:357, 436, 506, 595, 622, 650, 672, 791, 821, 856, 879`) | **No puede esperar a F6** — el componente bajo test se elimina en F2 (ajuste A2) |

Lectura de costo: el «reparto» que el plan asigna a F6 es en realidad **bimodal**. La parte pura es barata (import-only, como dice el prompt F2 §6). La parte de montaje (11 casos, incluidos QA-49 en `:663` y el descarte de respuesta tardía en `:805`, ambos sobre la consola) debe re-apuntarse en F2 a `TasksInboxClient`/`TaskIntakeClient`/`ExecutionOrdersClient` con aserciones idénticas y los 6 `pushState` a URL canónica (`:354, 433, 503, 788, 818, 853, 876`); F6 queda para el reparto fino, tests nuevos y e2e. Costo: **+1–1.5 sesiones en F2**; F6 baja a **1–1.5 sesiones**. Si F2 no lo hace, la suite de `main` queda roja entre F2 y F6 — inaceptable en el modelo de rama única (plan §4.5).

---

## 4. Ajustes recomendados a la spec / prompt (entrada de la decisión de G3)

| # | Ajuste | Evidencia | Severidad si no se adopta |
| --- | --- | --- | --- |
| **A1** | `ExecutionOrderMissingRequirement` (interface + helpers) vive en `execution-order-requirements.ts`; `ExecutionOrderDrawer.tsx:38` re-punta su import type (una línea, el drawer no se mueve). Corregir la frase de spec §4.5 «su único importador desaparece en el mismo commit»: hay dos importadores. | `ExecutionOrderDrawer.tsx:38`; `OperationsClient.tsx:153-158`; `page.tsx:1` | Typecheck roto en F2 |
| **A2** | Declarar en el alcance de F2 el re-apuntado de los **11 casos de montaje** del spec (aserciones idénticas) + 6 `pushState` a URL canónica + 2 aserciones externas (`AssuranceClient.spec.tsx:238`, `SchedulingClient.spec.tsx:813`). F6 reparte fino y añade tests nuevos. | `OperationsClient.spec.tsx` (11 renders, §3.10) | Suite roja en `main` entre F2 y F6 |
| **A3** | Adjudicar explícitamente a F2 la consecuencia estructural del split: el alta exitosa redirige a `/tasks?taskId=<nuevo>` (spec §4.4 mecanismo 3), porque `handleCreate` llama `loadTasks` (`OperationsClient.tsx:766`) y con el intake en su propia ruta esa llamada es imposible (bandeja desmontada). Definir la suerte del `PortalAlert` de éxito (`:1145-1163`) en `/tasks/new`. | `OperationsClient.tsx:766, 1145-1163`; spec §4.4 | Ambigüedad que fuerza una decisión de comportamiento en pleno «refactor puro» |
| **A4** | Precisar la composición de tabs en spec §4.3: shell (`portal-ui.tsx:341`) + track (`:349`) + trigger (`:353`) con `data-state="active"` fijado manualmente en el `<Link>` activo. No mezclar `portalTabActiveClassName` (`:311`, gramática subrayado) con la píldora. | `portal-ui.tsx:311-312, 341-359` | Señal activa duplicada/conflictiva; retrabajo visual |
| **A5** | Definir el estado del landing cuando el usuario **no tiene ninguna** pestaña permitida (spec §4.2 no lo cubre): reutilizar `restrictedShellClassName` (`PagePermissionGate.tsx:42-47`, exportado precisamente para reutilización — precedente `InventoryClient.tsx`); prohibido duplicar la cadena. | `PagePermissionGate.tsx:42-47`; spec §4.2 | Estado sin definir en una URL accesible directa |
| **A6** | `use-operational-users.ts`: la memo a nivel de módulo de la promesa **debe invalidarse al cambiar de sesión** (logout / cambio de tenant en SPA sin recarga) — evita fugar el directorio de un tenant a la sesión siguiente. Añadir a la aceptación de F2/F5. | Spec §4.5 (memo de promesa); `OperationsClient.tsx:376, 466-478` | Fuga de directorio entre sesiones (higiene multi-tenant) |
| **A7** | Comportamiento del despachador ante params no reconocidos (ninguna de las tres llaves): recomendado caer en la rama landing; las ramas reconocidas ya preservan la query completa. | Spec §4.2 | Caso sin definir, decisión improvisada en F2 |
| **A8** | Nota de implementación: `useSearchParams()` en cliente bajo `Suspense`/render dinámico en el despachador, landing y pestañas. | `next ^16.2.11`; patrón App Router | Warnings de prerender; bajo |

---

## 5. Punto sensible 8 — degradación del picker para NOC/SUPPORT (lectura de costo)

**Estado real verificado.** El crawl (`loadOperationalUsers`, `OperationsClient.tsx:339-352`, do/while de 100 en 100) consume `usersApi.list`, cuyo endpoint exige `@Roles(ADMIN, SYSTEM_ADMIN)` + `USERS_READ` (`users.controller.ts:94-96`). NOC y SUPPORT reciben 403, el `.catch()` silencioso (`OperationsClient.tsx:545-551`) lo traga, y el formulario se degrada a opciones vacías; el drawer muestra ids crudos vía el fallback de `resolveResponsibleLabel`. NOC y SUPPORT son usuarios legítimos del módulo según el Sidebar (`Sidebar.tsx:119-126`). **La degradación silenciosa existe hoy**; el diseño no la introduce — se niega a heredarla (spec §4.8, plan §11.1).

**Dato clave:** `GET /users/search` tiene el guard **idéntico** (`users.controller.ts:160-162`). El swap crawl→picker **no cambia quién está autorizado**; solo vuelve visible el fallo (por búsqueda, en el estado del picker) frente al fallo invisible de hoy (una vez por montaje).

**Salida 1 — Ampliar `@Roles` (y posiblemente `@Permissions`) del picker.** Costo **M**. Es cambio backend (boundary sr-backend): decoradores; verificar si NOC/SUPPORT tienen `USERS_READ` en la matriz de permisos — si no lo tienen, ampliar roles **no basta** y el 403 persiste por la capa de permisos; OpenAPI; y revisión **obligatoria** de AI-SEC-ENG (ampliación de la audiencia con acceso al directorio de usuarios; el endpoint es PII-mínimo — id/label/sublabel, `users.controller.ts:156-168` — pero ampliar quién lo consulta es decisión de seguridad, no de UI). No es una decisión de frontend.

**Salida 2 — Declarar la degradación visiblemente.** Costo **S**. Solo frontend, en F5: mapear el 403 del picker/hook a un estado vacío explícito y accionable (copy conforme a `system-vocabulary-review`), p. ej. que el usuario entienda que no puede buscar personas y qué salida tiene (área interna como responsable, o solicitar a un administrador). Es **paridad con hoy pero visible**; y `responsibleLabel` (§4.7.4, F1) reduce la dependencia del directorio para *mostrar* nombres, lo que hace la salida sostenible en el tiempo.

**Recomendación:** Salida 2 dentro de este plan (alcance frontend, cero cambio de autorización, sin nueva superficie de seguridad); registrar la Salida 1 como decisión de producto/seguridad para AI-EM-ARCH + AI-SEC-ENG fuera del plan. La `[CONSULTA]` bloqueante la emitirá F5 cuando llegue ahí, según plan §11.1 — no corresponde anticiparla desde factibilidad.

---

## 6. Costo estimado y riesgos técnicos

**F2 (AI-FE-PLATFORM), en sesiones:**

| Tramo | Estimado |
| --- | --- |
| Rutas, layouts, gates por sub-ruta, despachador, tabs, landing | 1 – 1.5 |
| Split en trece archivos (hook verbatim incluido) | 1.5 – 2 |
| Re-export de los nueve tipos (contrato ya publicado — verificado) | 0.25 |
| Cierre no destructivo + deep link `?taskId=` | 0.5 |
| Emisores (3) + 2 aserciones de specs externas | 0.25 |
| Re-apuntado de los 11 casos de montaje (A2) | 1 – 1.5 |
| `audit-ui.mjs`, lint, typecheck y ajustes | 0.25 – 0.5 |
| **Total F2** | **5 – 6.5** |

**F6:** 1 – 1.5 sesiones (el grueso del reparto cae en F2 por A2).

**Riesgos técnicos (frontend):**

| # | Riesgo | Mitigación |
| --- | --- | --- |
| RF1 | Suite roja en `main` entre F2 y F6 si los 11 casos de montaje no se re-apuntan en F2 | A2 — hacerlo parte del alcance de F2 |
| RF2 | Import roto en `ExecutionOrderDrawer.tsx:38` al eliminar el monolito | A1 — el typecheck lo detecta; mover la interfaz a `execution-order-requirements.ts` |
| RF3 | Refactor y comportamiento mezclados (R6 del plan) | F2 refactor puro salvo las consecuencias estructurales declaradas (A3); handlers y consola extraídos verbatim |
| RF4 | Pasos del e2e de flujo de campo posteriores a `:876`/`:975` que asuman intake+bandeja en la misma pantalla | QA mapea en F6 (ya asignado por el plan); las líneas protegidas no se tocan y siguen vivas vía despachador |
| RF5 | Fuga de directorio entre sesiones por memo sin invalidación | A6 |
| RF6 | `Suspense`/prerender con `useSearchParams` en cliente | A8 — nota de implementación, riesgo bajo |

---

## 7. Marcadores

**No se emitió ningún marcador** (`[BLOQUEO]` ni `[CONSULTA]`) en esta sesión:

- El DoR está satisfecho: los contratos congelados de F0 están publicados, exportados y verificados (`packages/shared/src/index.ts:53-55`).
- Ninguno de los diez puntos es inviable ni encontró un bloqueo sin salida dentro de mi dominio.
- La decisión del picker NOC/SUPPORT ya tiene dueño y mecanismo asignados por el plan §11.1 (llega como `[CONSULTA]` bloqueante desde F5); anticiparla aquí duplicaría el canal de gobierno.
- Los ajustes A1–A8 son entradas de la decisión de G3 de AI-EM-ARCH, no supuestos asumidos: nada de este dictamen se implementó.

---

## 8. Skills leídas (antes de dictaminar)

1. `.agents/skills/nextjs-app-router-patterns/SKILL.md` — obligatoria
2. `.agents/skills/frontend-dev-guidelines/SKILL.md` — obligatoria
3. `.agents/skills/core-components/SKILL.md` — obligatoria
4. `.agents/skills/monorepo-architect/SKILL.md` — de apoyo (re-export de tipos)
5. `.agents/skills/iwana-identity-ui-review/SKILL.md` — de apoyo (script `audit-ui.mjs` y reglas duras de tabla/tabs citadas en el dictamen)

---

## 9. Trazabilidad

| Artefacto | Ruta | Uso en este dictamen |
| --- | --- | --- |
| Encargo | `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA1-FE-PLATFORM-v1.0.md` | Alcance de los 10 puntos |
| Prompt dictaminado (no ejecutado) | `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F2-F3-v1.0.md` | Objeto del veredicto |
| Spec aprobada | `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 | §§4.1–4.6, 4.9, 4.10 verificadas |
| Plan | `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 | §3.3 gates, §3.4 olas, §4 skills, §10 restricciones, §11.1 punto 8 |
| Protocolo | `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 | §3 etapa 3, §3.1 DoR, §6.3 marcadores |
| Contratos congelados | `packages/shared/src/contracts/operations/operational-tasks.ts` v1 · `execution-orders-list.ts` v1 | DoR verificado; punto 3.4 |

*Este dictamen es una entrada de la decisión de G3 de AI-EM-ARCH; no constituye aprobación del diseño ni autorización para iniciar F2.*
