# Evidencia de calidad — MOD11 Operaciones · OLA 4 (F6) · Matriz criterio ↔ test

**Fecha:** 2026-09-13 (revisión post-fix OLA 4.1 incluida)
**Autor:** AI-SR-QA (`sr-qa`)
**Informe principal:** [INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-SR-QA-v1.0.md](../informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-SR-QA-v1.0.md) (§14 = verificación post-fix)
**Spec de criterios:** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 §6
**Regla de evidencia:** conteos reales de ejecución (turbo con `Cached: 0`/`--force`; jest y Playwright sin caché).
**Estado post-fix (OLA 4.1):** DEF-F6-01 **cerrado** · D-2 **cerrado** (bloque 9 9a–9g verdes, 37/37, exit 0) · CA-01 y CA-03 con capa **E2E-API cerrada** · matriz 11/11.

## 1. Conteos reales por suite (estado final del árbol)

| Suite | Comando | Resultado | Duración | Caché |
| --- | --- | --- | --- | --- |
| Lint | `pnpm lint --force` | 8/8 successful · 0 errores | 15.973 s | `Cached: 0 cached, 8 total` |
| Typecheck | `pnpm typecheck --force` | 8/8 successful · 0 errores | 11.306 s | `Cached: 0 cached, 8 total` |
| Lint (post-fix OLA 4.1) | `pnpm lint --force` | 8/8 successful · 0 errores | 19.404 s | `Cached: 0 cached, 8 total` |
| Typecheck (post-fix OLA 4.1) | `pnpm typecheck --force` | 8/8 successful · 0 errores | 16.111 s | `Cached: 0 cached, 8 total` |
| API jest (post-fix) | `pnpm --filter @iwana/api test` | 314 passed + 4 skipped suites · 3936 passed + 15 skipped | 26.8 s | sin turbo |
| Portal jest (post-fix) | `pnpm --filter @iwana/portal test` | 267/267 suites · 2440 passed + 1 skipped | 42.9 s | sin turbo |
| E2E portal completa (pre-fix, corrida 2) | `pnpm test:e2e:portal` | 152 passed / 98 failed / 0 skipped / 0 flaky | 37.3 min | fallos preexistentes (ver §4) |
| E2E 3 specs de alcance (post-fix) | `pnpm test:e2e:portal <operations + pager-a11y + field-flow>` | **28/28 passed · exit 0** | 56.2 s | — |
| — operaciones (15: 9 F6 + 6 FE) | | 15/15 | | |
| — pager a11y (9) | | 9/9 | | |
| — flujo de campo (4) | | 4/4 | | |
| Gate de identidad | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations` | sin hallazgos · exit 0 | — | — |
| D-2 canónico (post-fix) | `node scripts/e2e-provision-operational.mjs` | **37 passed / 0 failed / 0 skipped / 0 flaky · exit 0 · cleanup OK** | Playwright 132.0 s · total 179.0 s | provisioner R4.1 |

Plataforma: Windows 11 (win32) · Playwright 1.58 chromium · 1 worker.

## 2. Matriz CA-01…CA-11

| CA | Test(s) que lo ejercitan | Estado |
| --- | --- | --- |
| CA-01 | E2E-N `portal-operations-bandeja-ot.spec.ts › CA-01`; U `ExecutionOrdersTable.spec.tsx`, `ExecutionOrdersToolbar.spec.tsx`, `execution-orders-query.spec.ts`; E2E-API 9a–9e | ✅ E2E-N/U + E2E-API cerrada post-fix |
| CA-02 | E2E-N `› CA-02`; field-flow `escenario operaciones — cierre OT…` y `operaciones pre-inicio…` (URL legada, líneas 876/975 intactas); field-flow `operaciones — la URL canónica…` | ✅ |
| CA-03 | U `tasks.boundary.spec.ts` (BOLA técnico, dos técnicos, ADMIN 3 vs técnico 1, CONTRACTOR); U `execution-orders.service-list.spec.ts` (scoping + CONTRACTOR); U-UI `ExecutionOrdersClient.spec.tsx › ADR-065 §15` (técnico 1 / admin 21 / sin recomputo); E2E-API 9f y 9g | ✅ U+UI + E2E-API cerrada post-fix |
| CA-04 | E2E-N `› CA-04` (×2); U `TasksInboxClient.spec.tsx` (página 2 push / filtro replace); U `tasks-query`, `execution-orders-query` | ✅ |
| CA-05 | U `ExecutionOrdersTable` (4 casos de pie), U `TasksTable` (2 casos), E2E-N `› CA-05` (×2), E2E-N a11y (nav único) | ✅ |
| CA-06 | E2E-N `› CA-06` (drawer OT) y `› CA-06: cerrar el drawer de tareas…` (Escape); U deep link `?taskId=` | ✅ |
| CA-07 | E2E-N `› CA-07` (0 peticiones al listado de OT); U `TaskIntakeClient.spec.tsx` | ✅ |
| CA-08 | U `OperationsUserPicker.spec.tsx` (typeahead on-demand, 403 visible, S0 sin búsqueda); montajes sin `usersApi.list` | ✅ |
| CA-09 | U `TasksTable.spec.tsx` (columna «Vence», 6 estados); U `TasksToolbar.spec.tsx` (tipo/responsable/ticket) | ✅ |
| CA-10 | U `ExecutionOrdersTable`/`TasksTable` (sin `aria-sort`); API `tasks.swagger.spec.ts` | ✅ |
| CA-11 | `audit-ui.mjs` sin hallazgos (exit 0) | ✅ |

## 3. D-2 (E2E API bloque 9) — veredicto: **CERRADO**

- **Post-fix (OLA 4.1):** corrida canónica `node scripts/e2e-provision-operational.mjs` → **37 passed / 0 failed / 0 skipped / 0 flaky · exit 0 · E2E_CLEANUP=OK** (Playwright 132.0 s). Bloque 9 completo: **9a, 9b, 9c, 9d, 9e, 9f y 9g verdes** (7/7).
- DEF-F6-01 (colisión `tasks/:id` ↔ `tasks/execution-orders`) fue corregido por AI-SR-FULL (reordenación de `controllers` + regresión `tasks-routing.spec.ts`, 6 casos) y **verificado por QA** con esta corrida.
- **Hueco de fixture cerrado (infra de tests):** el provisioner no creaba el segundo técnico que exige 9g; se extendió de forma aditiva (`E2E_TECH2_EMAIL`/`E2E_TECH2_PASSWORD`, patrón existente). Pendiente de ratificación por AI-PLAT-OPS (no bloqueante).
- Hallazgo de entorno vigente: `E2E_PLATFORM_*` de `.env.development.local` no corresponden a la cuenta de plataforma sembrada (401 `USUARIO_NO_ENCONTRADO`); `PLATFORM_SUPER_ADMIN_*` sí autentica. Dueño AI-PLAT-OPS.

## 4. Fallos preexistentes de la suite E2E portal (no F6)

98 fallos en specs que no mockean `/access-control/me/effective-permissions` (endpoint migrado el 2026-08-29, `d5db6239`) y quedan en estado «No pudimos verificar tu acceso» / «No tienes acceso». Los tres specs de F6 (operaciones, pager a11y, flujo de campo) pasan **en la misma corrida**. Deuda asignable fuera de F6.

## 5. Marcadores

- `[BLOQUEO]` a AI-EM-ARCH (DEF-F6-01) — **resuelto** con la verificación post-fix (§3). No caduca: se cierra con evidencia.
- `[CONSULTA]` a AI-SR-FULL (fix + re-ejecución 9b–9g) — **atendida**; fix verificado.
- `[CONSULTA]` asíncrona a AI-PLAT-OPS: ratificar la extensión del provisioner (`E2E_TECH2_*`), las credenciales E2E desalineadas y la instrumentación de la suite E2E en CI. Detalle en el informe §10/§14.4.
