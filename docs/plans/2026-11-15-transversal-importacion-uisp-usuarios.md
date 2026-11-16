# Transversal · Importación UISP: usuarios del personal · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo: prueba roja, código mínimo, prueba verde, conteo real.

**Objetivo:** traer por API el personal de UISP (activos e inactivos), revisarlo en iWana con rol elegido a mano, invitar solo a quien se decida y atribuir tickets, comentarios y pagos importados a su usuario real.
**Spec:** [2026-11-15-transversal-importacion-uisp-usuarios](../specs/2026-11-15-transversal-importacion-uisp-usuarios.md) v1.0 (G0 2026-11-15) · **ADR:** [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) v1.2 D15
**Launcher:** [PROMPT-TRANSVERSAL-IMPORTACION-UISP-USUARIOS-LAUNCH-v1.0](../prompts/PROMPT-TRANSVERSAL-IMPORTACION-UISP-USUARIOS-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §8.

## 1. Reglas

- `main` sin ramas; sin commit hasta cerrar el módulo, salvo que el usuario lo pida; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- El árbol tiene cambios sin commitear de otras sesiones (billing, ficha MOD05): no tocarlos ni reformatearlos.
- Jest sin caché con conteo real; integración `DB_NAME=test E2E_TENANT_SLUG=test`; suite completa de la API si cambia un `@Module`.
- Migración tenant: la última es la 210; esta fase usa la **211**. Columnas cifradas nuevas → manifiesto de supresión e inventario K2 en la misma ola.
- UISP falso para pruebas (servidor HTTP local); **nunca** llamar a la instancia real 190.0.241.109 desde pruebas ni agentes.
- Sin PII ni la clave de UISP en logs, payloads de cola, auditoría, `counts` ni `migration_mappings`.
- Boundaries: la migración usa puertos hacia Usuarios, Soporte y Facturación; nada de SQL sobre tablas ajenas.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** No regresión | — | Línea base con conteo real: unitarias `apps/api/src/modules/{migration,users,assurance/migration-adapters,billing/migration-adapters}`; integración de migración; portal `components/settings/migration` y `components/users`; E2E `portal-importacion-uisp-live.spec.ts` | `sr-qa` |
| **A** Contrato y esquema | §2.5, §3 | `packages/shared` (contratos de conexión sin la clave en respuestas, fila de revisión, acciones, kind `USUARIO`, observación `USUARIO_UISP_SIN_ENLAZAR`, códigos de error). Migración tenant **211**: `migration_source_connections`, `migration_uisp_users`, `chk_migration_mappings_kind` + `USUARIO`; manifiesto de supresión e inventario K2. Recompilar `@iwana/shared`. | `sr-backend` |
| **B** Conexión y lectura | §2.1, §2.2 | Endpoints de conexión (guardar, probar con `/version`, retirar); cliente HTTP de UISP (tiempo de espera, reintentos acotados, huella TLS fijada, sin registrar la clave); job BullMQ con payload solo de ids; filas de revisión por número de UISP; coincidencia por HMAC del correo con Usuarios (puerto); filas «sin datos» desde las intermedias vigentes; lista de revisión | `sr-backend` (consulta `sec-eng` por TLS) |
| **C** Resolver e invitar | §2.3–§2.5 | Puerto de Usuarios para crear usuario importado (activo → `PENDING_VERIFICATION`; inactivo → `INACTIVE`, `is_operational_resource=false`; contraseña inutilizable; correo `uisp-<id>@importado.invalid` si falta o choca) e invitar con `emailVerificationTemplate`; acciones enlazar/crear/descartar/invitar en lote; equivalencia `USUARIO`; purga de PII de la fila al resolver; el mailer no envía a `.invalid` | `sr-backend` |
| **D** Atribución | §2.6, §2.7 | Promoción: asignado, autor de comentarios, creador del ticket y registrador del pago por equivalencia `USUARIO`; conteo de no enlazados. «Actualizar autores» por lote vía puertos de Soporte y Facturación: solo filas que siguen a nombre de quien importó; idempotente; auditado | `sr-backend` |
| **F** Portal | §2.1–§2.4, §2.7 | Configuración → Importaciones → «Usuarios de UISP»: conexión (la clave nunca se muestra), traer, lista de revisión con selección múltiple de rol, enlazar/crear/descartar, invitar; botón «Actualizar autores» y conteo en el detalle del lote | `fe-platform` |
| **QA** | §5, §6 | Integración con UISP falso (activo, inactivo, «sin datos», 401, huella distinta); promoción con atribución; «Actualizar autores» idempotente y respetuoso; E2E del aprovisionador con UISP falso | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 · A | — |
| 2 | B · D | A (D solo usa la equivalencia `USUARIO`) |
| 3 | C · F | B (C escribe sobre las filas de B; F contra el contrato congelado en A) |
| 4 | QA · revisores · cierre documental | 1–3 |

**Ruta crítica:** A → B → C → QA. D y F corren en paralelo.
**Sincronización:** el contrato queda congelado al cerrar A; cualquier cambio exige re-sync de B, C, D y F. B y D tocan archivos distintos: D es dueño de `migration-promotion.service.ts`, y B de la conexión, el cliente y el job.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias (leer antes de escribir código) | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | `wcag-audit-patterns`; subagente `e2e-triage` si una E2E falla | `iwana-matriz-motivos` (no cruza MOD11↔MOD12) |
| A | `sr-backend` | `iwana-tenant-migration`, `postgresql`, `typescript-expert` | `openapi-spec-generation` | `database-migration` (es tenant) |
| B | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `bullmq-specialist`, `testing-patterns` | `observability-engineer` (sin PII en logs) | `auth-implementation-patterns` (no toca login) |
| C | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `auth-implementation-patterns` (estado y activación de usuarios), `testing-patterns` | `system-vocabulary-review` (correo) | `bullmq-specialist` (sin colas nuevas) |
| D | `sr-backend` | `nestjs-expert`, `testing-patterns` | `systematic-debugging` | `auth-implementation-patterns` (no cambia permisos) |
| F | `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `iwana-identity-ui-review`, `frontend-security-coder` | `testing-patterns` | `core-components` (sin primitives nuevas) |
| Revisión | `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `sec-eng`, `gate-verifier` | `requesting-code-review` | `data-eng` | — |

Script de gate: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos de F.

## 5. Gates

- **G6 por ola:** conteo ≥ línea base de W0; migración 211 up/down contra Postgres real.
- **Ola 3:** ninguna respuesta, log ni auditoría contiene la clave de UISP (prueba explícita); un inactivo nunca queda `is_operational_resource`.
- **Antes de cerrar:** E2E del aprovisionador con UISP falso en verde; `audit-ui.mjs` sin hallazgos; `sec-eng` GO.
- **G6.5:** solo tras push autorizado y CI de `main` en verde (`gh run list --commit`).

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | La API no devuelve eliminados | Filas «sin datos» desde los lotes (B) |
| R2 | Fuga de la clave de UISP | Cifrada, nunca devuelta, solo `GET`, prueba de ausencia en logs (gate ola 3) |
| R3 | Certificado autofirmado | Huella fijada; prueba de rechazo con huella distinta |
| R4 | Invitación indebida | Sin envío automático; mailer bloquea `.invalid` |
| R5 | Re-atribución que pisa cambios | Solo filas aún a nombre de quien importó; prueba |
| R6 | Deriva de contrato entre A y B/C/D/F | Contrato congelado en A; `contract-drift-reviewer` |

## 7. Cierre

Informe `docs/informes/INFORME-TRANSVERSAL-IMPORTACION-UISP-USUARIOS-v1.0.md` con conteos reales y deudas, y un runbook breve para crear la clave de aplicación en UISP. La conexión con la instancia real y la revisión de los 62 usuarios las hace el usuario, en su tenant.

## Lanzamiento

Espejo de [PROMPT-TRANSVERSAL-IMPORTACION-UISP-USUARIOS-LAUNCH-v1.0](../prompts/PROMPT-TRANSVERSAL-IMPORTACION-UISP-USUARIOS-LAUNCH-v1.0.md); el archivo prevalece si divergen.
