# PROMPT-MOD05 — Consolidación del clúster D + E + F + U · Encargos por bloque

**Versión:** 1.0 · **Fecha:** 2026-10-31 · **Estado:** Vigente · **Emisor:** AI-EM-ARCH
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
**Plan:** [2026-10-31-mod05-consolidacion-cluster.md](../plans/2026-10-31-mod05-consolidacion-cluster.md) (bloques, matriz de skills y gates)
**Contratos de referencia:**
- D: [PRD Fase 09 v1.1](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md) y [ADR-102](../adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md).
- E: [plan](../plans/2026-10-30-mod05-cambio-plan-contrato.md) y [spec](../specs/2026-10-30-mod05-cambio-plan-contrato-ux.md).
- F: [informe v1.2](../informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.2.md).
- U: [addendum](../specs/2026-10-31-mod05-ficha-suscriptor-addendum-u.md).

## Reglas comunes

1. Lee `AGENTS.md`, el plan y tu sección. Lee los `SKILL.md` que el plan §2 te asigna **antes** de actuar.
2. Se trabaja en `main`, sin ramas. **Prohibido el staging parcial** (`git add -p`, `git apply --cached` y hunks editados) y **prohibido `git stash`**. Nada se descarta, revierte ni borra.
3. Nadie commitea salvo C1. Nadie edita fuera de su encargo mientras corre una ola (regla 7).
4. Solo `pnpm`. Las pruebas corren sin caché de turbo y con conteo real (`iwana-test-evidence`). Una integración `skipped` no cuenta.
5. **Conserva** los respaldos de R3-bis (`C:\Users\SLEYB\AppData\Local\Temp\claude\C--appiw\b60f3c31-486c-4691-a929-24e34eee366f\scratchpad\contracts.service.ts.pre-R3bis.bak`) y R3-ter (`C:\Users\SLEYB\AppData\Local\Temp\iwana-r3ter-contracts-service-spec-bcccd7038a0e4e8db5601e7515916ff4.bak`) hasta G6.5.
6. Ante un hallazgo que cambie alcance o contradiga un ADR: `[BLOQUEO]` y parar.

---

## Ola 1

### K1 · `sr-backend` — Fixture de RF-LC-17 y prueba real del control de versión

Base de diagnóstico ya verificada por `sr-backend` (systematic-debugging):
- el control de versión de E en `_transition` es correcto (plan E:32, spec E:56);
- el `TypeError` de RF-LC-17 sale del fixture, porque `Contract` se construye sin `updatedAt`;
- en producción no ocurre, porque `updated_at` es `NOT NULL` y `findOne` lo trae siempre.

1. En `apps/api/src/modules/crm/subscribers/tests/subscriber-lifecycle.service.postgres.integration.spec.ts`, después de `insertContract`, lee `SELECT updated_at AS "updatedAt" FROM <contracts> WHERE id = $1` y añádelo al `Contract` simulado. Así se replica `findOne`.
2. Añade una prueba **contra Postgres real** del camino de transiciones, en la integración de contratos o en la de ciclo de vida. Caso: `activate` con el `updatedAt` simulado desfasado un segundo. Debe dar 409 `CONTRACT_CHANGED`, dejar el contrato en `DRAFT` y no escribir auditoría. Cumple el «prueba real» del plan E:32.
3. **No toques código de producción.**

**Cierre:** las integraciones `subscriber-lifecycle…` y `contracts.service.postgres…` en verde, con conteo y 0 omisiones; RF-LC-17 incluido.

### K2 · `fe-platform` (portal) y `sr-backend` (api, shared y db, **después de K1**) — Solo formato

1. Lista los archivos TS/TSX modificados o sin seguimiento de `apps/portal`, `e2e`, `apps/api`, `packages/shared` y `packages/database` que no pasan `pnpm exec prettier --list-different`. Excluye `next-env.d.ts`.
2. Aplica `pnpm exec prettier --write` **solo** a esos archivos.
3. Verifica que el cambio que añade Prettier sea solo de formato: el multiconjunto de tokens no cambia (`git diff --word-diff` sin cambios de identificadores ni literales).
4. **Cierre:** lista de archivos formateados y typecheck de los paquetes afectados en 0.

## Ola 2 · Revisiones y gates, en paralelo (después de K1 y K2)

### R1 · `boundary-reviewer`

Solo lectura sobre el diff del clúster (`git diff HEAD` más los archivos sin seguimiento del clúster). Verifica:
- el modulith, sin entidades ni servicios ajenos importados;
- el tenancy;
- ADR-100 y ADR-093;
- CA-U-05 y CA-U-08 del addendum U;
- la guarda de versión de E en `_transition`, `update`, el punto de servicio y el soporte de estrato.

Hallazgos con `archivo:línea` y severidad P0–P3.

### R2 · `contract-drift-reviewer`

Solo lectura. Verifica:
- `@iwana/shared` (contrato 360°, `contract.schema.ts`, `billing-cycle.schema.ts`) contra productores (API) y consumidores (portal, `api-client.ts`);
- `confirmProfile` y el alias (CA-U-06);
- que no queden tipos duplicados a mano (RF-S404-50).

### R3 · `sec-eng`

Solo lectura. Revisa:
- `POST …/tax-profile/confirm` (CA-U-04): roles, permiso, auditoría en la transacción, PII en logs y guarda de titular bloqueado;
- `POST /crm/contracts/:id/plan-change`: concurrencia, roles y `GuardBlockedTitular`;
- la exposición de datos de la ficha nueva a cada rol.

Hallazgos P0–P3.

### R4 · `prod-ux` + `ds-owner`

Solo lectura. Revisan:
- **`ds-owner`:** `audit-ui.mjs` sobre los componentes de U-ficha y E (`ChangeContractPlanDialog`, `ContractDetailDrawer`, `ContractCard`, `ServiciosTab`, `SubscriberOverviewTab`, `TaxProfileBlock`), con 0 hallazgos (CA-U-01).
- **`prod-ux`:**
  - vocabulario visible con `system-vocabulary-review` (CA-U-02);
  - WCAG 2.1 AA de pestañas, regiones etiquetadas y foco (CA-U-03);
  - el diálogo de cambio de plan contra la spec de E.

Hallazgos con `archivo:línea`.

### G1 · `gate-verifier` — Gates completos sobre el árbol (Q3 del plan)

Sin caché de turbo y con conteo real:
1. Typecheck y lint de `@iwana/shared`, `@iwana/db`, `@iwana/api` y `@iwana/portal`.
2. Suites completas de los cuatro paquetes.
3. Integraciones Postgres **sin omisiones**, con `IWANA_DB_INTEGRATION_AVAILABLE=true` y `DB_NAME=dbiw`:
   - contratos, cambio de plan y ciclo de vida;
   - `subscriber-360-quotes` y `subscriber-birth-date`;
   - las migraciones 167 y 168.
4. E2E `portal-contract-plan-change.spec.ts` y `portal-crm-ciclo-facturacion-live.spec.ts` contra el entorno de desarrollo. Si no hay entorno: `NOT_EXECUTED` con causa.
5. `pnpm audit --prod --audit-level critical`.
6. Cobertura ≥80 % (líneas, ramas, funciones y sentencias) en `contracts.service.ts`, `subscribers.service.ts` y `subscriber-tax-profile.service.ts`.
7. `pnpm audit:adr-citations` y `pnpm audit:doc-locations` en 0 bloqueantes.

**Entrega:** `docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`, tras verificar que la ruta está libre, con la tabla de gates y la consolidación de los hallazgos de R1–R4 que le pasen.

### K3 · Dueño del área — Correcciones de hallazgos P0/P1

Solo si R1–R4 o G1 abren hallazgos P0 o P1. AI-EM-ARCH asigna cada hallazgo a su dueño (`sr-backend` o `fe-platform`) dentro del alcance documentado. Después de cada corrección se repite G1 completo.

## Ola 2b · K3 — Correcciones tras G1 (2026-10-31)

**Resultado de la Ola 2** ([informe](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md)): **NO-GO por tres P1 de R3**.
- Typecheck y lint en 0.
- Siete integraciones con 45 pruebas y 0 omisiones.
- Cobertura ≥80 % en los tres servicios.
- E2E en `NOT_EXECUTED` porque no había API ni portal levantados.

**Contraste de AI-EM-ARCH con `HEAD`:**
- **P1-1:** todo `SubscriberTaxController` ya estaba en `HEAD` sin `PermissionsGuard`; la ruta nueva `confirm` de U copió el patrón.
- **P1-3:** la 360° ya devolvía `habeasData` y `arcoRequests` con `CRM_SUBSCRIBERS_READ` en `HEAD`.
- **P1-2:** es nuevo de U.

Los tres se corrigen ahora: son de seguridad y privacidad, están en archivos del clúster y la Ley 2573 rige desde el 19 de noviembre. **No existe clave de permiso tributaria** en `AccessPermissionKey`.

### K3a · `sec-eng` — Matriz de permisos (solo lectura, primero)

1. Para cada ruta de `SubscriberTaxController` (GET del perfil, asignaciones, sugerencia de IVA y `confirm`), propone la clave de `AccessPermissionKey` que corresponde.
   - Preferencia: reutilizar `CRM_SUBSCRIBERS_READ` para lectura y `CRM_SUBSCRIBERS_MANAGE` para mutación, según ADR-083.
   - Comprueba en las migraciones semilla qué perfiles «Acceso estándar» tienen cada clave, en especial **Contable**, cuyo rol `ACCOUNTANT` usa hoy esas rutas.
   - Si la matriz exige una clave nueva o cambiar perfiles: `[BLOQUEO]` con la propuesta, porque necesita decisión del CTO y migración.
2. Para la 360°, define qué datos de privacidad exigen `PRIVACY_READ`: autorizaciones y solicitudes ARCO. Las marcas (`privacyMarks`) se conservan, porque las necesita la guarda de titular bloqueado. Indica qué perfiles tienen `PRIVACY_READ`.
3. **Entrega:** §K3a en el informe de consolidación, con la tabla ruta → clave → perfiles que la tienen y el impacto por rol.

### K3b · `sr-backend` — Correcciones de API (después de K3a)

Skills: `backend-security-coder`, `nestjs-expert`, `test-driven-development`, `iwana-test-evidence`.

1. **P1-1:** añade `PermissionsGuard` y `@Permissions(…)` a `SubscriberTaxController` según la matriz de K3a, sin cambiar los roles. Prueba HTTP de 403 por ruta.
2. **P1-2:**
   - `confirm` lleva `GuardBlockedTitular` (`params.subscriberId`; amplía `BlockedTitularResolver` solo si hace falta, con su prueba);
   - registra la confirmación con `AuditService.logWithin` **dentro** de su transacción, con la lista cerrada de campos y sin PII;
   - prueba de rollback si la auditoría falla.
3. **P1-3:** la 360° solo incluye `habeasData` y `arcoRequests` si el actor tiene `PRIVACY_READ`; si no, listas vacías y un indicador explícito en el contrato compartido (`privacyDetailsRestricted: boolean` en `Subscriber360Response`, en `@iwana/shared`). Pruebas por rol: con y sin el permiso.
4. **R1-P2, adaptador de settings:** `contracts-tenant-settings-read.adapter.ts` deja de depender del `TenantService` concreto y usa el port o la API pública del módulo Tenant que ya exista. Si no hay port, `[BLOQUEO]`.
5. **R1-P2, precisión de versión:** la comparación de `updated_at` en `assertContractVersionForSave` y en `changePlan` se hace con la misma precisión de milisegundos en SQL y en JS (`date_trunc('milliseconds', …)` o equivalente). Prueba con dos escrituras en el mismo milisegundo.
6. No cambies nada fuera de estos seis puntos. Sin stash ni commit.

### K3c · `fe-platform` — Portal (R4 en paralelo con K3b; el indicador P1-3 después de K3b)

Skills: `frontend-dev-guidelines`, `wcag-audit-patterns`, `system-vocabulary-review`, `core-components`.

1. **R4-P2:** al navegar desde una acción interna de «Vista general», el foco va al panel de la pestaña destino (`SubscriberOverviewTab.tsx:108`, `SubscriberTabsContainer.tsx:50`).
2. **R4-P2:** al activar un servicio, el foco va a la tarjeta del contrato activado o a su encabezado (`ActivateServiceDialog.tsx:72`, `ServiciosTab`).
3. **R4-P2:** la carga del perfil tributario anuncia su estado con una región `role="status"` (`TaxProfileBlock.tsx:547`).
4. **R4-P2:** `ChangeContractPlanDialog` nunca muestra el valor técnico de `technology`; sin etiqueta amigable, muestra «Tecnología no especificada» u omite el dato.
5. **R4-P3:** el selector precarga el plan vigente (spec E:22).
6. **P1-3, portal:** con `privacyDetailsRestricted`, la sección de privacidad de la ficha muestra que el rol no puede ver el detalle, sin errores ni listas vacías engañosas.
7. Pruebas de cada punto. Después, `audit-ui.mjs` en 0. Sin stash ni commit.

### K3d · `sr-qa` — E2E reales (después de K3b y K3c)

Skills: `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence`.

1. Levanta API y portal de desarrollo con los scripts del repo.
2. Ejecuta `e2e/tests/portal-contract-plan-change.spec.ts` y `e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts`, con conteo real.
3. Si falla, clasifica el fallo (regresión, flaky o entorno) con `e2e-triage` y no corrijas código de producto.
4. Usa un tenant de pruebas, nunca `tenant_iwana`.

**Después de K3:** se repite **G1 completo** (§G1), que actualiza el informe a v1.1.

## Ola 2c · K4 — Cierre de la auditoría de K3 (2026-11-01)

**Origen:** [auditoría del cierre de K3](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md) (GO condicionado, sin P0/P1). Contratos actualizados: [spec de ciclo v1.1](../specs/2026-10-30-mod05-ciclo-facturacion-ux.md) y [addendum U v1.1](../specs/2026-10-31-mod05-ficha-suscriptor-addendum-u.md).

**Orden:** K4a ∥ K4b ∥ K4c → K4d (después de K4a) → K4e (después de K4b y K4d) → G1. K4a y K4b tocan archivos disjuntos.

### K4a · `fe-platform` — Tarjeta de contrato

Skills: `frontend-dev-guidelines`, `core-components`, `wcag-audit-patterns`, `system-vocabulary-review`.

1. **H2b:** migra el menú de `ContractCard.tsx` a `DropdownMenu` de `@iwana/ui`, con el patrón de `SubscriberHeader.tsx:192`. Se retira el velo hecho a mano. Debe anunciar el estado expandido, cerrar con Escape y devolver el foco al disparador. «Activar» sigue fuera del menú, en el pie. Conserva el foco tras activar (K3c punto 2).
2. **H1:** el nombre accesible del disparador es `Acciones de ${serviceName}`, con respaldo «Acciones de este servicio».
3. **H3:** en servicios activos, «Ciclo: día {n}» y «Próximo corte: {fecha}» son dos datos con `DetailLine` (spec de ciclo v1.1 §3). Mientras carga el catálogo se muestra `PortalSkeletonBlock`. «Sin ciclo de facturación» queda como texto.
4. Actualiza `ContractCard.spec.tsx` por punto: teclado y Escape del menú, nombre accesible y dos datos de ciclo. Cierras con `audit-ui.mjs` en 0, typecheck del portal en 0 y la suite del portal con conteo real. No toques `e2e/`.

### K4b · `sr-backend` — Pruebas de la API (sin código de producción)

Skills: `test-driven-development`, `backend-security-coder`, `iwana-test-evidence`, `postgresql`.

1. **P2-1:** `subscriber-tax-confirm.postgres.integration.spec.ts` instala su propio esquema con `applyTenantMigrationsInOrder` y lo limpia en `afterAll`, como `subscriber-enum-parity`. Debe dejar de depender de `test-s2-live`.
   - Elimina la aserción vacua.
   - Añade una prueba con `AuditService` real: si la auditoría escribe y un fallo posterior hace rollback, no queda ni la confirmación ni la fila de auditoría.
2. **P2-2:** en `subscriber-tax.security.http.spec.ts`, añade por cada ruta de escritura (PUT, PATCH, POST y `confirm`) un caso con solo `CRM_SUBSCRIBERS_READ`, que debe dar 403.
3. **P3-3:** endurece las pruebas de cobertura de G1 en `contracts.service.spec.ts`:
   - verifica el orden que promete el nombre;
   - aserta `blockedServed` y el resultado de reactivar;
   - aserta la delegación de terminar y previsualizar.

   No bajes la cobertura de ningún servicio de 80 %.
4. **P3-4:** pruebas contra Postgres del avance de versión (+1 ms y estrictamente mayor) en el borrado de borradores (`subscriber-lifecycle.service.ts:289`) y en `crm-contract-impersonation.adapter.ts:106`.
5. Si una prueba nueva revela un defecto de producción: `[BLOQUEO]`, sin corregirlo. Cierras con typecheck de api en 0 y las suites tocadas con conteo real y 0 omisiones.

### K4c · `sec-eng` — Triage de R-ER (solo lectura)

Skills: `security-auditor`, `auth-implementation-patterns`.

1. Determina si, tras el borrado del titular, `GuardBlockedTitular` y `BlockedTitularResolver` rechazan toda mutación de sus contratos. Revisa las rutas de `contracts.controller.ts` y las de la ficha.
   - **Si las rechazan,** R-ER queda cerrado: la escritura de `titular-erasure-sql.ts:279` no puede competir con un cliente obsoleto.
   - **Si queda alguna ruta abierta:** `[BLOQUEO]` con la ruta, para una spec propia en el módulo de privacidad. No se amplía el clúster.
2. **Entrega:** §K4c en el informe de consolidación.

### K4d · `sr-qa` — E2E (después de K4a)

Skills: `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence`.

1. En `portal-crm-ciclo-facturacion-live.spec.ts`:
   - el comentario atribuye la activación desde el pie a la reubicación de U, no al velo;
   - el selector del menú usa `/Acciones de /`;
   - el ciclo se comprueba como dos textos: «Ciclo: día N» y «Próximo corte: …».
2. Ejecuta las dos E2E del clúster con conteo real, en tenant de pruebas (nunca `tenant_iwana`). Si fallan, clasifica con `e2e-triage` sin corregir producto.

### K4e · `test-change-reviewer` — Revisión de las specs de K4 (solo lectura)

Revisa cada spec que cambió en K4a, K4b y K4d contra su cambio de producción o contrato. Escribe §K4e en el informe. Un hallazgo C (regresión ocultada) bloquea G1.

**Después de K4:** se repite **G1 completo** (§G1).
- `gate-verifier` **no edita** pruebas ni código. Un gate rojo se reporta con su causa y vuelve al dueño.
- Si K4a, K4b y K4d llegan con evidencia fresca y nada más cambió, la repetición puede reutilizarla, declarando qué reutiliza.

### K4f · `sr-qa` — Repetir CA-CF-12 con worker (solo con autorización del usuario sobre la cola)

Skills: `e2e-testing-patterns`, `iwana-queue-inspect`, `iwana-test-evidence`.

1. Antes de tocar nada, inspecciona la cola de provisioning con `iwana-queue-inspect`. Registra los conteos por estado y el tenant del job en espera; es el sintético que el teardown marcó para eliminación.
2. Levanta el worker de desarrollo con el script del repo. No mueves, reintentas ni borras jobs a mano.
3. Cuando consuma el job pendiente:
   - comprueba que no quede esquema ni registro huérfano del tenant marcado;
   - si queda, lo limpia el teardown de la E2E, nunca un `DROP` manual fuera de él.
4. Repite `portal-crm-ciclo-facturacion-live.spec.ts` con conteo real, en tenant de pruebas (nunca `tenant_iwana`). Si falla, clasifica con `e2e-triage` sin corregir producto.
5. Vuelve a inspeccionar la cola al terminar.
6. **Entrega:** §K4f en el informe de consolidación, con colas antes y después, resultado de CA-CF-12 y estado final del gate 4. No repites el resto de G1: no cambió código desde §G1.

### C1a · `plat-ops` — Inventario de rutas (solo lectura, antes de commitear; 2026-11-01)

El árbol mezcla el clúster con trabajo ajeno: gobernanza de agentes y hooks, el informe y los prompts del checkpoint, y la spec DT-3 de privacidad. Antes del primer commit:

1. Clasifica **cada** ruta de `git status --short` en una sola categoría:
   - commit 1, 2, 3 o 4;
   - excluida por D-CK-2;
   - **ajena** (no se commitea en C1);
   - **dudosa**.
2. **Criterio de pertenencia:**
   - la ruta la creó o cambió D, E, F, U, K1–K4 o G1, según los informes y prompts del clúster;
   - o un archivo del clúster la importa o la ejecuta (por ejemplo `runner.ts` para `applyTenantMigrationsInOrder`, el port de settings del tenant para el adaptador de K3b, `portal-ui.tsx` y `api-client.ts` para U).

   Usa `git diff` y `grep` de importaciones como evidencia.
3. **Son ajenas en C1:**
   - `.agents/`, `.claude/`, `.codex/`, `.opencode/`, `AGENTS.md`, `docs/roles/` y `scripts/claude-hooks.test.mjs` (gobernanza; checkpoint propio);
   - el informe y los prompts de `TRANSVERSAL-CHECKPOINT-COMMITS`;
   - los cuatro documentos `privacy-dt3-*` / `PRIVACY-DT3-RER-*` (G0 pendiente);
   - los informes de otras iniciativas (`CLAUDE-CODE-AUTOMATIZACIONES`, `ROLES-ECOSISTEMA`, `SISTEMA-SKILLS`, `IVA-PUNTO-SERVICIO-T9`).
4. **Riesgo de dejar fuera una dependencia:** un archivo del clúster que importe una ruta ajena o dudosa hace que el commit no compile en CI. Toda dependencia de ese tipo pasa a dudosa.
5. **Entrega:** §C1a en el informe, con la tabla ruta → categoría → evidencia, los totales por categoría (deben sumar las rutas de `git status`) y la lista de dudosas. **Para ahí:** C1b solo arranca con la aprobación de AI-EM-ARCH.

### C1b · `plat-ops` — Commits (después de aprobar C1a)

**Condiciones añadidas el 2026-11-01, por la separación E7 de C1a.** C1a apartó los cambios DT-3/B1 de 9 archivos del clúster con snapshots. Esa separación no estaba en su encargo de solo lectura.

1. **Antes de `git add`:**
   - registra en §C1b del informe la ruta absoluta de las copias originales, del manifest y de los dos patches B1;
   - nada se borra hasta que la Fase 2 de DT-3 esté commiteada.
2. **Evidencia sobre el árbol separado, porque estos 9 archivos ya no son los que verificaron G1 y K4f:**
   - typecheck de api, db y shared;
   - suites unitarias completas de api y db sin caché;
   - las integraciones Postgres de §G1 punto 3 (contratos, cambio de plan, ciclo de vida, 360 cotizaciones, fecha de nacimiento, 167 y 168).

   Todo con conteo real y 0 omisiones. Si algo falla, `[BLOQUEO]` y no commitees.
3. Commits 1–4 según la Ola 3.
4. **Después del último commit:**
   - aplica los dos patches B1 con `git apply` (no `--cached`);
   - comprueba que el hash de cada uno de los 9 archivos coincide con el del original del manifest;
   - `git status` debe mostrar como modificadas solo las rutas ajenas y DT-3.

   Si un hash no coincide: `[BLOQUEO]` y restaura desde la copia original.
5. Sin push.

Sigue los puntos 1–6 de la Ola 3 con la lista aprobada en C1a. En el punto 1.4, docs, entran también la spec de ciclo v1.1 y los lanzadores v1.0–v1.4 de la consolidación.

## Ola 3 · C1 · `plat-ops` — Commits por archivo completo (después de Q2 y Q3 en GO)

1. **Commits en este orden**, todos con archivos completos. Solo el estado final queda verificado por G1, y se publican juntos:
   1. `feat(db,shared): billing cycles, plan change and 360 read contracts`: `packages/database` y `packages/shared` del clúster;
   2. `feat(api): MOD05 billing cycle, plan change, 360 quotes and tax confirmation`: `apps/api` del clúster;
   3. `feat(portal): MOD05 subscriber sheet, billing cycle and plan change`: `apps/portal` y `e2e` del clúster;
   4. `docs(mod05): consolidate D, E, F and U`: planes, prompts, lanzadores, specs, informes y addendum de D, E, F y U, este plan y prompt, y el informe de consolidación.
2. **Antes de cada commit:** `git diff --cached --name-only` = lista prevista, y `git diff -- <archivos del commit>` vacío, es decir, índice = árbol.
3. Después de cada commit, comprueba que lint-staged no cambió contenido (`git show --stat` coincide con lo previsto). Si cambió: `[BLOQUEO]`.
4. **Fuera de los commits (D-CK-2):** `.tmp-plan-change-tests.json`, los dos `next-env.d.ts`, los 8 PNG de `portal-commercial-ui-2026-07-11/`, `.claude/launch.json` y `docs/informes/evidence/mod05-plan-change-2026-10-30/**`.
5. **Sin push.** F3 y G6.5 requieren orden expresa del CTO.
6. **Cierre:** añade §C1 al informe de consolidación con SHA, rutas por commit y lo que queda sin commitear.

## Ola 4 · Consolidación conjunta con DT-3 (opción A, decisión del usuario del 2026-11-01)

**Origen:** [dictamen tras el bloqueo de C1b](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md). Se abandona la separación E7: el clúster y DT-3 se verifican y commitean juntos, por archivo completo. C1b queda anulado.

**Orden:**
1. **C4a.**
2. **En paralelo:** C4b, C4c y la Ola 2-R de DT-3 (B3-R → B3 → B4, prompt DT-3).
3. **C4d.**
4. **G0 del CTO sobre la spec DT-3.**
5. **C4e.**

**Precondición de entorno:** Docker Desktop y Postgres (`127.0.0.1:5433`) en marcha antes de C4a. Si no lo están: `[BLOQUEO]` de entorno, sin seguir.

### C4a · `plat-ops` — Restaurar B1 sobre el árbol actual

Skills: `verification-before-completion`, `iwana-checkpoint-commit`.

1. Para los 7 archivos de producción y las 2 specs separadas, el destino es el original de `mixed/` y `mixed-specs/`, con una sola excepción: `subscribers.service.ts` conserva además el cambio de boundary de C1b (`CrmQuoteReadPort`).
2. **Aplica los cambios.**
   - Para los 8 archivos sin conflicto: aplica el patch del harness, que pasa `--check`, y repón el resto con `restore-exact-mixed-snapshots.ps1` o `restore-exact-mixed-specs.ps1`.
   - Para `subscribers.service.ts`: adapta solo el hunk de la línea 95 del patch principal y guarda el patch adaptado junto al original, sin sobrescribirlo.
   - No edites nada a mano fuera de ese hunk.
3. **Verifica.**
   - Hash de los 8 archivos igual al `mixed_sha256` del manifest.
   - `diff` de `subscribers.service.ts` contra su original de `mixed/` limitado al cambio de port.
   - Typecheck de api, db y shared en 0.
4. **Entrega:** §C4a en el informe, con hashes, el diff de `subscribers.service.ts` y la ruta del patch adaptado. Sin stash, sin `git add`, sin commit.

### C4a-R · `plat-ops` — Restaurar B1 desde archivos resueltos (sustituye a los patches; 2026-11-01)

**Causa raíz del bloqueo de C4a,** analizada por AI-EM-ARCH:
- El snapshot limpio de `subscribers.service.ts` que generó C1a no estaba normalizado con Prettier. Al quitar la indentación de B1, la asignación de `birthDate` quedó en dos líneas.
- El cierre del boundary en C1b reformateó el archivo, y esa línea quedó en una sola. El contexto del patch B1 dejó de coincidir cerca de la línea 1001.
- Con las tres versiones normalizadas, la fusión a tres bandas (`git merge-file`) da **un solo conflicto real**: los imports. Se resuelve conservando `CrmQuoteReadPort` y `titularAnonymizedConflict`, y quitando `Quote`.
- Comprobado: el resuelto difiere de `mixed` solo en el cambio de boundary, y del árbol solo en los hunks B1 (330 líneas en ambos sentidos). Prettier es estable sobre él.

**Lección:** un patch de restauración solo sirve si nada vuelve a formatear el árbol mientras tanto. Toda restauración se hace por **archivo completo verificado por hash**, nunca por patch con contexto.

1. Precondición: Docker y Postgres en marcha, índice vacío, sin stash.
2. **Restaura por copia de archivo completo,** sin `git apply`.
   - Los 6 archivos de producción sin conflicto y las 2 specs, desde `mixed/` y `mixed-specs/`. Para cada uno, el hash final debe ser igual a `mixed_sha256` de su manifest.
   - `subscribers.service.ts`, desde `resolved-c4a/apps/api/src/modules/crm/subscribers/subscribers.service.ts`. Hash final: `cd2d946637125919d657185002a167b4903d22e95e37f369aa0d000bfac09167` (`resolved-c4a/SHA256SUMS.txt`).
3. **Verifica.**
   - Los 9 hashes.
   - `pnpm exec prettier --check` sobre los 9 archivos.
   - Typecheck de api, db y shared con `--force`, en 0.
   - Suites unitarias completas de api y db sin caché, con conteo real. Se esperan en verde, porque las specs de DT-3 vuelven a tener su código. Si hay un fallo: `[BLOQUEO]` con la lista, sin corregir.
4. **Entrega:** §C4a-R en el informe. No borres `mixed/`, `mixed-specs/` ni `resolved-c4a/` hasta G6.5. Sin `git add` ni commit.

### C4b · `boundary-reviewer` + `test-change-reviewer` — Revisar el cambio de boundary de C1b (solo lectura)

1. **`boundary-reviewer`:**
   - `CrmQuoteReadPort`, su adapter en `QuotesModule` y las importaciones de `ExpedientesModule` y `SubscribersModule`;
   - sin ciclos de módulos;
   - proyección sin `planSnapshotJson`;
   - port en `crm/ports/`.
2. **`test-change-reviewer`:** `crm-quote-read.adapter.spec.ts` y cualquier spec de 360° o de suscriptores cambiada en C1b.
3. **Entrega:** §C4b en el informe. Un P0/P1 o un hallazgo C bloquea C4d.

### C4c · `sr-qa` — Triage de `TaskIntakeClient.spec.tsx` (solo lectura)

Clasifica el fallo («Laura Ruiz» no encontrada) como regresión, flaky, datos o fecha, o entorno, con `e2e-triage` como guía. Identifica qué cambio lo provoca (`git log` y `git diff` del componente y su spec) y si pertenece al clúster, a DT-3 o a otra iniciativa. No corriges nada. **Entrega:** §C4c en el informe.

### C4d · `gate-verifier` — G1 conjunto (después de C4b, C4c y B4 de DT-3 en GO)

Es G1 completo (§G1) sobre el árbol entero, ampliado con los gates de DT-3:
- typecheck y lint de los cuatro paquetes;
- suites completas de shared, db, api y portal sin caché;
- integraciones de §G1 punto 3, más las de DT-3: migración 169, `titular-anonymized-concurrency`, `titular-erasure-sql`, `responsibilities` y `anonymize-titular`;
- las dos E2E del clúster, más CA-RER-12;
- cobertura por servicio ≥80 % y no por debajo de la línea base de G1 (`contracts` 82,82 %, `subscribers` 86,20 % y `subscriber-tax-profile` 82,89 % de ramas);
- `pnpm audit --prod --audit-level critical` y auditorías documentales.

Si C4c dejó un fallo ajeno al clúster y a DT-3, se registra con su causa y lo decide AI-EM-ARCH. `gate-verifier` no edita nada. **Entrega:** §C4d en el informe.

### C4e · `plat-ops` — Commits (después de C4d en GO y del G0 de DT-3)

0. **Limpieza autorizada por el usuario el 2026-11-01**, con C4d ya cerrado. Se borra solo el esquema efímero `tenant_plan_change_f0f328f25d1d4ae6a251d29566d0c800` de `dbiw`, y antes se comprueba que:
   - el nombre coincide exactamente;
   - no es `tenant_iwana`;
   - ninguna fila de `public.tenants` lo referencia.

   Registra el resultado en §C4e. Cualquier otro esquema queda fuera de este permiso.
1. **Re-inventario:** cada ruta de `git status --short` se clasifica en uno de cinco commits, o como excluida D-CK-2 o ajena (gobernanza, checkpoint y otras iniciativas, como en C1a). Las dudosas se escalan.
   1. `feat(db,shared): billing cycles, plan change, 360 contracts and anonymized-titular guard (169)`;
   2. `feat(api): MOD05 cluster and DT-3 anonymized-titular mutations`. El cuerpo declara los dos alcances y los archivos mezclados;
   3. `feat(portal): MOD05 subscriber sheet, billing cycle and plan change`, con `e2e`;
   4. `docs(mod05): consolidate D, E, F and U`;
   5. `docs(privacy): DT-3 anonymized-titular mutations`, con spec, plan, prompts, lanzadores e informes DT-3.
2. Aplica los puntos 2–4 de la Ola 3: índice igual al árbol en cada commit, lint-staged sin cambios de contenido y exclusiones D-CK-2.
3. **Sin push.** F3 y G6.5 necesitan la orden del CTO.
4. **Entrega:** §C4e en el informe, con SHA y rutas por commit.
