# MOD10 Mesa de ayuda · Bandeja con colas de trabajo · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo: prueba roja, código mínimo, prueba verde, conteo real.

**Objetivo:** que al entrar a la Mesa de ayuda se vean los tickets y las colas que dicen qué atender, qué vence y qué está sin asignar, sin perder ningún indicador, filtro ni enlace.
**Spec:** [2026-11-18-mod10-bandeja-colas-de-trabajo-ux](../specs/2026-11-18-mod10-bandeja-colas-de-trabajo-ux.md) v1.0 (G0 2026-11-18)
**Launcher:** [PROMPT-MOD10-BANDEJA-COLAS-LAUNCH-v1.0](../prompts/PROMPT-MOD10-BANDEJA-COLAS-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §3, último párrafo.

## 1. Reglas

- `main` sin ramas ni worktrees (el hook `guard-bash` los bloquea); sin commit ni push hasta que el usuario lo pida; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- El árbol puede tener cambios de otras sesiones: no revertirlos ni reformatearlos; al commitear, índice temporal y nunca `git add -A`.
- Jest sin caché con conteo real; integración con `NODE_ENV=test DB_NAME=test E2E_TENANT_SLUG=test`; suite completa de la API si cambia un `@Module`.
- Los mocks de `useRouter`, `useAuth` y `usePermissions` devuelven una referencia estable: lo exige `jest-context-mocks-stable.structure.spec.ts` (rojo en CI el 2026-11-18).
- Una prueba de integración del worker conecta con el rol migrador, no con `DB_USER`.
- Las E2E usan el puerto 3002 del `pnpm dev` del usuario: acordar la ventana.
- Un CI rojo se diagnostica leyendo el archivo en el commit que corrió (`git show <sha>:ruta`), no el árbol de trabajo.
- Sin Prettier sobre `docs/`. El paso 2 no lleva migración: si un bloque necesita índice o esquema, se detiene y avisa.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** No regresión | CA-1 | Línea base con conteo real de `apps/portal/src/components/assurance` y `components/dashboard` (enlaces de H10). Prueba de inventario de indicadores, filtros, columnas y acciones sobre el código actual. Lista de las E2E que tocan la bandeja (parte de `e2e/tests/portal-assurance.spec.ts`) | `sr-qa` |
| **P1** Bandeja, paso 1 | §3 A–I | `AssuranceClient.tsx`, `AssuranceTicketsTable.tsx`, `assurance-labels.ts` y sus specs; colas con `PortalFilterChip`, siguiendo `crm/subscribers/SubscriberQueueChips.tsx`. Orden interno: tabla y «Vence» → colas y filtros → cabecera y resumen plegado → «Asignarme» → vocabulario | `fe-platform` |
| **QA1** | CA-1 a CA-9 | Inventario en verde tras P1; medición en navegador a 1440×900 y 375 px con captura; axe en claro y oscuro; E2E de W0 actualizadas | `sr-qa` |
| **API** Datos, paso 2 | §3 J–L, §4 | Pasada regla → dato con cruce de DTO y origen; contrato en `packages/shared`; parámetro de cola y de búsqueda en el listado; conteo por cola en el resumen con agregados SQL (`assurance-dashboard.service.ts`); nombre del cliente por fila con la regla de nulo del detalle; OpenAPI | `sr-backend` (consulta `sec-eng`) |
| **P2** Bandeja, paso 2 | §3 J–L | Colas Sin asignar y Vencidos, conteos en todas las colas, búsqueda de servidor en la URL y cliente en la fila, contra el contrato de API | `fe-platform` |
| **QA2** | CA-10 a CA-13 | Conteo de cada cola igual al total de su lista; búsqueda sin fuga entre tenants; nombre ausente con titular bloqueado; regresión de QA1 | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 | — |
| 2 | P1 | W0 |
| 3 | QA1 · revisores · **punto de control con el usuario** | 2 |
| 4 | API | 3 |
| 5 | P2 | API congelado y revisado |
| 6 | QA2 · revisores · informe de cierre | 5 |

**Ruta crítica:** W0 → P1 → QA1 → API → P2 → QA2. El paso 1 (olas 1–3) es entregable por sí solo. A diferencia del frente anterior, la API pasa por sus revisores **antes** de publicarse.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias (leer antes de escribir código) | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA1, QA2 | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence`, `wcag-audit-patterns` | `verification-before-completion`; subagente `e2e-triage` si una E2E falla; `anthropic-skills:built-in-browser` para las mediciones (solo Claude Code) | `iwana-matriz-motivos` (no cruza MOD11↔MOD12) |
| P1, P2 | `fe-platform` | `frontend-dev-guidelines`, `tailwind-patterns`, `system-vocabulary-review`, `iwana-identity-ui-review` | `testing-patterns`; `frontend-security-coder` en P2 (nombre del cliente) | `core-components` (sin primitives ni variantes nuevas; si hiciera falta una, parar y pedir `ds-owner`), `i18n-localization` (el tiempo relativo usa el formateador que ya existe en el portal) |
| API | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `postgresql`, `testing-patterns` | `typescript-expert` | `iwana-tenant-migration` (sin esquema nuevo), `bullmq-specialist` (sin colas de mensajes), `auth-implementation-patterns` (no toca acceso) |
| Revisión | `test-change-reviewer` (P1, P2), `boundary-reviewer`, `contract-drift-reviewer` y `sec-eng` (API), `gate-verifier`, `docs-governance` (cierre) | `requesting-code-review` | — | — |

Script de gate: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos de P1 y P2.

## 5. Gates

- **G6 del paso 1 (ola 3):** conteo ≥ línea base de W0; CA-1 a CA-9; al menos 6 filas visibles a 1440×900, con captura; `audit-ui.mjs` sin hallazgos; `test-change-reviewer` sin ajustes sin motivo; suite unitaria completa del portal en verde (incluye las guardas estructurales).
- **Punto de control:** el usuario ve el paso 1 en su portal antes de la ola 4.
- **Antes de P2:** contrato de datos congelado; `boundary-reviewer`, `contract-drift-reviewer` y `sec-eng` GO sobre la API.
- **G6 del paso 2 (ola 6):** CA-10 a CA-13; prueba de que la búsqueda y el nombre no cruzan tenants ni saltan el bloqueo.
- **G6.5:** solo tras push autorizado y CI de `main` en verde, citando el run.

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Una cola simulada en el cliente muestra un conteo falso | D3: Sin asignar y Vencidos no se muestran hasta el paso 2; conteo solo donde el servidor lo da |
| R2 | Cambiar el significado de «Abiertos» rompe los enlaces del inicio | CA-4; `?status=OPEN` sigue filtrando por estado, sin reinterpretarse |
| R3 | El resumen en SQL da cifras distintas a las de hoy | Prueba de integración que compara ambas sobre los mismos datos antes de retirar la carga en memoria |
| R4 | La búsqueda por cliente filtra datos de titulares bloqueados | Regla de nulo del detalle, permiso `crm.subscribers.read` y `sec-eng` |
| R5 | Los renombres rompen E2E que buscan texto | W0 lista los archivos; `test-change-reviewer` |
| R6 | La búsqueda por texto sin índice degrada con volumen | Se mide en la ola 4; si pide índice, se detiene y avisa (§1) |

## 7. Cierre

Informe `docs/informes/INFORME-MOD10-BANDEJA-COLAS-v1.0.md` con conteos, mediciones antes y después, y deudas. Frente siguiente ya identificado: consola de la orden de ejecución, con su propia spec.

## Lanzamiento

Espejo de [PROMPT-MOD10-BANDEJA-COLAS-LAUNCH-v1.0](../prompts/PROMPT-MOD10-BANDEJA-COLAS-LAUNCH-v1.0.md); el archivo prevalece si divergen.
