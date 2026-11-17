# MOD05 Suscriptores · Rediseño de la pestaña Soporte · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo: prueba roja, código mínimo, prueba verde, conteo real.

**Objetivo:** que quien atiende vea los tickets que importan sin desplazar, con responsable y orden correctos, y cree un ticket con ≤ 6 campos, sin perder ningún dato, acción ni permiso de la v1.0.
**Spec:** [2026-11-17-mod05-pestana-soporte-rediseno-ux](../specs/2026-11-17-mod05-pestana-soporte-rediseno-ux.md) v1.0 — **G0 ✅ 2026-11-17** (D1–D5 según la recomendación de la spec §14)
**Launcher:** [PROMPT-MOD05-PESTANA-SOPORTE-REDISENO-LAUNCH-v1.0](../prompts/PROMPT-MOD05-PESTANA-SOPORTE-REDISENO-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §15.

## 1. Reglas

- `main` sin ramas; sin commit hasta que el usuario lo pida; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- **Cruce con MOD10 (detalle del ticket, otra sesión):** `AssuranceCreateTicketForm.tsx`, `AssuranceTicketsTable.tsx`, `assurance-labels.ts`, `assurance-ui.tsx` y `AssuranceTicketDrawer.tsx` están modificados sin commit por esa sesión. Ningún bloque de este plan los toca hasta que MOD10 paso 2 se publique o el usuario abra la ventana. El drawer no se modifica en ningún caso (spec §6).
- Revisar el índice antes de cualquier commit (`GIT_INDEX_FILE` si hay archivos mixtos).
- Jest sin caché con conteo real; las E2E usan el puerto 3002 del usuario: acordar la ventana.
- Los datos de prueba del análisis (TK-20261117-001…005 en el tenant `srqa-mod11-r5-20261006`, suscriptor `24a7d11a…`) sirven para medir; no son fixtures.
- Sin Prettier sobre `docs/`.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** No regresión | CA-1 | Línea base con conteo real de `apps/portal/src/components/{crm/subscribers,assurance}`; prueba de inventario de la v1.0 (datos, acciones, permisos, estados de §4 v1.0) sobre el código actual; lista de E2E afectadas (parte de `e2e/tests/portal-mod05-pestana-soporte.spec.ts`) | `sr-qa` |
| **M** Modelo | §5.1, §5.2, D1, D2 | `apps/portal/src/components/assurance/assurance-ticket-model.ts`: dos predicados (activo / resuelto-o-cerrado), plazo, orden de 4 claves; migra consumidores (`SubscriberTicketsSection`, `SubscriberOverviewCards`, `AssuranceTicketDetail`); fecha con `formatAssuranceDate` | `fe-platform` |
| **T** Lista densa | §3 A, §4, §5.3, §7, §11 | `TicketListItem.tsx` (API del dictamen §5.4), franja de resumen, chips/filtros en URL, búsqueda local, carga de usuarios al montar con `MANAGE` o `USERS_READ`, aviso de éxito descartable; `SubscriberTicketsSection.tsx`, `SubscriberSupportTab.tsx` | `fe-platform` |
| **V** Visitas | §3, §5.4 | Sección compacta bajo la lista; `VisitDetailPanel` → `PortalSidePeek`; `SubscriberVisitsSection.tsx` | `fe-platform` |
| **C** Crear desde ficha | §8 | Modo «desde suscriptor» de `AssuranceCreateTicketForm.tsx`; rótulos en la fuente; badges compartidos en `AssuranceTicketsTable.tsx`. **Bloqueado por el cruce con MOD10 (§1)** | `fe-platform` |
| **QA1** | CA-1 a CA-14 | Inventario en verde; prueba de orden y predicados; medición en navegador a 1440×900 y 375×812 con captura; axe claro/oscuro; CA-14 en compilación de producción; E2E de W0 actualizadas | `sr-qa` |
| **API** Paso 2 | §16 B-1 a B-3 | Pasada regla → campo con cruce DTO ↔ origen; proyección en el listado de `apps/api/src/modules/assurance` (nombre del responsable, resumen de trabajo de campo por puertos de WFM y tareas); total/orden; contrato en `packages/shared`; OpenAPI | `sr-backend` (consulta `sec-eng`) |
| **P2** Portal paso 2 | CA-15, CA-16, D4 | Fila con nombre sin `USERS_READ` e indicador con fecha y número de orden; enlace «Ver todos en Mesa de ayuda» o paginación según D4 | `fe-platform` |
| **QA2** | CA-15, CA-16 + regresión QA1 | Conteo real, navegador, E2E | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 0 | **G0 del usuario** (D1–D5) ✅ 2026-11-17 | — |
| 1 | W0 · M | G0 |
| 2 | T → V (mismo agente, en secuencia) | M; W0 |
| 3 | C | MOD10 paso 2 publicado o ventana del usuario |
| 4 | QA1 · revisores · **punto de control con el usuario** | 2–3 |
| 5 | API · (P2 tras API congelado) | 4 |
| 6 | QA2 · revisores · informe de cierre | 5 |

**Ruta crítica:** G0 → M → T → V → QA1. El paso 1 sin C (olas 1–2 + QA1 parcial) es entregable si MOD10 tarda; C entra después con su propia QA.
**Paralelo:** W0 ∥ M; API puede adelantarse a la ola 3 si el usuario lo pide (no depende del portal).

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias (leer `SKILL.md` antes de escribir código) | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA1, QA2 | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence`, `wcag-audit-patterns` | `verification-before-completion`; subagente `e2e-triage` si una E2E falla; `anthropic-skills:built-in-browser` para medir | `iwana-matriz-motivos` (no cruza MOD11↔MOD12) |
| M, T, V, C, P2 | `fe-platform` | `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `system-vocabulary-review`, `iwana-identity-ui-review` | `testing-patterns`; `frontend-security-coder` en T (búsqueda local, filtros en URL sin PII) | `i18n-localization` (sin catálogos ni formatos nuevos); `ui-ux-pro-max` (la dirección ya está fijada) |
| API | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `typescript-expert`, `testing-patterns` | `postgresql` (solo si la lectura pide índice) | `iwana-tenant-migration` (sin esquema nuevo; si hace falta, parar y avisar), `bullmq-specialist` (sin colas), `auth-implementation-patterns` (no cambia acceso) |
| Revisión | `test-change-reviewer` (M, T, C), `boundary-reviewer` y `contract-drift-reviewer` (API, P2), `sec-eng` (API: nombres de usuarios en listado), `gate-verifier`, `docs-governance` (cierre) | `requesting-code-review` | — | — |

Script de gate: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos de T, V, C y P2.

## 5. Gates

| Gate | Condición |
|---|---|
| G0 | Usuario resuelve D1–D5 y aprueba la spec |
| G3 | Ola 2 con inventario CA-1 en verde y conteo real |
| G6 | QA1 completo (CA-1 a CA-14), revisores sin hallazgos P0/P1, `audit-ui.mjs` limpio |
| G6.5 | Tras push: CI de `main` en verde (`gh run`), no antes |
| G7 | No aplica (sin despliegue; diferido hasta la beta) |

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Choque de archivos con MOD10 | Bloque C bloqueado; M/T/V no tocan archivos de MOD10 salvo `AssuranceTicketDetail.tsx` (solo import del modelo): coordinar con esa sesión antes |
| R2 | CA-2/CA-10 no alcanzables sin D3 (cabecera de la ficha) | Medir tras T; si no llega, el CA se registra con la cifra y D3 se abre como enmienda aparte |
| R3 | «Responsable no disponible» frecuente para quien no lee usuarios | Es estado transitorio documentado hasta B-1 |
| R4 | Cambiar D1 altera cifras de la Vista general | CA-6 exige los tres consumidores a la vez |

## Lanzamiento

Ver el [launcher](../prompts/PROMPT-MOD05-PESTANA-SOPORTE-REDISENO-LAUNCH-v1.0.md); el archivo prevalece si divergen.
