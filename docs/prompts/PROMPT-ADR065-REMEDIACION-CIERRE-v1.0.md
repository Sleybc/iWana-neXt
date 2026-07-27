# PROMPT — Remediación para levantar el NO-GO de cierre (ADR-065 + DEF-2)

**Versión:** 1.0
**Estado:** Aprobado
**Generado por:** AI-EM-ARCH
**Archivo destino:** `docs/prompts/PROMPT-ADR065-REMEDIACION-CIERRE-v1.0.md`

**Emisor:** AI-EM-ARCH
**Destinatarios:** AI-SR-FULL (parte A) · AI-FE-PLATFORM (parte B) · AI-PLAT-OPS (parte C) · AI-SR-QA (gate)
**Fecha:** 2026-07-25
**Entrada obligatoria:** [INFORME-ADR065-GATE-CIERRE-PROGRAMA-v1.0](../informes/INFORME-ADR065-GATE-CIERRE-PROGRAMA-v1.0.md) — es el contrato de esta remediación
**Decisiones del CTO ya tomadas (2026-07-25):** S-1 **se corrige**, sin excepción · S-3 resuelto por política en [ADR-067](../adrs/ADR-067-Proyeccion-PII-Listados-Operativos.md), **no se estrecha la proyección**
**Skills:** `nestjs-expert`, `postgresql`, `backend-security-coder`, `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `testing-patterns`, `database-migration`, `systematic-debugging`

## Regla que gobierna todo este prompt

**Se corrige el producto, no el test.** Tres de los defectos de este informe existen porque un test se escribió contra la implementación en vez de contra el requisito. Si un test falla, la pregunta es qué está mal en el código; ajustar la aserción para que pase es la salida prohibida.

Y ningún tramo se declara cerrado sin adjuntar la **salida literal** de `pnpm lint`, `pnpm typecheck` y la suite correspondiente. El gate anterior se firmó sobre un estado que el árbol no reproducía.

---

## Parte A — Backend · AI-SR-FULL

### A1 · B-1 · P0 · Filtro de rango de fechas de auditoría — lo primero

`audit-query.service.ts:61-64` y `platform-audit.service.ts:92`, `:118`. El refactor DEF-3 migró a QueryBuilder y arrastró `buildCreatedAtFilter` sin traducirlo: devuelve un `FindOperator<Date>` (`Between` / `MoreThanOrEqual` / `LessThanOrEqual`), válido solo dentro de un objeto `where`, y se está enlazando como parámetro escalar de `audit.createdAt = :createdAt`. **El rango se destruye en silencio en las cuatro rutas** —datos y conteo, tenant y plataforma— sobre superficie de cumplimiento.

**El mismo archivo tiene el uso correcto en `:165-166`**: úsalo como referencia de lo que se esperaba.

Traduce el helper a predicados de QueryBuilder (`BETWEEN`, `>=`, `<=`) con parámetros escalares, o expón una variante que emita SQL. No dupliques la lógica de rangos.

**Y reescribe los specs.** `audit-query.service.spec.ts:163-174` asserta la forma incorrecta con `expect.anything()`, que acepta el `FindOperator` — por eso el módulo aparece verde. El spec debe verificar **que el rango filtra**, no que se llamó a `andWhere`. Igual en el par de plataforma.

**Verificación:** `e2e/tests/web-audit-logs-datepicker.spec.ts` en verde (hoy 3 fallos).

### A2 · S-1 · Alta · Fan-out de `CompletenessCalculator` — decisión del CTO: se corrige

`expediente.service.ts:666-668` mantiene un `Promise.all` sobre las filas de la página, y `CompletenessCalculator` abre **tres** conexiones independientes por fila (`:59`, `:72`, y `:87` vía `crm-quote-read.adapter.ts:15`). Con `limit=100` son **300 adquisiciones concurrentes** contra `DB_POOL_MAX` con default **10** (`data-source.ts:151`).

Es la misma clase de vector que DEF-2 y ADR-065 vinieron a cerrar, y sobrevivió al clamp: la magnitud bajó de ~20.000 a ~300, el fan-out sin cota sigue.

**Corrección esperada:** que `CompletenessCalculator` **reciba el `EntityManager` del llamador** en vez de abrir conexión propia, y que la completitud de la página se resuelva con **una consulta por tabla usando `In(ids)`**. Un limitador de concurrencia (`p-limit`) es mitigación parcial, **no cierre** — si acabas ahí, decláralo como tal y escala.

AI-SEC-ENG no aprueba excepción para este hallazgo. El CTO decidió corregirlo.

### A3 · S-2 · Media · Último endpoint de CRM sin tope de `limit`

`responsibilities.controller.ts:75-76` recibe `page`/`limit` crudos, sin `CrmListPagePipe`/`CrmListLimitPipe`, y `responsibilities.service.ts:153` llama solo a `clampPage`, nunca a `clampLimit`. `?page=1&limit=10000` **pasa** la cota del producto. Es el mecanismo exacto de H-1 y el último sitio donde queda.

### A4 · G-4 · P2 · Desempate inestable del kárdex

`stock-movement-query.service.ts:114` ordena por `(created_at DESC, movement_number DESC)` — **único de 29 servicios sin desempate por `id`**. Y `movement_number` no es único: sin índice único (`stock-movement.entity.ts:11-15`) y generado con leer-máximo-e-incrementar sin bloqueo (`stock-ledger.service.ts:1318-1333`), así que dos movimientos concurrentes del mismo tenant pueden colisionar sin que la base lo rechace.

Dos salidas; elige y justifica: índice único sobre `(tenant_id, movement_number)` con generación segura —cierra además una arista de integridad de datos más allá de paginación—, o desempate por `id`. **Si eliges el índice único, la generación actual debe cambiar antes**, o la migración fallará en tenants con colisiones existentes.

### A5 · G-1 · P2 · La clasificación feed/directorio nunca se aplicó

Ningún endpoint emite `randomAccess: false`: los 31 `buildPageMeta` pasan `true` y los 6 `buildCursorMeta` **también lo pasan explícitamente**, así que el default `false` de `build-page-meta.ts:68` nunca se ejerce. La variante feed (v2-10…13) solo existe en tests con mocks que en producción no pueden ocurrir.

La spec §2 hace de `randomAccess` el mecanismo único de clasificación y nombra candidatos a feed: kárdex, auditoría, timeline, notificaciones, cola de visitas, bajas, salidas, alertas de vida útil. **Cuatro de ellos recibieron pager de directorio.**

Aplica la regla del `ORDER BY` por defecto de la spec §2, recurso por recurso, y emite `randomAccess: false` donde corresponda. Esto es la decisión que el ADR delegaba al backend y que no se tomó.

### A6 · G-6 · P2 · Cobertura de endpoint de los cinco casos DEF-2

Hoy los cinco casos existen **solo** en `clamp-page.spec.ts`. La cota de offset se ejerce en **1 de 29** endpoints, y los dos tests HTTP existentes asertan el `@Min(1)` del DTO, **no el clamp** — seguirían verdes si `clampPage` se borrara.

Añade cobertura de endpoint en 2-3 endpoints representativos, **contra el clamp**: `page` en el límite exacto, justo por encima → 400, no numérica, negativa, cero.

### A7 · ADR-067 cláusula 5 · Registro de acceso masivo a PII

El CTO decidió conservar la proyección de documento, correo y teléfono en el listado de suscriptores; la contrapartida es trazabilidad. El `AuditInterceptor` registra escrituras, no lecturas de listado: extiéndelo **para este endpoint** de modo que quede registrado actor, rol, filtros aplicados, tamaño de página y total servido.

**Sin PII en el registro** — se registra el criterio de acceso, nunca los datos leídos.

---

## Parte B — Frontend · AI-FE-PLATFORM

### B1 · B-2 · P1 · Lint verde

Seis errores: directivas `eslint-disable` que citan `react-hooks/exhaustive-deps`, regla que la config del portal no carga (`CommercialInterestSection.tsx:114,147` · `InventoryClient.tsx:1181,1193` · `StockByProductTable.tsx:112` · `StockIssueComposer.tsx:456`). Más un warning por directiva sobrante en `portal-ui.tsx:923`, dentro de `PortalPageSizeSelect`.

Dos salidas: retirar las directivas inválidas, o **cargar `eslint-plugin-react-hooks` en `packages/config`**. Si las directivas se pusieron porque hay dependencias faltantes reales, cargar el plugin las expondrá — y entonces se corrigen, no se silencian.

**Es reincidencia de R-10, declarado cerrado en el gate v1.5.** Deja registrado por qué volvió.

### B2 · B-3 · P1 · Búsqueda acoplada a la URL sin borrador ni debounce

`PurchaseRequestsToolbar.tsx:199`, `StockIssuesToolbar.tsx:126`, `StockKardexPanel.tsx:232`. El `value` deriva de `searchParams` sin estado local, así que **cada pulsación** dispara `router.replace` y una petición al servidor. Provoca pérdida de caracteres y los 3 fallos de `InventoryClient.spec.tsx`.

**El patrón correcto ya existe** en el piloto: `SubscribersListClient.tsx:126-151` (`searchDraft` + debounce) y `SuppliersPanel.tsx:79-86`. Replícalo; no inventes una tercera vía.

Los tests de `InventoryClient.spec.tsx:1230`, `:1815` y el de `custody=mobile` deben volver a verde **por la corrección del producto**.

### B3 · G-3 · P2 · Doble conteo (v2-08) y segunda gramática de copy

Cinco superficies pintan el total en `PortalResultsStrip` **y** en `PortalTablePager` simultáneamente: `AssetsWorkspace.tsx:202`, `PurchaseWorkspace.tsx:646`, `StockCountsWorkspace.tsx:602`, `StockIssuesWorkspace.tsx:403`, `SuppliersPanel.tsx:265`. Incumple v2-08 y anula la mitigación de R4 («el strip cede el conteo en modo paginado → saldo neto ≈ 0»).

Además el strip usa **raya** y omite «Mostrando», contra el copy congelado de la spec §3 (guion, `Mostrando 21-40 de 128 usuarios`) → R2, dos gramáticas conviviendo.

**El primitive ya cumple** (`formatPagerCount`, `portal-ui.tsx:616-631`): el strip cede el conteo donde hay pager y el copy se unifica al del primitive.

### B4 · G-5 · P2 · `UsersTable` — la superficie que motivó el ADR

13 superficies con pager frente a 26 que siguen en «Cargar más». Entre las no migradas está `users/UsersTable.tsx:447`, con el estado en `UsersClient.tsx:268-269` — **el caso que la spec §1 usa como motivación literal del programa**: filtros en URL pero no la página, así que volver con Atrás pierde la posición.

Migrarla es prioridad por encima de cualquier función nueva. Tampoco están migrados `PlanCatalogPanel` ni `TaxCatalogManager`, que son directorios por la regla §2 y ningún informe menciona: inclúyelos o declara por qué no.

### B5 · G-7 · P2 · Cobertura de v2-25 y v2-34

En jsdom, deshabilitar el botón enfocado **no lo desenfoca**, así que un test unitario del pager pasa siempre y no detecta la caída al `<body>` que sí ocurre en navegador. La lógica del primitive es correcta (`pendingFocusRef` + `useLayoutEffect`, `portal-ui.tsx:757-795`); falta la prueba.

`@axe-core/playwright` **ya está instalado** y en uso (`portal-auth-notifications.spec.ts`, `web-auth-dashboard.spec.ts`), pero nadie lo apuntó a una tabla paginada.

Añade un E2E sobre una tabla paginada con assertion de `document.activeElement` tras paginar (v2-25) y pasada de axe (v2-34).

**Riesgo estructural a verificar mientras lo haces:** v2-27 exige deshabilitar los controles durante la carga y v2-25 prohíbe que el foco caiga al `<body>`. Si el consumidor levanta `loading` **después** de restaurar el foco, el navegador desenfoca el botón. Solo el E2E real lo resuelve.

### B6 · G-8 · P3 · v2-32 parcial

`parsePositiveInt` (`use-table-query-state.ts:57-62`) normaliza `?page=0` a 1 pero **no corrige la URL**: el valor inválido persiste en la barra. La cláusula «URL corregida en silencio» no está implementada.

---

## Parte C — Plataforma · AI-PLAT-OPS

### C1 · S-4 · Media · La migración `089` puede quedar inválida en silencio

`089_pagination_ordering_indexes.ts:52` declara `transactional = false` (ADR-066) y crea 17 índices con `CREATE INDEX CONCURRENTLY IF NOT EXISTS`. **La combinación es el riesgo:** si un build falla —deadlock, cancelación, presión de I/O—, PostgreSQL deja el índice en estado **INVALID** y no lo elimina. El runner no registra el paso, así que el reintento vuelve a ejecutar `up()`; pero `IF NOT EXISTS` **ve el índice inválido como existente y lo omite**.

Resultado: índice inválido permanente, ignorado por el planner, y ese tenant vuelve a resolver el orden con ordenamiento completo — **reabre el vector de agotamiento solo para él, en silencio**. Los datos siguen correctos, así que ninguna prueba funcional lo detecta.

Segundo tramo: la excepción detiene el bucle de `runTenantMigrations`, de modo que los tenants posteriores **no reciben `089` en absoluto**. Estado heterogéneo sin reporte agregado.

**Corrección:** antes de cada `CREATE`, eliminar el índice inválido si existe (consulta sobre `pg_index.indisvalid = false`), y añadir verificación post-migración que liste los `idx_pag_*` inválidos por tenant.

**Debe estar antes del primer despliegue de `089` a un tenant con volumen.**

### C2 · Medición de p95 pendiente

Es el dato que sostiene `randomAccess` (A5) y la lista blanca de orden. Sin él, ambos flags quedan puestos por criterio y no por evidencia. Desbloquéalo y entrega la tabla por recurso y por orden ofrecido.

### C3 · Suite E2E del portal inauditable

No concluye en más de 35 minutos, mientras el spec del pager pasa aislado en 2,8 s. El bloqueo está en otra spec. **Diagnostica cuál** —skill `systematic-debugging`— porque hoy el conjunto no se puede usar como gate.

---

## Gate final · AI-SR-QA

Reejecuta el gate completo del informe de cierre. Condiciones para levantar el NO-GO:

1. `pnpm lint`, `pnpm typecheck` y las suites de api, portal y web **en verde**, con salida literal adjunta.
2. `web-audit-logs-datepicker.spec.ts` en verde.
3. `InventoryClient.spec.tsx` en verde **por corrección del producto**, no por ajuste de aserciones.
4. Suite E2E del portal concluyendo, o el diagnóstico de C3 documentado.
5. **Estabilidad bajo carga:** las tres suites en paralelo, tres corridas consecutivas. R-14 se declaró cerrado y reapareció; esta vez adjunta las tres salidas.
6. Verificación de v2-08 en las cinco superficies de G-3 buscando el total en el DOM.
7. Los cinco casos DEF-2 con cobertura de endpoint (A6).

**No firmes el gate sin la salida literal de las compuertas.** El gate anterior se firmó sobre un estado que el árbol no reproducía, y eso es lo que esta remediación viene a evitar que se repita.

---

## Fuera de alcance de este prompt

- **G-2 (orden por columna):** **resuelto por ADR-065 v1.2 §22-bis** (Aprobado CTO 2026-07-25). `sortableFields: []` es estado conforme; **sigue prohibido poblar listas blancas sin la medición de p95**, y el primer tramo lo autoriza AI-EM-ARCH con la tabla de medición a la vista. Lo único que entra en esta remediación es la cláusula 3 de §22-bis: **retirar el anuncio de `sortBy` y `sortDir` de OpenAPI en los endpoints con lista vacía** (AI-SR-FULL), porque anunciar un parámetro que el servidor ignora y devolver siempre `meta.sort: null` es un contrato falso. No pueblen listas para «arreglarlo».
- **ADR-067 cláusula 9** (mapa campo × rol): es de AI-PROD-UX contra el PRD, no de este prompt.
- Deuda declarada que no bloquea el cierre: agregación de la matriz de ubicaciones, `sla-policies` sin `ListMeta`, graduación a `@iwana/ui`, H-UX-375, residual de E-4.
