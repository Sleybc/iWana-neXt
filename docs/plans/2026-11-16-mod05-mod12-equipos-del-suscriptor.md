# MOD05 · MOD12 · Equipos del suscriptor · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo: prueba roja, código mínimo, prueba verde, conteo real.

**Objetivo:** pestaña «Equipos» y tarjeta en la Vista general de la ficha del suscriptor, con equipos, materiales e historial leídos de MOD12.
**Spec:** [2026-11-16-mod05-mod12-equipos-del-suscriptor](../specs/2026-11-16-mod05-mod12-equipos-del-suscriptor.md) v1.0 (G0 2026-11-16)
**Launcher:** [PROMPT-MOD05-EQUIPOS-SUSCRIPTOR-LAUNCH-v1.0](../prompts/PROMPT-MOD05-EQUIPOS-SUSCRIPTOR-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §6.

## 1. Reglas

- Se trabaja en `main`, sin ramas. No se commitea hasta cerrar, salvo que el usuario lo pida. No se ejecutan `pnpm dev` ni `dev.mjs`, y no se matan procesos ajenos.
- El árbol tiene cambios sin commitear de otras tareas (billing, usuarios, expedientes, ficha MOD05). No se revierten ni se reformatean. F convive con los cambios de la ficha.
- Jest se corre sin caché y con conteo real. Integración con `NODE_ENV=test DB_NAME=test E2E_TENANT_SLUG=test IWANA_DB_INTEGRATION_AVAILABLE=true`. Si cambia un `@Module`, se corre la suite completa de la API.
- Migración tenant: solo si el `EXPLAIN` de A2 la justifica, y con la siguiente numeración libre al iniciar (hoy, 213).
- Boundary: el portal solo consume el endpoint de MOD12 y CRM no importa nada de `inventory`. Los IDs de OT y contrato viajan como referencias opacas.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** No regresión | — | Línea base con conteo real: `apps/api/src/modules/inventory`; portal `components/crm/subscribers` y `components/inventory` | `sr-qa` |
| **A1** Contrato | §2.1 | Tipos de respuesta en `@iwana/shared` (equipos, materiales e historial, con paginación), DTO y OpenAPI del endpoint; recompilar `@iwana/shared`. **Se congela al cerrar** | `sr-backend` |
| **DS** Timeline | §3 | Revisar y congelar el contrato de `PortalTimeline` (spec §3), por el carril rápido; anotarlo en el changelog del DS | `ds-owner` |
| **A2** Endpoint | §2.1, §4 | Servicio de lectura en MOD12: comodatos con datos del activo, materiales por `CUSTOMER_SITE`, historial recortado por periodo de comodato, sin `notes`; `EXPLAIN` y, si hace falta, índice; pruebas de integración CA-4 y CA-5 | `sr-backend` (consulta `sec-eng` §4) |
| **F1** Primitive | §3 | `PortalTimeline` en `portal-ui.tsx` con sus estados y pruebas | `fe-platform` |
| **F2** Ficha | §2.2–§2.4 | Pestaña «Equipos» (con `INVENTORY_STOCK_READ`), tarjeta en la Vista general, menú ⋯ con el drawer existente y función estado → `Badge` en `inventory-labels.ts`. Desarrollo con mocks derivados de los tipos de A1 | `fe-platform` |
| **D** Docs | §1 D6 | Nota en el PRD de comodato: `/loans` también admite TECHNICIAN y AUDITOR | `sr-backend` |
| **QA** | §5 | Pruebas de componente de los estados; E2E (abrir la ficha, ver la tarjeta, abrir la pestaña y la ficha del equipo); a11y; trazabilidad CA → prueba | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 · A1 · DS | G0 de la spec |
| 2 | A2 · F1 · F2 · D | A1 (contrato) y DS (primitive); F2 usa F1 |
| 3 | QA · revisores · informe | 1–2 |

**Ruta crítica:** A1 → A2 → QA. F1 y F2 corren en paralelo a A2 contra el contrato congelado.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias (leer antes de escribir código) | De apoyo (condición) | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence`, `wcag-audit-patterns` | subagente `e2e-triage` si una E2E falla | `iwana-matriz-motivos` (no hay motivos de rechazo MOD11↔MOD12: solo lectura) |
| A1 | `sr-backend` | `openapi-spec-generation`, `typescript-expert` | — | `auth-implementation-patterns` (no cambian los permisos) |
| A2 | `sr-backend` | `nestjs-expert`, `postgresql`, `backend-security-coder`, `testing-patterns` | `iwana-tenant-migration` (solo si el `EXPLAIN` exige índice) | `database-migration` (sería tenant), `bullmq-specialist` (no hay colas) |
| DS | `ds-owner` | `core-components`, `iwana-identity-ui-review` | — | `tailwind-patterns` (no escribe clases) |
| F1, F2 | `fe-platform` | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `system-vocabulary-review`, `frontend-security-coder` | `tailwind-patterns` (variantes del nodo de F1) | `core-components` (no se toca `@iwana/ui`), `i18n-localization` (no hay catálogos nuevos) |
| D | `sr-backend` | `docs-architect` | — | — |
| Revisión | `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `sec-eng`, `gate-verifier` | `requesting-code-review`; `sec-eng` usa `security-auditor` | — | — |

Gate ejecutable: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos de F1 y F2.

## 5. Gates

- **G0:** el usuario aprueba la spec. Sin G0 no se lanza nada.
- **Fin de ola 1:** contrato A1 congelado, citado por ruta, y contrato DS congelado (spec §3, v1.0 o la versión que emita `ds-owner`).
- **G6 por ola:** conteo mayor o igual a la línea base W0. En la ola 2, las pruebas CA-4 (equipo que pasó por dos clientes) y CA-5 (otro tenant) en verde contra Postgres real.
- **Antes de cerrar:** E2E en verde, `audit-ui.mjs` sin hallazgos, `sec-eng` GO (incluye el dictamen de bloqueo de la spec §4) y `boundary-reviewer` sin hallazgos.
- **G6.5:** solo tras un push autorizado y con el CI de `main` en verde.

## 6. Riesgos

Spec §7.

## 7. Cierre

Informe `docs/informes/INFORME-MOD05-EQUIPOS-SUSCRIPTOR-v1.0.md` con conteos, dictamen de `sec-eng`, deudas (las cuatro timelines por migrar) y la fase 2 pendiente de G0.

## Lanzamiento

Espejo de [PROMPT-MOD05-EQUIPOS-SUSCRIPTOR-LAUNCH-v1.0](../prompts/PROMPT-MOD05-EQUIPOS-SUSCRIPTOR-LAUNCH-v1.0.md); el archivo prevalece si divergen.
