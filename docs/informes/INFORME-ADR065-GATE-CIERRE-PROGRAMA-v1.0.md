# INFORME-ADR065-GATE-CIERRE-PROGRAMA-v1.0

**Programa:** ADR-065 (Olas 0-7) + hotfix DEF-2
**Fase:** Gate de cierre
**Modo:** AI-EM-ARCH Orchestrator · protocolo multiagente
**Fecha:** 2026-07-25
**Auditores:** AI-SR-QA (calidad) · AI-SEC-ENG (seguridad) · AI-EM-ARCH (verificación propia)
**ADR:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) v1.1 (Aprobado CTO 2026-07-24) · [ADR-066](../adrs/ADR-066-Migraciones-No-Transaccionales-Runner.md)
**Consolidado que este informe corrige:** [INFORME-ADR065-SESION-CONSOLIDACION-2026-07-25-v1.0](./INFORME-ADR065-SESION-CONSOLIDACION-2026-07-25-v1.0.md)

---

## Veredicto

# NO-GO para cierre del programa

| Auditor | Veredicto |
| --- | --- |
| AI-SR-QA | **NO-GO** — P0 funcional abierto · suite roja en 2 de 6 paquetes · `pnpm lint` rojo |
| AI-SEC-ENG | **GO-CON-DEUDA** — sin crítico, sin ruptura de aislamiento, sin inyección; S-1 como condición de cierre |
| AI-EM-ARCH | **NO-GO** — se adopta el veredicto de SR-QA; el P0 y la CI roja son gates duros de `AGENTS.md` |

El **patrón de paginación numerada es sólido y está bien construido**. Lo que no está listo es el cierre.

---

## Verificación propia de AI-EM-ARCH

Confirmado directamente, sin intermediación de informes:

| Verificación | Resultado |
| --- | --- |
| `pnpm typecheck` (monorepo) | **Limpio**, exit 0 |
| `pnpm lint` | **ROJO** — 6 errores, `@iwana/portal#lint` exit 1, 7 de 8 tareas OK |
| Bloqueantes DEF-2 (H-1, H-2, H-3) | **Cerrados** — filtro SLA al `WHERE` con test; `CrmListLimitPipe`; `tenant.service.ts:269` usa `clampPage` |
| DoD de deduplicación | **Cumplido** — `encodePayload` en un solo sitio (`common/pagination/cursor-codec.ts`); las tres utilidades duplicadas retiradas |
| 9 endpoints sin cota (ADR-064 §8) | **Cerrados** — los 7 verificados tienen `take`/`limit` y emiten meta |
| Invariante de pie único | **Correcto** — es un switch por `randomAccess`, no dos pies montados (`AssuranceTicketsTable.tsx:358-381`) |
| P0 de auditoría (H-1 de SR-QA) | **CONFIRMADO** — ver abajo |

### El P0, verificado con la prueba más contundente

`audit-query.service.ts` contiene **el uso correcto y el roto del mismo helper**:

- `:165-166` → `where['createdAt'] = createdAt` — correcto: `buildCreatedAtFilter` devuelve `FindOperator<Date>` (`Between` / `MoreThanOrEqual` / `LessThanOrEqual`), válido dentro de un objeto `where`.
- `:61-64` → `qb.andWhere('audit.createdAt = :createdAt', { createdAt })` — **roto**: enlaza el `FindOperator` como parámetro escalar de una igualdad. El rango se destruye en silencio.

Que ambos convivan en el archivo prueba que es un error del refactor DEF-3, no una decisión de diseño. Afecta cuatro rutas —datos y conteo, tenant y plataforma— sobre **superficie de cumplimiento**.

**Agravante:** `audit-query.service.spec.ts:163-174` asserta la forma incorrecta con `expect.anything()`, que acepta el `FindOperator`. El test se escribió contra la implementación, no contra el requisito, y por eso el módulo aparece verde.

---

## Corrección al registro del programa

Dos afirmaciones de informes previos no se sostienen contra este árbol:

1. **`INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.5.md:43-46`** declara `pnpm lint` verde 8/8 y `pnpm test` verde 9/9. **No es reproducible:** lint está rojo y dos paquetes están rojos. Los conteos de suites tampoco coinciden, así que la corrida citada no fue sobre este árbol. La Ola 1 quedó cerrada **como contenido**; el gate se firmó sobre una foto de compuertas que este árbol no reproduce.
2. **R-10 (lint) y R-14 (estabilidad de tests)**, declarados cerrados en v1.5, **están de vuelta**: los 6 errores de lint son directivas que citan `react-hooks/exhaustive-deps`, regla que la config del portal no carga; y bajo carga paralela aparecen fallos por timeout que desaparecen en aislamiento — incluido `SchedulingClient.spec`, que `INFORME-ADR065-OLA7-ENVELOPE-HOLD-CLOSE-v1.0.md:53` declara PASS.

### Corrección a mi propio reporte

Informé que 4 servicios publicaban `sortableFields` poblado y 20 vacío. **Era inexacto:** los cuatro son `const SORTABLE_FIELDS: string[] = []`. Ningún endpoint del programa ofrece una sola columna ordenable. Ambos auditores lo confirman por separado (S-5, CA-ORD-01).

---

## Estado ejecutable

| Compuerta | Resultado |
| --- | --- |
| `@iwana/api` test | **ROJO** — 1 suite / 1 test (aislado); 3 suites / 5 tests bajo carga |
| `@iwana/portal` test | **ROJO** — 1 suite / 3 tests (aislado); 4 suites / 6 tests bajo carga |
| `@iwana/web` test | Verde — 19/19 suites, 76/76 tests |
| `pnpm lint` | **ROJO** — 6 errores + 1 warning |
| `pnpm typecheck` | Verde |
| `build` portal y web (producción) | **Verde** — stop/go de la Ola 3 (`<Suspense>`) satisfecho |
| E2E portal — spec del pager | Verde aislado (2,8 s) |
| E2E portal — suite completa | **No concluyó** (>35 min, abortada) — el conjunto es hoy inauditable |
| E2E web | **ROJO** — 1 pasado, 5 fallidos (3 son el P0) |

`.github/workflows/ci.yml:122-123` ejecuta `pnpm test` sin `continue-on-error`: **la CI entra en rojo por dos vías**.

---

## Hallazgos bloqueantes

### B-1 · P0 · Filtro de rango de fechas de auditoría roto

`audit-query.service.ts:61-64` y `platform-audit.service.ts:92`, `:118`. Ver verificación arriba. Confirmado por `e2e/tests/web-audit-logs-datepicker.spec.ts` (3 fallos).

**Cierre:** corregir los 4 sitios y **reescribir** los specs para asertar el rango, no la forma.

### B-2 · P1 · Suite y lint rojos ⇒ CI roja

Seis errores de lint por directivas que citan una regla no cargada (`react-hooks/exhaustive-deps`) en `CommercialInterestSection.tsx`, `InventoryClient.tsx`, `StockByProductTable.tsx`, `StockIssueComposer.tsx`; un warning en `portal-ui.tsx:923`, dentro de `PortalPageSizeSelect`. Más: doble de prueba obsoleto en `purchasing.http.integration.spec.ts:553` (le falta `skip` al QB falso y sigue asertando array plano frente al envelope nuevo) y 3 fallos de `InventoryClient.spec.tsx` provocados por B-3.

### B-3 · P1 · Búsqueda acoplada a la URL sin borrador ni debounce

`PurchaseRequestsToolbar.tsx:199`, `StockIssuesToolbar.tsx:126`, `StockKardexPanel.tsx:232`. Cada pulsación dispara `router.replace` **y** una petición. El piloto lo resolvió bien (`SubscribersListClient.tsx:126-151`, `searchDraft` + debounce) y `SuppliersPanel.tsx:79-86` también; estas tres no. Es la causa de los 3 fallos de `InventoryClient.spec.tsx`.

**Se corrige el producto, no el test.**

---

## Hallazgos de seguridad (AI-SEC-ENG)

Residuales del NO-GO previo: **H-4, H-5 y H-6 cerrados y verificados en código.**

| # | Sev. | Hallazgo |
| --- | --- | --- |
| **S-1** | **Alta** | **El amplificador de H-1 sobrevive.** `expediente.service.ts:666-668` mantiene el `Promise.all` sobre la página, y `CompletenessCalculator` abre **tres** conexiones por fila (`:59`, `:72`, `:87`). Con `limit=100`: **300 adquisiciones concurrentes** contra `DB_POOL_MAX` default **10** (`data-source.ts:151`). El clamp bajó la magnitud de ~20.000 a ~300, no eliminó el fan-out. Misma clase de vector que el programa vino a cerrar. **Condición de cierre del programa, no de merge.** |
| **S-2** | Media | `responsibilities.controller.ts:75-76` sin pipes CRM; el servicio llama solo a `clampPage`, nunca a `clampLimit` → `?limit=10000` con `page=1` **pasa**. Último sitio de CRM con el patrón de H-1. |
| **S-3** | Media | `subscribers.service.ts:326` descifra PII por fila y el controlador reincorpora documento, correo y teléfono. ~100 peticiones entregan 10.000 registros personales completos a cinco roles. **Contraste revelador:** `expediente.service.ts:678-683` anula explícitamente las columnas cifradas. Dos listados del mismo módulo con políticas de minimización opuestas. Requiere decisión de producto. Detalle de Ley 1581: **requiere verificación con fuente oficial**. |
| **S-4** | Media | `089_pagination_ordering_indexes.ts:52` es `transactional = false` con `CREATE INDEX CONCURRENTLY IF NOT EXISTS`. Si un build falla, el índice queda **INVALID**; el runner no registra el paso y al reintentar el `IF NOT EXISTS` lo ve como existente y lo omite. El índice queda inválido de forma permanente, el planner lo ignora, y ese tenant reabre el vector de agotamiento **en silencio**: los datos siguen correctos, así que ninguna prueba funcional lo detecta. Además, la excepción detiene el bucle y los tenants posteriores no reciben `089`. |
| **S-5** | Baja | `sortBy` es superficie **inerte pero fail-closed**: `apply-sort.ts:34` valida contra la lista blanca antes de construir el identificador, y las cuatro listas están vacías → cero superficie de inyección. Los controladores anuncian `sortBy` en OpenAPI mientras `meta.sort` devuelve siempre `null`: deuda de honestidad de contrato. |

Verificado sin hallazgo: multi-tenancy intacto (`runInTenantSchema` sin cambios, `COUNT` y página en la misma transacción), el `total` de plataforma no puede llegar al portal (`PlatformOnlyGuard`), sin PII en logs nuevos, cursores sin datos personales, `ORDER BY` dinámico solo en `apply-sort.ts`.

---

## Brechas entre lo normado y lo entregado

| # | Sev. | Brecha |
| --- | --- | --- |
| **G-1** | P2 | **La clasificación feed/directorio nunca se aplicó.** Ningún endpoint emite `randomAccess: false`; los 6 `buildCursorMeta` pasan `true` explícitamente, así que el default `false` nunca se ejerce. Cuatro superficies que la spec §2 nombra candidatas a feed —kárdex, bajas, salidas, alertas de vida útil— recibieron pager de directorio. La variante feed (v2-10…13) solo existe en tests con mocks imposibles en producción. **La decisión que el ADR delegaba al backend no se tomó.** |
| **G-2** | P2 | **Orden por columna inerte.** Las 4 listas blancas vacías; `PortalDataTableSortableHead` adoptado solo en el piloto. El ADR v1.1 lo hizo default universal. |
| **G-3** | P2 | **v2-08 violado: doble conteo** en 5 superficies de inventario (`AssetsWorkspace:202`, `PurchaseWorkspace:646`, `StockCountsWorkspace:602`, `StockIssuesWorkspace:403`, `SuppliersPanel:265`). Strip y pager pintan el total simultáneamente, anulando la mitigación de R4. Además el strip usa raya y omite «Mostrando», contra el copy congelado → R2, dos gramáticas conviviendo. El primitive sí cumple (`formatPagerCount`). |
| **G-4** | P2 | **CA-ORD-12 incumplido en el kárdex.** `stock-movement-query.service.ts:114` ordena por `(created_at DESC, movement_number DESC)` — único de 29 servicios sin desempate por `id`. `movement_number` **no es único**: sin índice único y generado con leer-máximo-e-incrementar sin bloqueo (`stock-ledger.service.ts:1318-1333`). Orden total inestable → filas repetidas u omitidas. Arista de integridad de datos más allá de paginación. |
| **G-5** | P2 | **Alcance menor que el declarado:** 13 superficies con pager frente a 26 que siguen en «Cargar más». Entre las no migradas, **`UsersTable.tsx` — el caso que la spec §1 usa como motivación literal del ADR**. El defecto que justificó el programa no está corregido en su propia superficie de ejemplo. Tampoco `PlanCatalogPanel` ni `TaxCatalogManager`. |
| **G-6** | P2 | **DEF-2: los cinco casos solo existen en el spec del helper.** La cota de offset se ejerce en **1 de 29** endpoints; los dos tests HTTP asertan el DTO, no el clamp — seguirían verdes si `clampPage` se borrara. Los casos 1, 3 y 4 sin cobertura de endpoint en ninguna capa. **Esta era la deuda de auditoría que este gate venía a cerrar; queda abierta.** |
| **G-7** | P2 | **v2-25 y v2-34 no verificables.** En jsdom, deshabilitar el botón enfocado no lo desenfoca, así que un test unitario pasa siempre y no detecta la caída al `<body>` que sí ocurre en navegador. `@axe-core/playwright` ya está instalado y en uso, pero nadie lo apuntó a una tabla paginada. La lógica del primitive es correcta (`pendingFocusRef` + `useLayoutEffect`); falta la prueba. |
| **G-8** | P3 | v2-32 parcial: `parsePositiveInt` normaliza a 1 pero **no corrige la URL** — `?page=0` persiste en la barra. |
| **G-9** | P3 | Sin enforcement de cobertura: ningún paquete corre `--coverage`; el gate «≥80 % core» de `AGENTS.md` **no es medible hoy**. |

---

## Lo que sí quedó bien hecho

Registrarlo importa tanto como los hallazgos:

- **Infraestructura de estado en URL correcta y verificada:** v2-20 a v2-24, v2-26, v2-27, v2-31, v2-33, v2-28/29/30 cumplen, con `push` para página y `replace` para filtros exactamente como se normó.
- **`PortalTablePager` bien construido:** copy, singular/plural, página única, estimado, targets de 44 px, `aria-live` único, gestión de foco con `pendingFocusRef`.
- **`PortalDataTableSortableHead` implementado por encima de lo declarado:** el ciclo de tres estados existe (`portal-ui.tsx:108-119`) aunque los informes lo daban por diferido, y `aria-sort` es estructuralmente único por construcción.
- **Deduplicación real:** un solo `encodePayload` en el Modulith.
- **Los 9 endpoints de ADR-064 §8, cerrados.**
- **Postura de seguridad materialmente mejor** que en el gate de DEF-2: sin crítico, sin ruptura de aislamiento, sin inyección.
- **Builds de producción verdes**, incluido el stop/go de `<Suspense>` de la Ola 3.

---

## Condiciones para levantar el NO-GO

Bloqueantes:

1. **B-1** — corregir los 4 sitios del filtro de fechas y reescribir los specs para asertar el rango.
2. **B-2** — lint verde (retirar las directivas inválidas o cargar `eslint-plugin-react-hooks` en `packages/config`), doble de prueba de `purchasing.http.integration.spec.ts` completo y migrado al envelope.
3. **B-3** — borrador local + debounce en las 3 toolbars, como el piloto. Corregir el producto, no los tests.
4. **G-3** — el strip cede el conteo donde hay pager; unificar el copy.
5. **G-4** — índice único sobre `(tenant_id, movement_number)` con generación segura, o desempate por `id`.
6. **G-1** — decisión explícita de `randomAccess` por recurso. Hoy la spec §2 no está implementada.
7. **S-4** — eliminar índices inválidos antes de cada `CREATE` y verificación post-migración, **antes del primer despliegue de `089` a un tenant con volumen**.
8. **G-6** — cobertura de endpoint de los 5 casos DEF-2 en 2-3 endpoints representativos, contra el clamp.
9. **G-7** — un E2E con `@axe-core/playwright` y assertion de `document.activeElement` sobre una tabla paginada.
10. Diagnosticar por qué la suite E2E del portal no termina; hoy el conjunto es inauditable.

Condición de cierre del programa, no de merge:

11. **S-1** — cerrar el fan-out de `CompletenessCalculator`. Declarar el programa cerrado dejándolo abierto sería declarar cumplido un objetivo que no lo está. AI-SEC-ENG **no aprueba excepción**: aceptarlo como riesgo residual permanente es decisión del CTO.

Requiere decisión antes de tocar código:

12. **S-3** — postura de producto sobre la proyección de PII en el listado de suscriptores.
13. **G-2** — o se pueblan las listas blancas y se adopta el orden, o se enmienda ADR-065 para que la norma diga lo que el producto hace. **No puede quedar la contradicción vigente.**

---

## Decisiones del CTO sobre este gate (2026-07-25)

| # | Asunto | Decisión | Efecto |
| --- | --- | --- | --- |
| 1 | **S-3 · proyección de PII en el listado de suscriptores** | **Se modifica la política, no la proyección.** Documento, correo y teléfono son necesarios para el funcionamiento operativo | Recogida en [ADR-067](../adrs/ADR-067-Proyeccion-PII-Listados-Operativos.md) (Aprobado): finalidad declarada por campo, registro de acceso masivo, cota sin relajar, y la divergencia con expedientes declarada **intencional**. S-3 queda **cerrado como decisión documentada**, no como riesgo aceptado en silencio |
| 2 | **S-1 · fan-out de `CompletenessCalculator`** | **Se corrige.** Sin excepción de seguridad | Entra en la remediación como A2. AI-SEC-ENG no aprobaba excepción y no fue necesaria |
| 3 | **G-2 · orden por columna inerte** | **Aprobada la recomendación de AI-EM-ARCH** (2026-07-25) | **ADR-065 v1.2 §22-bis** (Aprobado): `sortableFields: []` es **estado conforme, no deuda**; prohibido publicar sin medir; un endpoint con lista vacía **no anuncia `sortBy` en OpenAPI** (cierra la deuda de contrato de S-5); el primitive permanece; el primer tramo de hasta 3 columnas se autoriza con la tabla de p95 a la vista. G-2 **deja de ser brecha**: la norma ahora describe lo que el producto hace, y la medición queda como entregable con dueño |

**Remediación:** [`PROMPT-ADR065-REMEDIACION-CIERRE-v1.0.md`](../prompts/PROMPT-ADR065-REMEDIACION-CIERRE-v1.0.md) — partes A (SR-FULL), B (FE-PLATFORM), C (PLAT-OPS) y gate de SR-QA.

### Recomendación de secuencia (AI-EM-ARCH)

1. **B-1, B-2, B-3** — el P0 toca cumplimiento y su arreglo es pequeño; con lint y suite en rojo la CI rechaza todo lo demás, así que nada es mergeable antes.
2. **`UsersTable`** (G-5) — es la superficie que la spec usa como motivación literal del programa y sigue sin corregir. Vale más que cualquier función nueva.
3. **S-1, S-4** — los dos vectores que reabren en silencio lo que el programa cerró.
4. **G-2** — solo tras la decisión del CTO y la medición de p95.

## Nota de proceso

El gate de la Ola 1 tiene seis versiones y tres re-gates. AI-SR-QA verificó que **la cadena converge como contenido** y que R-4/D-5 se cerró de verdad. Lo que falló fue distinto: se firmó sobre un estado ejecutable que el árbol no reproduce, y dos hallazgos declarados cerrados reaparecieron.

Es el mismo patrón que ya señalé en el gate de DEF-2, donde tres restricciones de alcance se incumplieron en un archivo. La lección se repite: **la suite verde no es evidencia suficiente de un gate**, y aquí ni siquiera lo estaba. Recomiendo que ningún gate futuro se firme sin adjuntar la salida literal de `lint`, `typecheck` y `test` de la corrida que lo sustenta.

El programa sigue **sin commitear**: 437 archivos, incluidos ADR-065, ADR-066 y 34 informes.
