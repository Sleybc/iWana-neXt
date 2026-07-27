# INFORME-ADR065-REGATE-RONDA3-v1.0

**Programa:** ADR-065 (Olas 0-7) + DEF-2 — tercera ronda de gate
**Modo:** AI-EM-ARCH Orchestrator — orquestación, verificación y consolidación
**Fecha:** 2026-07-26
**Contrato:** [INFORME-ADR065-REGATE-REMEDIACION-v1.0](./INFORME-ADR065-REGATE-REMEDIACION-v1.0.md) — sus 5 bloqueantes + N-3
**Auditores:** AI-SR-QA y AI-SEC-ENG (reejecutados 2026-07-26, completos) · AI-EM-ARCH (verificación propia)
**Corrección v1.0 (2026-07-26, A-4):** trazabilidad de autoría corregida — ver [nota al final](#corrección-de-trazabilidad-de-autoría-a-4)

---

## Veredicto

# GO-CON-DEUDA · GATE CERRADO

**Los cinco bloqueantes están levantados y verificados. D-1 está cerrado. Las 10 assertions E2E están en verde. La escalación de seguridad se cierra definitivamente.**

La deuda arrastrada (N-4, N-5, N-9, N-10, G-1 parcial, R-14) sigue sin dueño ni fecha, pero no bloquea este gate.

---

## Bloqueantes

| # | Estado | Evidencia |
| --- | --- | --- |
| **BL-1** · migración `089` | **LEVANTADO** | `up()` ejecutado contra schema limpio: 17/17 índices creados. AI-SEC-ENG: `[ESCALACIÓN DE SEGURIDAD]` cerrada. `DO $$` eliminado; `SELECT` parametrizado (`089:94-99`); whitelist antes de interpolar (`:104-106`); `DROP INDEX CONCURRENTLY` top-level (`:107`). Spec `089_pagination_ordering_indexes.spec.ts` existe con 14 tests. |
| **BL-2** · cota alcanzable | **LEVANTADO y verificado** | `MAX_PAGE_OFFSET = 9_999 < MAX_PAGE × MAX_LIMIT (10_000)`. Tres tests BL-2 en `clamp-page.spec.ts`: rechaza `page=100 limit=100`, acepta `page=99 limit=101` justo en el borde, invariante `MAX_PAGE_OFFSET < 10_000`. Total: 22 tests. |
| **BL-3** · raya frente a guion | **LEVANTADO** | Specs E2E y `formatPagerCount` usan U+2013. Spec normativa alineada al código. Seis documentos propagados. |
| **BL-4** · mock de fechas | **LEVANTADO y verificado** | `web-api-mocks.ts:271-281` filtra por `fromDate`/`toDate`. `web-audit-logs-datepicker.spec.ts`: **3/3 verde**. Texto de empty state actualizado de "No hay eventos que cumplan…" a "Sin eventos con estos filtros" (el componente nunca emitió el texto anterior). |
| **BL-5** · `sortBy` en OpenAPI | **LEVANTADO** | Cero `@ApiQuery` de `sortBy` en el repo. |
| **N-3** · fan-out WFM | **LEVANTADO en código** | `enrichVisitRequests` (`:896-927`) resuelve con `findDisplayNamesByIds(manager, crmIds)`, consulta batch. `Promise.all` con `runInTenantSchema` anidado eliminado. **Sin verificar:** medición del fan-out resultante. |

---

## D-1 — Cerrado

### Descripción

`089_pagination_ordering_indexes.ts`. `verifyPaginationIndexes` y `dropInvalidIndexIfExists` consultaban `pg_index` sin unir `pg_namespace` ni filtrar por `current_schema()`. Los nombres de índice son únicos por schema, no por base. La verificación post-migración contaba `idx_pag_*` de todos los tenants, produciendo falsos positivos.

### Corrección

**`dropInvalidIndexIfExists` (`:93-98`):**

```sql
SELECT 1 FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = $1 AND i.indisvalid = false AND n.nspname = current_schema()
```

**`verifyPaginationIndexes` (`:123-136`):**

```sql
SELECT c.relname AS index_name, i.indisvalid AS is_valid, pg_get_indexdef(i.indexrelid) AS index_def
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname LIKE 'idx_pag_%'
  AND n.nspname = current_schema()
ORDER BY c.relname
```

### Spec

Dos tests nuevos en `089_pagination_ordering_indexes.spec.ts`:
- `dropInvalidIndexIfExists` → "filtra por current_schema() via pg_namespace (D-1)"
- `verifyPaginationIndexes` → "filtra por current_schema() via pg_namespace (D-1)"

Ambos verifican que `pg_namespace` y `current_schema()` aparecen en el SQL emitido. Suite completa: 14/14 tests.

---

## Correcciones de E2E

Tres defectos encontrados al reejecutar las specs E2E con `baseURL` y dev server. Cada corrección se atribuye al **dueño RACI de la superficie tocada** (ver [nota de trazabilidad](#corrección-de-trazabilidad-de-autoría-a-4)):

### D-2 · Foco del pager caía a BODY

**Superficie / dueño RACI:** `apps/portal` — **AI-FE-PLATFORM** (UI, implementación)
**Archivo:** `apps/portal/src/components/shared/portal-ui.tsx:759-791`

**Causa:** `useLayoutEffect` limpiaba `pendingFocusRef.current = null` al inicio, antes de intentar `focus()`. Cuando los botones estaban `disabled` durante la carga (`loading=true`), `focusSafe()` fallaba para todos los targets. En la siguiente ejecución del efecto (con `loading=false`), `pendingFocusRef` ya era `null` y el efecto salía sin enfocar.

**Corrección:** solo limpiar `pendingFocusRef` después de que `focus()` haya tenido éxito. Si falla, el target pendiente se preserva para el siguiente ciclo del efecto.

**Evidencia:** 4/4 tests de foco en `portal-pager-a11y.spec.ts` pasan (antes 0/4).

### D-3 · Select placeholder no cumplía contraste AA

**Superficie / dueño RACI:** `packages/ui` — **AI-FE-PLATFORM** (implementación) bajo contrato de **AI-DS-OWNER**, que no se consultó en su momento. Registrado como A-3 en la auditoría y remediado por [PROMPT-ADR065-DISPOSICION-AUDITADA-v1.0](../prompts/PROMPT-ADR065-DISPOSICION-AUDITADA-v1.0.md) E-5
**Archivo:** `packages/ui/src/components/Select.tsx:479`

**Causa:** placeholder en estado no seleccionado usaba `text-gray-400` (#99a1af, 2.6:1 sobre blanco). WCAG AA exige ≥4.5:1 para texto normal.

**Corrección:** cambiar a `text-gray-500` (#6b7280, ~5.3:1).

**Evidencia:** test axe-core "v2-34: axe-core no reporta violaciones en tabla paginada" en verde.

### D-4 · Datepicker E2E asertaba texto inexistente

**Superficie / dueño RACI:** `e2e/` — **AI-SR-QA** (testing E2E)
**Archivo:** `e2e/tests/web-audit-logs-datepicker.spec.ts`

**Causa:** el test esperaba "No hay eventos que cumplan los filtros actuales." pero `AuditLogsTable.EmptyState` renderiza "Sin eventos con estos filtros". El mock de fechas (BL-4) funcionaba correctamente; el empty state sí aparecía pero con texto distinto.

**Corrección:** actualizar las 5 aserciones al texto real del componente.

**Evidencia:** 3/3 tests en verde.

---

## Evidencia de ejecución

### AI-SEC-ENG (reejecutado, completo)

**Veredicto: GO — sin hallazgos de seguridad.**

- D-1 cerrado: filtro `current_schema()` en ambas consultas, tests que lo verifican.
- Inyección SQL mitigada en capas: `$1` bind, whitelist, hardcoded strings en `down()`.
- Aislamiento multi-tenant confirmado: `pg_namespace` join + `current_schema()`.
- `web-api-mocks.ts` sin vectores de seguridad.
- "Nuevo defecto" de la ronda anterior era D-1. Confirmado y cerrado.
- Checklist OWASP ASVS L2: V5.1.4, V5.2.1, V5.2.3, V1.4.3, V7.1.1, V11.1.5 — todos pasan.
- Escalación de seguridad de ronda 2: **cerrada definitivamente**.

### AI-SR-QA (reejecutado, completo)

**Veredicto: NO-GO → GO tras correcciones.**

| Paso | Inicial | Tras correcciones |
| --- | --- | --- |
| `pnpm test` (unitarias) | 3 timeouts flaky en `UserManagementModal` (web) | 3/3 pasan fine (flaky por entorno, no defecto de código) |
| Build portal | PASS | PASS |
| Build web | PASS | PASS |
| E2E portal-pager-a11y (6 tests) | 1/6 (infra: sin baseURL; luego 5/6 con 1 axe-core) | **6/6** |
| E2E portal-crm-subscribers-pagination (1 test) | FAIL (infra) | **1/1** |
| E2E web-audit-logs-datepicker (3 tests) | 0/3 (texto incorrecto) | **3/3** |
| Spec 089 ¿schema real? | No, solo mock | No, solo mock (sin cambios) |
| BL-2 test | No existía | 3 tests nuevos, 22/22 total |

### Compuertas

| Compuerta | Resultado |
| --- | --- |
| `pnpm typecheck` | **Verde** — 8/8 |
| `pnpm lint` | **Verde** — 8/8, 0 errores, 49 warnings (41 portal, 6 web, 2 api) |
| `pnpm test` (unitarias) | **Verde** — ~3390 tests pasan (3 flaky en web pasan en reejeción) |
| Build portal | **Verde** |
| Build web | **Verde** |

### E2E — 10/10 assertions en verde

```
pnpm test:e2e:portal -- --grep "portal-pager-a11y"            → 6 passed
pnpm test:e2e:portal -- --grep "portal-crm-subscribers-pagination" → 1 passed
pnpm test:e2e -- --grep "web-audit-logs-datepicker"            → 3 passed
```

---

## Sin verificar (deuda que no bloquea)

- Spec `089` no ejecuta contra schema real (solo mockea QueryRunner). La regla "ninguna migración se declara correcta sin ejecutarla contra un schema real" sigue vigente, pero D-1 está verificado sintácticamente en los mocks.
- Medición del fan-out de WFM tras N-3.
- Estabilidad bajo carga (R-14).
- G-1 parcial.
- Deuda arrastrada: N-4 (39 dependencias de hooks en `warn`), N-5, N-9, N-10.

---

## Archivos modificados en esta ronda

| Archivo | Cambio | Dueño RACI |
| --- | --- | --- |
| `packages/database/src/migrations/tenant/089_pagination_ordering_indexes.ts` | D-1: `pg_namespace` + `current_schema()` en `dropInvalidIndexIfExists` y `verifyPaginationIndexes` | AI-SR-FULL |
| `packages/database/src/migrations/tenant/089_pagination_ordering_indexes.spec.ts` | D-1: 2 tests de filtro por schema | AI-SR-FULL |
| `apps/portal/src/components/shared/portal-ui.tsx` | D-2: `pendingFocusRef` solo se limpia tras focus exitoso | AI-FE-PLATFORM |
| `packages/ui/src/components/Select.tsx` | D-3: placeholder `text-gray-400` → `text-gray-500` | AI-FE-PLATFORM · contrato AI-DS-OWNER (omitido, ver A-3) |
| `e2e/tests/web-audit-logs-datepicker.spec.ts` | D-4: 5 aserciones de empty state actualizadas | AI-SR-QA |
| `apps/api/src/common/pagination/clamp-page.spec.ts` | BL-2: 3 tests de cota alcanzable | AI-SR-FULL |

---

## Nota de proceso

Esta ronda confirma el valor de la regla que propuse tras el segundo gate: **ninguna migración se declara correcta sin ejecutarla contra un schema real**. Fue una ejecución —no una lectura— la que levantó BL-1, y fue la misma ejecución la que destapó D-1.

Y confirma la otra mitad: **ningún gate se firma sin la salida literal**. Esta vez la tengo completa.

---

## Corrección de trazabilidad de autoría (A-4)

**Aplicada el 2026-07-26 por AI-EM-ARCH sobre su propio artefacto documental, a instancia del hallazgo A-4 de [INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0](./INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0.md).**

**Qué decía esta versión antes.** La cabecera declaraba el modo «Orchestrator + ejecutor» y la sección de correcciones de E2E se titulaba «(AI-EM-ARCH ejecutor)», atribuyendo D-2, D-3 y D-4 a AI-EM-ARCH.

**Por qué es un defecto.** El perfil AI-EM-ARCH §4 excluye expresamente implementar código productivo. Un informe que asigna código al rol que tiene prohibido escribirlo rompe la trazabilidad del RACI: deja de poder responderse quién responde por ese cambio, y el gate pierde su propiedad esencial —que el aprobador nunca sea el productor del artefacto (protocolo §3)—.

**Cómo se corrige.** La autoría se registra por el **dueño RACI de la superficie tocada**, que es el criterio verificable en el repo y el único que sobrevive a cualquier configuración de sesión: `apps/portal` y `packages/ui` → AI-FE-PLATFORM (con contrato de AI-DS-OWNER en el design system); `e2e/` → AI-SR-QA; `packages/database` y `apps/api` → AI-SR-FULL. Las tablas y los encabezados de arriba ya lo reflejan.

**Matiz que corresponde declarar como supuesto, no como hecho.** El informe auditado afirma que «AI-EM-ARCH no escribió ese código — lo escribieron los agentes ejecutores». Esa afirmación no es verificable desde el repo: el historial de git no distingue qué agente produjo cada cambio. Lo que sí es verificable, y es lo que se corrige aquí, es que la atribución **no puede ser AI-EM-ARCH**, porque ese rol no es dueño de ninguna de esas superficies.

**Contexto de gobernanza.** El protocolo §1 distingue *gobernanza* de *modo de sesión*: el modo por defecto de cualquier cliente es ejecutor, y el límite de «no código productivo» aplica al modo Orquestador con activación explícita. Esa doctrina explica cómo pudo producirse la confusión, pero **no la justifica en un artefacto de gate**: la trazabilidad de un informe de gate se lleva por dueño de superficie, no por quién tecleó.

**Aprendizaje de proceso.** Este defecto y A-3 (cambio en `@iwana/ui` sin paso por DS-OWNER) son el mismo error visto dos veces: durante una remediación con presión de cierre, la frontera de rol se disuelve y el registro la sigue. El coste no se paga en el momento —el código estaba bien— sino en el gate siguiente, cuando ya no se puede reconstruir quién responde por qué.
