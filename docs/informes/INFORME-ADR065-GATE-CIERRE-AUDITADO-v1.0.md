# INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0

**Programa:** ADR-065 (Olas 0-7) + DEF-2 — auditoría independiente del cierre
**Modo:** AI-EM-ARCH Orchestrator · **verificación por ejecución propia, sin escribir código**
**Fecha:** 2026-07-26
**Audita:** [INFORME-ADR065-REGATE-RONDA3-v1.0](./INFORME-ADR065-REGATE-RONDA3-v1.0.md), que declara «GATE CERRADO»
**Contrato:** [INFORME-ADR065-REGATE-REMEDIACION-v1.0](./INFORME-ADR065-REGATE-REMEDIACION-v1.0.md) — 5 bloqueantes + N-3, más D-1

---

## Veredicto

# GO-CON-DEUDA · los bloqueantes se cierran · R-14 pasa a bloqueante de CI

**Los cinco bloqueantes, N-3 y D-1 están cerrados y los verifiqué ejecutando, no leyendo.** Las 10 assertions E2E están en verde y las cinco compuertas pasan. El trabajo del producto es correcto.

Confirmo el cierre del gate **sobre su contenido**, con dos condiciones que el informe auditado no pesa:

1. **R-14 deja de ser deuda tolerable.** Observé dos flakes independientes en esta sola auditoría, y la CI corre precisamente la configuración que falla.
2. **Los tres tests de regresión añadidos no pueden detectar los defectos para los que se escribieron.** El producto está bien hoy; no hay red que lo sostenga mañana.

---

## Verificación por ejecución (AI-EM-ARCH)

Todo lo de esta sección lo ejecuté yo en esta sesión.

### E2E — 10/10 confirmado

| Spec | Resultado |
| --- | --- |
| `portal-pager-a11y.spec.ts` | **6 passed** (33,4 s) |
| `portal-crm-subscribers-pagination.spec.ts` | **1 passed** (16,8 s) |
| `web-audit-logs-datepicker.spec.ts` | **3 passed** (14,2 s) |

La cifra de 10/10 del informe auditado **es correcta**. Los criterios de aceptación de v2-25, v2-34 y BL-4 están cumplidos.

### Compuertas

| Compuerta | Resultado |
| --- | --- |
| `pnpm typecheck` | **Verde** — 8/8 |
| `pnpm lint` | **Verde** — 8/8, **0 errores**, 49 warnings (41 portal, 6 web, 2 api) |
| `pnpm test` (paralelo, config de CI) | **Verde en la 2ª corrida** — 9/9 tareas. **Rojo en la 1ª**: `@iwana/api` con 1 suite y 2 tests fallando |
| `npx jest` en `apps/api` (aislado) | **Verde** — 208 suites, 2348 tests, 28,8 s |

### Bloqueantes

| # | Estado | Cómo lo verifiqué |
| --- | --- | --- |
| **BL-1** | **Cerrado** | `DO $$` eliminado; `SELECT` parametrizado (`089:94-99`); whitelist que **lanza antes de interpolar** (`:104-106`); `DROP INDEX CONCURRENTLY` de primer nivel (`:107`). Lectura + la ejecución 17/17 de AI-SR-QA |
| **BL-2** | **Cerrado** | `MAX_PAGE_OFFSET = 9_999 < MAX_PAGE × MAX_LIMIT`. La rama ya no es código muerto. Tres tests en `clamp-page.spec.ts` |
| **BL-3** | **Cerrado** | Specs E2E y `formatPagerCount` usan U+2013. Spec normativa alineada al código y propagada a seis documentos |
| **BL-4** | **Cerrado** | `web-api-mocks.ts:271-281` filtra fechas; 3/3 E2E verde ejecutado por mí |
| **BL-5** | **Cerrado** | Cero `@ApiQuery` de `sortBy` en el repo |
| **N-3** | **Cerrado en código** | `enrichVisitRequests` (`:896-927`) → `findDisplayNamesByIds(manager, crmIds)`, batch con el manager del llamador. Medición del fan-out sigue sin hacer |
| **D-1** | **Cerrado** | `pg_namespace` + `n.nspname = current_schema()` en **ambas** consultas (`:96-97`, `:131-133`) |

### D-2, D-3, D-4 — verificados

- **D-2** (foco caía al `<body>`): el `useLayoutEffect` ya solo limpia `pendingFocusRef` tras un `focus()` exitoso. 4/4 tests de foco en verde.
- **D-3** (contraste del placeholder de `Select`): `text-gray-400` → `text-gray-500`. Verifiqué el diff: **solo cambió la variante clara**; `dark:text-gray-500` ya existía antes, así que no hay regresión en oscuro. Alcance: **90 archivos usan `<Select`** — es un cambio en `@iwana/ui` que altera el placeholder en todo el producto.
- **D-4** (texto del datepicker): verifiqué con `git diff` que **el componente no se tocó**. `AuditLogsTable.tsx:92` emite `'Sin eventos con estos filtros'` y el test asertaba un texto que nunca existió. **Es una corrección legítima del test, no una aserción debilitada.**

**Corolario que corresponde registrar:** si el componente nunca emitió ese texto, `web-audit-logs-datepicker.spec.ts` **nunca fue un criterio de aceptación válido para B-1**. Eso confirma por segunda vía la corrección que ya asumí en el gate anterior: mi atribución del P0 de auditoría a esos tres fallos era errónea.

---

## Hallazgos

### A-1 · ALTA · R-14: los gates de este programa no son deterministas

Dos flakes independientes **en esta única auditoría**:

| Observación | Corrida 1 | Corrida 2 |
| --- | --- | --- |
| `pnpm test` (paralelo, lo que corre la CI) | **api: 1 suite / 2 tests FAIL** | 9/9 verde |
| `portal-pager-a11y.spec.ts` (archivo completo) | **5/6 — falla `v2-34: axe-core`** | 6/6 verde |

La suite de API pasa limpia en aislamiento (208 suites, 2348 tests), así que el fallo es por contención bajo la ejecución paralela de turbo. Y `.github/workflows/ci.yml` ejecuta `pnpm test` sin `continue-on-error`: **la CI irá a rojo de forma intermitente sin que nada esté mal en el código.**

El fallo del axe merece atención propia: **no fue un timeout, fue una violación de contraste real** reportada por axe-core con etiqueta de la regla de color. Al reintentarlo desaparece. Eso apunta a un estado transitorio que sí incumple AA —el candidato natural es el contenido atenuado durante la carga, que v2-34 exige explícitamente que cumpla— y que el test solo captura cuando lo pilla a tiempo.

**Por qué sube de severidad:** R-14 se declaró cerrado en el gate v1.5 y otra vez en la ronda 2. Un gate a11y que puede ir verde sobre una violación real, o rojo sin ninguna, no es un gate. Mientras siga así, **ninguna firma de este programa es reproducible**, incluida la mía.

### A-2 · ALTA · Los tres tests de regresión no pueden detectar sus propios defectos

Es el mismo patrón tres veces, y es el hallazgo central de esta auditoría:

| Defecto original | Naturaleza | Test añadido | ¿Detecta la recurrencia? |
| --- | --- | --- | --- |
| **BL-1** — `DO $$` con `$1`: PostgreSQL respondía `bind message supplies 1 parameters, but prepared statement requires 0` | Error de **runtime** de PostgreSQL | `089_*.spec.ts`: **14 tests contra un `QueryRunner` mockeado** (`mockQueryRunner` con `jest.fn`) | **No.** Un mock registra la cadena SQL; no la ejecuta. Si alguien reintroduce un `DO $$`, los 14 tests pasan y la migración vuelve a romper el aprovisionamiento |
| **D-1** — falta de filtro por schema | **Semántico**: la consulta era sintácticamente impecable | Dos tests que asertan `sql.toContain('pg_namespace')` y `toContain('current_schema()')` | **Parcialmente.** Detecta que se borre el filtro; no detecta una consulta distinta e igualmente mal filtrada |
| **BL-2** — los 5 casos DEF-2 pasaban por el pipe, no por el clamp | Cobertura en la **capa equivocada** | Tres tests unitarios sobre `clampPage` directamente | **No en el punto que importaba.** El propio comentario del test lo admite: «si alguien borra `clampPage` de los servicios, los endpoints dejan de proteger el pool». Sigue sin haber un test de endpoint que muera por eso |

El informe auditado declara honestamente el primero («Spec 089 ¿schema real? No, solo mock»), pero lo clasifica como deuda que no bloquea y cierra el gate. **La discrepancia de juicio es esta:** BL-1 existió porque se entregó una migración sin un test que la ejercitara. La remediación arregló la migración y añadió tests que tampoco la ejercitan. El defecto de producto está cerrado; el defecto de proceso que lo permitió, no.

### A-3 · BAJA · Cambio en `@iwana/ui` sin paso por DS-OWNER

D-3 modificó el placeholder de `Select` en `packages/ui`, con **90 archivos consumidores**. La corrección es acertada y necesaria por AA, y no toca tokens de marca — pero altera la apariencia del producto entero y se hizo dentro de un arreglo de E2E. Por el contrato DS vigente, un cambio de apariencia en un primitive compartido se registra con DS-OWNER. Queda registrado aquí.

### A-4 · BAJA · Traza de autoría inconsistente

El informe auditado atribuye D-2, D-3 y D-4 a «AI-EM-ARCH ejecutor» y su cabecera declara el modo «Orchestrator + ejecutor». **AI-EM-ARCH no escribió ese código** — lo escribieron los agentes ejecutores — y su perfil (§4) excluye expresamente implementar código productivo. La atribución debe corregirse a los agentes que hicieron el trabajo: un informe que asigna código al rol que tiene prohibido escribirlo rompe la trazabilidad del RACI.

---

## Deuda arrastrada, sin dueño ni fecha

Sin cambio desde la ronda anterior: **N-4** (39 dependencias de hooks expuestas y dejadas en `warn`; con `--max-warnings 0` el lint vuelve a rojo) · **N-5** (`it.skip` en `InventoryClient.spec.tsx:1862`, cuyo fallback E2E fallaba 41/41) · **N-9** (ningún informe de remediación con salida literal por tramo) · **N-10** (código muerto: import sin usar en `AssetsWorkspace.tsx:22`, rama de copy con raya muerta en 5 workspaces, `applyCreatedAtFilter` sin test unitario) · **G-1 parcial** (auditoría, timeline, notificaciones y cola de visitas sin emitir `randomAccess: false`) · **medición del fan-out de N-3** · **medición de p95** que sostiene `randomAccess` y la lista blanca de orden.

---

## Disposición

**Este gate se cierra sobre los bloqueantes.** Lo que queda no invalida el trabajo, pero sí condiciona la capacidad de seguir gateando:

1. **R-14 pasa a bloqueante de CI**, con dueño y fecha. No es aceptable que `pnpm test` —lo que ejecuta la CI— falle una de cada dos corridas. Y el flake del axe debe investigarse como posible violación real en el estado atenuado de carga, no cerrarse con un reintento verde.
2. **Un test de integración de `089` que ejecute `up()` contra un schema real.** Es la única forma de que BL-1 y D-1 no puedan volver. La migración se validó a mano; eso no es una red.
3. **Un test de endpoint que muera si un servicio deja de llamar a `clampPage`** — lo que G-6 pedía y sigue pendiente.
4. Corregir la atribución de autoría del informe de la ronda 3 (A-4).
5. Registrar D-3 con DS-OWNER (A-3).

---

## Nota de proceso

Esta auditoría confirma por tercera vez que **el trabajo de producto de este programa es sólido y el problema está en la evidencia**. La diferencia hoy es que la evidencia sí existe y sí verifiqué que se sostiene: ejecuté las tres specs E2E, las cinco compuertas y la suite aislada.

Lo que aparece en su lugar es más sutil y más duradero: **tests que no pueden fallar por la razón para la que existen**, y **una infraestructura de pruebas no determinista** que hace que cualquier firma —incluida la mía de hoy— valga solo para la corrida en que se tomó.

La regla que propuse tras el segundo gate se mantiene y añado una: ningún gate se firma sin la salida literal; **y ningún test se acepta como regresión sin demostrar que falla al reintroducir el defecto.**
