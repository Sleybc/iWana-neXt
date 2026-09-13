# INFORME — MOD11 Operaciones · OLA 4 · Review de contrato e identidad (etapa 6) — AI-DS-OWNER

**Versión:** 1.0
**Fecha:** 2026-09-13
**Actualización post-corrección (OLA 4.1):** 2026-09-13 — P1-1 resuelto y verificado en disco («Verificación post-corrección»). **Veredicto final: Aprobada.**
**Autor:** AI-DS-OWNER (Design System Owner)
**Encargo:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA4-DS-OWNER-v1.0.md` v1.0 (etapa 6 del protocolo; puede bloquear G6 por violación de contrato o identidad)
**Insumos verificados:** contrato de componente `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` (v1.0 → **v1.1** en este acto); informes OLA 3 (consolidación y F5); design spec v1.0 (**Aprobado por el CTO**); UX spec v1.0 (H5); contratos API congelados `execution-orders-list.ts` v1 y `operational-tasks.ts` v1; `packages/ui/src/styles/globals.css`; `apps/portal/src/components/shared/portal-ui.tsx`; spec Firma iWana.
**DoR (entrada):** G5 completo (consolidación OLA 3 §4), implementación F5 en disco y contrato localizable — verificado antes de arrancar. Sin bloqueo de entrada.
**Skills leídas:** `iwana-identity-ui-review` (modo review, con su formato P0–P3 y reglas anti-falsos-positivos), `core-components`, `tailwind-patterns` (obligatorias); `senior-ui-systems-designer`, `wcag-audit-patterns` (apoyo). `ui-ux-pro-max` no se usó: ninguna decisión ni severidad de este informe se fundamenta en ella.
**Entorno:** rama única, sin commit; solo `pnpm`/`node`. Gate mecánico ejecutado dos veces.

---

## Review UI — Bandejas operativas de Operaciones (MOD11)

### Resumen ejecutivo

Dos tablas operativas de bandeja —tareas y órdenes de ejecución— con detalle por deep link en side peek; la tarea principal es escanear, filtrar y abrir trabajo operativo. La implementación F5 **cumple la estructura del contrato congelado**: un solo pie por tabla montado en un único ternario sobre `pagination.randomAccess`, modo leído del `meta` del servidor, encabezados sin orden mientras `sortableFields` está vacío, columna «Vence» con la gramática de despacho, cifras y fechas en `font-mono`, estados de skeleton/refresco completos e identidad sin desviaciones (lima fuera del pager, dark con `dark-surface-*`, sin hex sin tokenizar). El riesgo dominante es de composición de estados: **un fallo transitorio de refresco borra la lista visible y muestra un vacío engañoso**. **Post-corrección (OLA 4.1):** ese riesgo quedó corregido y verificado — ver «Verificación post-corrección».

**Modo:** código (sin capturas; el script cubre lo grep-able)
**Script:** `audit-ui.mjs` sobre `apps/portal/src/components/operations` y `apps/portal/src/app/dashboard/operations` — **0 deterministas, 0 heurísticos, sin hallazgos, exit 0** (dos corridas).
**Puntaje:** **89/100** pre-corrección (`100 − 10·P1 − 1·P3`) — P0: 0 · P1: 1 · P2: 0 · P3: 1 — banda «aceptable con mejoras». **Post-corrección 4.1: 99/100** (P1 resuelto; ver «Verificación post-corrección»).

### Hallazgos críticos (P0)

Ninguno.

### Hallazgos

#### [P1][Contrato · Estados] El error de carga o refresco vacía la bandeja y co-renderiza el vacío — **RESUELTO en OLA 4.1**

- **Estado:** corregido y verificado (ver «Verificación post-corrección»): `ExecutionOrdersClient.tsx:141-153` + `:352-355` y `TasksInboxClient.tsx:139-151` + `:459-462`.
- **Evidencia:** `apps/portal/src/components/operations/ExecutionOrdersClient.tsx:136-145` — el `catch` limpia `orders`/`ordersMeta` en todo fallo no-append, incluido el refresco del botón «Actualizar»; `:312-348` — la rama de vacío se decide solo por `!isLoading && orders.length === 0`, sin condición de `error`. Espejo en tareas: `TasksInboxClient.tsx:134-143` y `:415-458`.
- **Norma violada:** contrato de componente v1.0 §6.7 («La tabla conserva el último dato válido»). El modelo verificado hace lo contrario: `AssuranceClient.tsx:236` (`soft` en refresco) y `:328-333` (en fallo de refresco conserva las filas).
- **Impacto:** quien está despachando pierde de vista la bandeja ante un fallo transitorio de red o sesión y lee «Todavía no hay órdenes de ejecución» / «Aún no hay tareas aquí» junto al aviso de error: la interfaz afirma que no hay trabajo cuando no pudo consultarlo.
- **Recomendación:** en el `catch`, no mutar la grilla si ya había carga válida (`hasLoadedRef.current`), y no renderizar el vacío mientras `error` esté presente — el `PortalAlert` + «Reintentar» sustituye la composición vacía. Dos cambios locales por contenedor; sin tocar props del componente ni contrato de datos.
- **Dueño:** AI-FE-PLATFORM (carril rápido UI, ADR-049) · **Esfuerzo:** S · **Bloqueante para G6:** sí.

#### [P3][Accesibilidad] La fecha completa de «Vence» vive solo en el atributo `title`

- **Evidencia:** `apps/portal/src/components/operations/TasksTable.tsx:220-229` — el dato completo (`fullLabel` = `formatTaskDateTime`) se expone solo como `title`; el texto visible es abreviado («Vencida · 12 sep») y no hay `sr-only` con la fecha completa.
- **Norma:** contrato §7.1 (el valor de `formatTaskDateTime` es el dato de la celda) y UX spec §7.3 («la fecha completa con año va en el texto accesible de la celda cuando el año no es el actual»). El atributo `title` no es alcanzable por teclado y su anuncio no es uniforme entre lectores de pantalla.
- **Impacto:** usuarios de lector de pantalla o táctiles no obtienen de forma fiable el año del vencimiento cuando difiere del actual (borde de fin de año).
- **Recomendación:** `<span className="sr-only">` con `fullLabel` (o mostrar el año cuando no sea el actual), conservando el texto de despacho visible.
- **Dueño:** AI-FE-PLATFORM · **Esfuerzo:** S · **Bloqueante:** no.

### Quick wins

1. **P1-1** — preservar el dato válido en refresco fallido y gatear el vacío con `!error` — **aplicado en OLA 4.1 y verificado** (`ExecutionOrdersClient.tsx:141-153/352-355`, `TasksInboxClient.tsx:139-151/459-462`). ✅
2. **P3-1** — `sr-only` con la fecha completa en la celda «Vence» (`TasksTable.tsx:220-229`) — **pendiente como deuda de pulido** por decisión del orquestador. S.

### Mejoras estratégicas

- **Promover la receta de estados de bandeja al catálogo del DS**: «vacío y error los compone la bandeja; skeleton, filas y pie los renderiza la tabla». Ratificada aquí (contrato v1.1 §6.6); llevarla al catálogo de recetas evita que cada módulo la re-consulte. Transversal, L.
- **Dejar por escrito la rama degradada del conteo** (ver «Por verificar» 2): si en `randomAccess:false` el conteo visible sigue siendo del strip (ADR-065 §Decisión 4) o si el `sr-only` es la norma post-OLA5. M.

### Verificación del alcance de la orden (§3.1)

| Check | Resultado | Evidencia |
| --- | --- | --- |
| Un solo pie por tabla, en un único ternario | ✅ | `ExecutionOrdersTable.tsx:167-196` · `TasksTable.tsx:239-268`; grep: 1 import + 1 uso de cada primitiva por archivo; helper `operations-table-pagination.ts:12-39` (unión discriminada sobre `randomAccess`) |
| Modo leído de `meta.capabilities.randomAccess` | ✅ | `ExecutionOrdersClient.tsx:216` · `TasksInboxClient.tsx:224`; cero `useState`/default del modo en las tablas |
| Sin `PortalDataTableSortableHead` ni `aria-sort` | ✅ | grep: solo en comentarios que documentan su no-adopción (`ExecutionOrdersTable.tsx:9-10`, `TasksTable.tsx:9-10`); cero `aria-sort`/`sortBy`/`sortDir`/`onSortChange` en la superficie |
| «Vence» y cifras/fechas en `font-mono`/tabular | ✅ | `TasksTable.tsx:196,221` · `ExecutionOrdersTable.tsx:124,151`; pager `tabular-nums` (`portal-ui.tsx:1264,1405`) |
| Estados: hover, focus, active, disabled, loading (skeleton), empty con acción, error | ✅ salvo P1-1 | hover `portal-ui.tsx:62`; focus `interactiveFocusClassName` (`TasksTable.tsx:204`, `ExecutionOrdersTable.tsx:127`); activo `:190-194`/`:118-122`; disabled+loading del pie (`portal-ui.tsx:1343-1345,1266`) y `PortalPageSizeSelect disabled={refreshing}`; skeleton con forma `:174-182`/`:104-112`; vacíos E1–E5 en contenedores con el copy de UX §6 y acción; error con «Reintentar» (`:362-373`/`:277-288`) |
| Identidad: lima solo avance/éxito; sin `dark:bg-gray-{700..950}`; sin hex; sin cards anidadas sin función | ✅ | `operations-labels.ts:45` (único uso de `lime`); pager activo azul noche (`portal-ui.tsx:1256-1260`); grep de `dark:bg-gray-7/8/9xx` sin coincidencias; audit sin hex de marca; `PortalPanel` > shell de tabla es la composición declarada (contrato §3 delta 1) |

### Resolución de los puntos pendientes de OLA 3

#### (a) Composición de vacíos E1–E5 — **RATIFICADA**

Los vacíos **los compone el contenedor de cada bandeja** invocando `PortalEmptyState` con acción y el copy de la UX spec §6; la tabla solo renderiza filas, skeleton y pie. Evidencia: `TasksInboxClient.tsx:415-458` (E1–E3, con «Crear tarea»/«Actualizar»/«Limpiar filtros») y `ExecutionOrdersClient.tsx:312-348` (E4–E5, con «Ir a Programación»/«Actualizar»/«Limpiar filtros»); props de las tablas intactas.

Razones de la ratificación (y no de la corrección):

1. Las acciones y los permisos son de bandeja, no de tabla: «Limpiar filtros» escribe la URL, «Ir a Programación» navega y «Crear tarea» depende de `canManageTasks` — misma separación que el contrato §6.7 ya fija para el error.
2. Montar el vacío dentro de la tabla exigiría añadir props (`hasActiveFilters`, `onClearFilters`, copy y acciones de vacío) al contrato de props congelado en la ola 1 — exactamente la expansión que §6.7 evitó para el error.
3. El estado conserva primitive, copy y acción; el contenedor conoce los filtros activos que distinguen «primera vez» de «sin resultados» y da espacio completo al CTA sin dejar encabezados de una tabla sin filas.

**Declarado en el contrato (v1.1):** §3 delta 4, §6.6 («Composición ratificada») y §9.5 — no vuelve a consultarse.

#### (b) Observación `order.number` vs `executionOrderNumber` — **ANCLAJE RATIFICADO; contrato corregido**

`number` es el campo real del contrato congelado (`packages/shared/src/contracts/operations/execution-orders-list.ts:33`) y el consumo de la columna 1 (`ExecutionOrdersTable.tsx:130`) es correcto. `executionOrderNumber` era una referencia equivocada de mi contrato v1.0 (tomada del nombre lógico de ordenación futura de la design spec §4.7.1). **No hay cambio de código.** El contrato v1.1 corrige §7.2 col. 1 a `number` con nota de desambiguación y ratifica el encabezado «Asignado a» contra UX spec §4.5.

### Contrato — sube a v1.1

`docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md`: **v1.0 → v1.1**, con changelog en §12 y la v1.0 declarada superada **en el mismo acto** (protocolo §3bis regla 1). Contenido: ratificación de vacíos (§3/§6.6/§9.5), anclaje `number` + encabezado (§7.2), «Vence» referenciada a la gramática UX §7.3 (§7.1), aclaración error/vacío (§6.7).

**La implementación en disco ya conforma las ratificaciones: el bump no fuerza re-sync de tracks.** La corrección exigida es solo el hallazgo P1-1, que ya era exigido por §6.7 v1.0. Se solicita a AI-EM-ARCH registrar la versión v1.1 (adenda al prompt vigente, protocolo §3bis regla 1) y notificar a AI-FE-PLATFORM y AI-SR-QA vía orquestador.

### Gate mecánico

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations
```

Resultado: `audit-ui: sin hallazgos en las rutas analizadas.` — **exit 0** (corrido en el review y re-ejecutado en la verificación post-corrección; tres corridas limpias). El script cubre lo grep-able; los dos hallazgos de este informe son de composición de estados y de accesibilidad fina — exactamente el valor que el review añade sobre el script.

### Verificación post-corrección (OLA 4.1)

Corrección de AI-FE-PLATFORM verificada contra el contrato v1.1 §6.7/§9.5 en el código en disco (rama única, sin commit; informe de la corrección: `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-CORRECCION-FE-PLATFORM-v1.0.md`).

| Punto | Estado | Evidencia verificada (2026-09-13) |
| --- | --- | --- |
| Preservación del último dato válido en fallo no-append | ✅ | `ExecutionOrdersClient.tsx:141-153` y `TasksInboxClient.tsx:139-151` — el `catch` solo limpia la grilla con `!append && !hasLoadedRef.current`; con filas previas las conserva. Espejo del modelo `AssuranceClient.tsx:236,328-333` |
| Sin co-render de vacío con `error` | ✅ | `ExecutionOrdersClient.tsx:352-355` y `TasksInboxClient.tsx:459-462` — rama `error ? null : …`; sin filas previas el `PortalAlert` + «Reintentar» es el estado de la bandeja |
| Modelo `AssuranceClient` respetado | ✅ | Refrescos con `hasLoadedRef` → `isRefreshing` (`:120-124` / `:112-116`); en fallo de refresco se conservan las filas y la alerta no se mezcla con el vacío |
| Resto del contrato sin cambios | ✅ | Pie único en un único ternario (`ExecutionOrdersTable.tsx:168-196`, `TasksTable.tsx:240-268`; helper `operations-table-pagination.ts` intacto); modo desde `meta` (`ExecutionOrdersClient.tsx:224`, `TasksInboxClient.tsx:232`); sin `PortalDataTableSortableHead` ni `aria-sort` (solo comentarios); columnas 8/7 y encabezados intactos (`ExecutionOrdersTable.tsx:93-100`, `TasksTable.tsx:164-170`); `font-mono`, `min-w` e identidad sin cambios (lima solo `operations-labels.ts:45`; pager azul noche) |
| Evidencia de tests | ✅ | Casos P1-1 leídos y asertivos: `ExecutionOrdersClient.spec.tsx:687,710`, `TasksInboxClient.spec.tsx:244,258` y e2e `portal-operations-bandeja-ot.spec.ts:646`. **Suite de `operations` re-ejecutada en esta sesión: 23/23 suites · 302/302 casos passed · 24.7 s** (coincide con el conteo del informe 4.1). La corrida e2e (15 passed) es evidencia del productor, no re-ejecutada aquí |

Hallazgos nuevos: **ninguno**. Notas no bloqueantes: (1) los comentarios de cabecera de `TasksTable.tsx:3-4`, `ExecutionOrdersTable.tsx:3-10` y `operations-table-pagination.ts:4-5` citan el contrato «v1.0»; conviene actualizar la cita a v1.1 en el próximo toque (higiene de trazabilidad, sin efecto funcional); (2) warnings de `act(...)` en `ExecutionOrdersToolbar.spec.tsx` (fetch de sedes fuera de `act`) — higiene de tests para QA/FE; la suite queda verde.

La ola 4.1 resolvió además el punto que este informe dejaba en «Por verificar» 1: E6 es ahora alerta de contenedor con salida a la bandeja (`ExecutionOrdersClient.tsx:255-262,308-319`) y el drawer ya no se abre por error (`:408-410`) — alineado con UX §6.3 y con §6.7 (el error es estado del contenedor).

**Conclusión:** el contrato v1.1 queda como patrón de medida sin cambios adicionales.

### Marcadores (§6.3)

```text
[BLOQUEO] De: AI-DS-OWNER | Fase/módulo: MOD11 · OLA 4 — review de contrato e identidad (etapa 6)
Qué intenté: review de la implementación F5 contra el contrato congelado + gate mecánico (limpio, exit 0).
Qué falta para desbloquear: corregir el estado error/vacío de los dos contenedores (P1-1): conservar el último dato válido en refresco fallido y no co-renderizar el vacío con el error. Fix S en carril rápido UI; dueño AI-FE-PLATFORM; re-verificación DS sobre el diff (o verificación de QA).
Impacto si no se resuelve: G6 no cierra por violación de la cláusula §6.7; un fallo transitorio de refresco desinforma («no hay trabajo») en la tarea principal del despachador.
```

**Estado del marcador:** `[BLOQUEO]` **resuelto** en la ola correctiva 4.1 — P1-1 verificado (ver «Verificación post-corrección»). Sin marcadores nuevos.

Sin `[CONSULTA]` nuevas: la fricción del fix fue una directriz del carril rápido, no una pregunta de criterio.

### Por verificar

1. **E6 (UX §6.3) — resuelto en OLA 4.1.** El error de deep link de OT se presenta como alerta de contenedor con «Ver todas las órdenes de ejecución» (`ExecutionOrdersClient.tsx:255-262,308-319`) y el drawer ya no se abre por error (`:408-410`), con paridad E7. La discriminación red-vs-recurso (O-2, común a E6/E7) queda excluida por decisión del orquestador.
2. **Conteo en la rama degradada «Cargar más».** ADR-065 §Decisión 4 dice que en modo `randomAccess:false` el strip «conserva» el conteo; las dos tablas lo anuncian solo en `sr-only` (`portal-ui.tsx:1109-1113`, `PortalTablePagination`). Hoy es rama no alcanzable para ambos recursos (sus contratos declaran `randomAccess: true`) y `AssuranceTicketsTable` —el modelo— tiene la misma composición. No se cuenta como hallazgo; queda anotado para la próxima revisión transversal del DS.

### Veredicto

**Aprobada** (post-corrección OLA 4.1). El bloqueante P1-1 quedó **resuelto y verificado en disco** (ver «Verificación post-corrección»); puntaje derivado vigente: **99/100** (P0: 0 · P1: 0 · P2: 0 · P3: 1). **P3-1** (fecha completa `sr-only` en «Vence») viaja como deuda de pulido por decisión del orquestador, con dueño AI-FE-PLATFORM y sin efecto en G6. No hay hallazgos nuevos; el contrato v1.1 no requiere cambios adicionales.
