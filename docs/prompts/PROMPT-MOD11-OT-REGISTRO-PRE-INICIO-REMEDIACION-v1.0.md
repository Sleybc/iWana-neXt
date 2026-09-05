# PROMPT-MOD11-OT-REGISTRO-PRE-INICIO-REMEDIACION-v1.0

**Módulo:** MOD11 Ejecución operativa / órdenes de trabajo (+ drawer de OT en portal)
**Fase:** Remediación — registro pre-inicio habilitado en bloques 3/4/5 del drawer de OT
**Versión:** 1.0
**Fecha:** 2026-08-31
**Generado por:** AI-EM-ARCH (modo combinado Product Architect + Architect + Orchestrator)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*
**Agentes destinatarios:** AI-SR-FULL (backend), AI-FE-PLATFORM (portal), AI-SR-QA (verificación)
**Origen de la decisión:** sesión de análisis 2026-08-31 — veredicto de tres tracks (PROD-UX: defecto UX; FE-PLATFORM: inventario de gates; SR-FULL: comandos aceptan y persisten registro pre-inicio) aprobado por el solicitante en la misma sesión.

---

## 0. Modo, síntoma y causa raíz

**Modo:** Orchestrator + Architect (remediación de defecto de conformidad, no feature nueva).

**Regla de producto congelada por esta decisión (una sola regla mental):**

> **Nada se registra en la OT hasta pulsar "Iniciar ejecución".** Pre-inicio (CREATED/ASSIGNED/EN_ROUTE), los bloques Trabajo realizado, Equipos y materiales y Evidencia y conformidad son de solo lectura, con hint accionable. "Iniciar ejecución" es la única CTA destacada.

**Síntoma:** con la OT sin iniciar (p. ej. `ASSIGNED`), el drawer en `/dashboard/operations?executionOrderId=…` muestra los formularios de "Trabajo realizado", "Equipos y materiales" y "Evidencia y conformidad" totalmente operativos, mientras el bloque 2 (Checklist) aparece atenuado con el alert "Inicia la ejecución para habilitar el checklist".

**Causa raíz (verificada en código por tres tracks):**

1. **Backend:** `computeAllowedActions` entrega `START + REGISTER_ACTIVITY + REGISTER_ITEM_USAGE + REGISTER_EVIDENCE` en CREATED/ASSIGNED/EN_ROUTE (`apps/api/src/modules/tasks/services/execution-orders.service.ts:1862-1867`). Nacida en `8e853420` sin justificación registrada; describe un comportamiento preexistente, no una decisión de producto.
2. **Comandos:** `registerFieldWork` y `registerItemUsage` **aceptan y persisten** registro pre-inicio y además **auto-promueven silenciosamente** la OT a IN_PROGRESS (`:730-736`, `:869-875`) **sin emitir `ExecutionOrderStartedV1`** → la convergencia de proyecciones ADR-068 queda divergente (reconciliador espera SCHEDULED para CREATED/ASSIGNED/EN_ROUTE mientras la OT canónica ya está IN_PROGRESS) hasta el próximo evento (BLOCK/CLOSE). `registerEvidence` persiste pre-inicio sin promover (`assertMutable` `:1239`).
3. **Frontend:** solo el checklist tiene gate de fase (`isChecklistActive = hasStarted || terminal`, `ExecutionOrderDrawer.tsx:349`, atenuación `:907-908`); los bloques 3/4/5 montan sus formularios solo por `canInteract && canRegisterX` (`:1154`, `:1271`, `:1503`-1560) sin ningún gate visual pre-inicio.
4. **Conformidad:** la implementación contradice la spec congelada v1 — el contrato API ya declara la precondición "Registrar actividad: OT en progreso/bloqueada" (`docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md:112-113`).

**No es:** problema de autorización (`@Roles()`/guardas intactas), ni de offline-first (ADR-068 no incluye eventos de registro pre-inicio ni EN_ROUTE; §9 offline ya exige solo lectura sin conexión), ni caso de uso legítimo de pre-registro en EN_ROUTE (estado transitorio de coordinación, hoy inalcanzable por comando).

---

## 1. Contratos congelados y evento de re-sync

- **Contrato de API congelado (declaración §3.5):** `packages/shared/src/contracts/operations/execution-orders.ts` v1 — **no cambia de forma**. El enum `ExecutionOrderAllowedAction` y todos los DTOs permanecen idénticos. El cambio es de **distribución** de `allowedActions` por estado y de **precondición de comandos**, ambos alineados a la spec vigente.
- **Evento de re-sync declarado (ruta y versión):** esta decisión. Los tracks FE-PLATFORM y SR-QA corren contra el contrato resultante declarado en §4 de este prompt. No se espera el merge de backend para iniciar frontend; la fuente de verdad es este documento.
- **Nota de contrato v1.x (post-ejecución, owner AI-EM-ARCH):** documentar en el spec `2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md` la precondición de estado para `item-usage` y `evidence` (hoy no declarada) y el fin de la auto-promoción silenciosa. No es cambio de forma ni bump mayor.

**Requiere ADR:** No — conformidad con spec aprobada v1; no hay nuevo bounded context, stack ni boundary.
**Requiere CTO:** No — decisión de producto aprobada por el solicitante en sesión.
**Requiere SEC-ENG:** No — la superficie de autorización no cambia; el registro se restringe, nunca se ensancha.

---

## 2. Objetivo exacto

### Entra

1. **Backend (B1):** política `computeAllowedActions` → CREATED/ASSIGNED/EN_ROUTE entrega solo `['START']`; los tres comandos de registro rechazan pre-inicio con 409 y se elimina la auto-promoción silenciosa.
2. **Frontend (B2):** drawer con bloques 3/4/5 en modo lectura pre-inicio (hint con el patrón existente del checklist) y normalización de `hasStarted` para que EN_ROUTE cuente como pre-inicio.
3. **Tests (B3):** actualización de specs backend/frontend que fijan el comportamiento viejo + regresiones nuevas (409, sin auto-promoción, sin inputs pre-inicio).
4. **Informe de remediación** con evidencia de gates.

### No entra

- Cambiar paths, DTOs, enums, `@Roles()`, `@Permissions()` ni guardas.
- Cambiar `assertMutable` globalmente (los demás comandos conservan su semántica).
- Emitir eventos nuevos o modificar el catálogo de eventos ADR-068.
- Nuevos patrones visuales/tokens (se reutiliza el patrón del checklist → no activa carril de DS-OWNER).
- Cualquier forma de pre-registro o borrador pre-inicio (explícitamente rechazado en la decisión).
- Transiciones o estados nuevos (EN_ROUTE sigue sin comando que lo fije; se normaliza solo su lectura en cliente).
- Migraciones de base de datos (no hay cambio de schema).

---

## 3. Tracks y RACI

| Track | Agente | Alcance | No espera a |
| --- | --- | --- | --- |
| **Backend** | AI-SR-FULL | Política, guardas de comando, tests, OpenAPI (códigos 409), informe | Nadie |
| **Frontend** | AI-FE-PLATFORM | Drawer: hints pre-inicio, `hasStarted`, specs de drawer | Nadie (corre contra contrato declarado en §1) |
| **QA** | AI-SR-QA | Regresiones 409 + verificación de specs; E2E sin inputs pre-inicio si el costo es razonable | Entrega de B1/B2 para integración; specs unitarias en paralelo |

**Secuencia de cierre:** B1 y B2 en paralelo → integración → B3 → informe → review de AI-EM-ARCH.

---

## 4. Decisiones congeladas

### 4.1 Matriz de política resultante (técnico asignado o pool sin asignar)

| Estado | `allowedActions` (antes) | `allowedActions` (después) |
| --- | --- | --- |
| CREATED / ASSIGNED / EN_ROUTE | START, REGISTER_ACTIVITY, REGISTER_ITEM_USAGE, REGISTER_EVIDENCE | **START** |
| IN_PROGRESS | REGISTER_ACTIVITY, REGISTER_ITEM_USAGE, REGISTER_EVIDENCE, BLOCK, CLOSE | Sin cambio |
| BLOCKED | UNBLOCK | Sin cambio |
| Terminales | CREATE_FOLLOW_UP (solo supervisión) | Sin cambio |
| Supervisión (todos los estados) | Sin cambio | Sin cambio |

### 4.2 Precondición de comandos de registro

`registerFieldWork`, `registerItemUsage` y `registerEvidence` exigen `status ∈ {IN_PROGRESS, BLOCKED}`. Pre-inicio → `ConflictException` (HTTP 409) con código de error nuevo, p. ej. `EXECUTION_ORDER_NOT_STARTED`, y mensaje accionable en español ("Inicia la ejecución antes de registrar…"). La verificación de estado se hace en el handler del comando siguiendo el patrón existente de guardas; no se toca `assertMutable` global.

### 4.3 Auto-promoción

Se elimina la promoción CREATED/ASSIGNED → IN_PROGRESS dentro de `registerFieldWork` (`:730-736`) y `registerItemUsage` (`:869-875`). Con la guarda de 4.2 es código muerto; no debe quedar rama de auto-promoción ni test que la fije. La única vía de inicio es `start()` (idempotente, emite `ExecutionOrderStartedV1`). Sin eventos nuevos.

### 4.4 Frontend — estados pre-inicio del drawer

- Definición única de pre-inicio: `CREATED | ASSIGNED | EN_ROUTE`. Corregir `hasStarted` (`ExecutionOrderDrawer.tsx:345-348`) para excluir también EN_ROUTE (hoy lo cuenta como iniciado mientras START sigue ofertado — misma familia de defecto).
- Bloques 3/4/5 pre-inicio: lista en solo lectura (incluye estado vacío de primera vez) + `PortalAlert` `variant="info"` con copy del mismo vocabulario que el del checklist (p. ej. "Inicia la ejecución para registrar {trabajo realizado | equipos y materiales | evidencia}"). Los formularios se ocultan solos al estrecharse `allowedActions` — no duplicar el gate en cliente con lógica paralela de status.
- Bloque 2 (Checklist): conservar patrón vigente (alert + atenuación); con la corrección de `hasStarted` aplica también en EN_ROUTE.
- Sin cambios en el flujo offline ni en estados terminales.

---

## 5. Instrucciones para AI-SR-FULL (B1)

1. **Test primero.** En `apps/api/src/modules/tasks/tests/execution-orders.task3.spec.ts`: actualizar filas CREATED/ASSIGNED/EN_ROUTE del técnico asignado (`:132-145`), contratista (`:287-295`) y matriz 9 estados × roles (`:342-388`, aserción exacta `:486`) a la matriz de §4.1. Añadir specs: cada comando de registro con status CREATED/ASSIGNED/EN_ROUTE → 409 `EXECUTION_ORDER_NOT_STARTED`; con IN_PROGRESS y BLOCKED → 201/éxito; ninguna ruta de comando promueve estado fuera de `start()`.
2. Implementar la guarda de §4.2 en los tres comandos (controller `:272-284`, `:292-306`, `:421-433`; service `:703-764`, `:838-919`, `:1197-1339`) y eliminar las auto-promociones de §4.3. Verificar que `start()` interno (actividad 'START' opcional `:673-684`) no pasa por la guarda nueva.
3. Actualizar `execution-orders.service.spec.ts:509` (consumo exitoso en ASSIGNED hoy) al comportamiento nuevo, y cualquier spec de evidencia que registre pre-inicio.
4. OpenAPI: documentar 409 en los tres endpoints si sus decoradores enumeran códigos de error; sin cambio de forma de DTOs.
5. Verificar que los specs de convergencia de proyecciones (`execution-order-projection-convergence.service.ts:549-557`) siguen en verde: con la eliminación de la auto-promoción desaparece la divergencia; añadir si falta un test de "sin auto-promoción → sin divergencia".

## 6. Instrucciones para AI-FE-PLATFORM (B2)

1. Corregir `hasStarted` (`ExecutionOrderDrawer.tsx:345-348`) según §4.4.
2. Añadir el hint `PortalAlert` en los tres bloques pre-inicio con el vocabulario de §4.4 (sentence case, sin términos técnicos). Reutilizar el patrón del checklist; sin tokens ni componentes nuevos.
3. Actualizar `ExecutionOrderDrawer.spec.tsx`: fixture por defecto (`:35`, `:56-62`), `it.each(editableStatuses)` (`:213-219`, `:385-404`) — CREATED/ASSIGNED/EN_ROUTE esperan **sin** botones de registro **con** hint; IN_PROGRESS/BLOCKED siguen editables; extender el describe del checklist gate (`:1242-1294`) a EN_ROUTE. Los tests de Block 3/4/5 con IN_PROGRESS/terminal (`:491-530`, `:822-898`, `:903-961`) no deben cambiar.
4. Confirmar que ningún otro consumidor usa `canRegisterActivity/Items/Evidence` (inventario FE-PLATFORM: ninguno fuera del drawer).

## 7. Instrucciones para AI-SR-QA (B3)

1. Regresión API: matriz 409 por comando × estado pre-inicio; éxito en IN_PROGRESS/BLOCKED; sin `ExecutionOrderStartedV1` fuera de `start()`.
2. Portal: escenarios unitarios de §6; E2E opcional (Playwright web) del caso original: OT `ASSIGNED` abierta por query param `executionOrderId` → sin inputs ni botones de envío en bloques 3/4/5, hint visible, "Iniciar ejecución" como única CTA.
3. Matriz criterio↔test en el informe.

---

## 8. Restricciones no negociables

- Sin `any` explícito, sin promesas flotantes, TypeScript estricto, logs sin PII.
- Boundaries Modulith intactos; sin acceso directo a tablas de otro módulo.
- Multi-tenancy: sin hardcodear tenant/schema; `SET LOCAL search_path` por transacción.
- `allowedActions` sigue siendo ayuda de UI: la autoridad es la revalidación en cada comando (spec `:161`).
- Copys visibles en español, sentence case, vocabulario de producto (no "RBAC", no "endpoint", no "409").
- `pnpm` para todo el flujo; lint y typecheck en verde antes de entregar.

## 9. Entregables

- **Código:** backend (guardas + política), frontend (drawer), specs actualizados y nuevos.
- **OpenAPI:** códigos 409 documentados si aplica.
- **Informe:** `docs/informes/INFORME-MOD11-OT-REGISTRO-PRE-INICIO-REMEDIACION-v1.0.md` (precedente: `INFORME-MOD11-TASKS-RBAC-CATALOG-REMEDIACION-v1.0.md`) — síntoma, causa raíz, cambios archivo:línea, evidencia de tests, deuda residual (debe ser ninguna o declarada), impacted flows (saga MOD11–MOD12: `InventoryConsumptionRequestedV1` ya no se emite pre-inicio).
- **Contrato v1.x:** lo registra AI-EM-ARCH tras el merge (fuera de este prompt).

## 10. Criterios de aceptación

- CA-1: con OT en CREATED, ASSIGNED o EN_ROUTE, `GET` detalle entrega `allowedActions` sin `REGISTER_*` (solo `START` para técnico/pool; supervisión sin cambio).
- CA-2: `POST :id/field-work`, `POST :id/item-usage` y `POST :id/evidence` con OT pre-inicio responden 409 `EXECUTION_ORDER_NOT_STARTED`; con IN_PROGRESS y BLOCKED tienen éxito.
- CA-3: ningún comando de registro modifica `status` ni `startedAt`; `start()` es la única transición a IN_PROGRESS y emite `ExecutionOrderStartedV1`.
- CA-4: el drawer pre-inicio no renderiza inputs ni botones de envío en bloques 3/4/5; muestra hint informativo por bloque y conserva la lista en lectura.
- CA-5: el checklist permanece atenuado con hint en CREATED/ASSIGNED/EN_ROUTE (incluido EN_ROUTE tras la corrección de `hasStarted`).
- CA-6: specs de convergencia ADR-068 en verde; sin divergencia inducible por registro.
- CA-7: lint, typecheck y suites de tasks/portal en verde; sin cambio de forma en `@iwana/shared`.

## 11. Criterio stop/go

- **Detenerse inmediatamente si:** la eliminación de la auto-promoción rompe un flujo fuera del módulo tasks (worker, proyecciones, portal) no cubierto por esta decisión; o si aparece en código un consumidor de registro pre-inicio con justificación documentada vigente (spec o ADR aprobado) — documentar y escalar, no decidir en silencio.
- **Documentar causa en:** el informe de remediación, sección bloqueos.
- **Escalar a:** AI-EM-ARCH (`[BLOQUEO]`/`[CONSULTA]` bloqueante según protocolo §6.1).
- **Recomendación esperada:** opciones evaluadas (máx. 3) con postura del agente.

---

**Trazabilidad de la decisión:** sesión 2026-08-31, análisis con tracks PROD-UX / FE-PLATFORM / SR-FULL; aprobación del solicitante en la misma sesión. Evidencias citadas verificadas por los tracks: `execution-orders.service.ts:1862-1881, :703-764, :838-919, :1197-1339`; `ExecutionOrderDrawer.tsx:332-355, :898-908, :1154, :1271, :1503`; spec contrato `2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md:29, :112-113, :161`; ADR-068 `:65-79, :87`.
