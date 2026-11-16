# MOD09 Soporte · Adjuntos en tickets · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo: prueba roja, código mínimo, prueba verde, conteo real.

**Objetivo:** adjuntar fotos, PDF y videos a los comentarios de tickets, con cuarentena y descarga firmada, e importarlos desde UISP.
**Spec:** [2026-11-16-mod09-adjuntos-en-tickets](../specs/2026-11-16-mod09-adjuntos-en-tickets.md) v1.0 (G0 2026-11-16)
**Launcher:** [PROMPT-MOD09-ADJUNTOS-TICKETS-LAUNCH-v1.0](../prompts/PROMPT-MOD09-ADJUNTOS-TICKETS-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §7.

## 1. Reglas

- `main` sin ramas; sin commit hasta cerrar el módulo, salvo que el usuario lo pida; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- El árbol tiene cambios sin commitear de otras tareas (billing, ficha MOD05, pestaña Soporte de la ficha): no revertirlos ni reformatearlos; F convive con los de Soporte.
- Jest sin caché con conteo real; integración con el env cargado por `process.loadEnvFile` y `NODE_ENV=test DB_NAME=test E2E_TENANT_SLUG=test IWANA_DB_INTEGRATION_AVAILABLE=true`; suite completa de la API si cambia un `@Module`.
- Migración tenant: la última es la 211; esta fase usa la **212**. Columnas nuevas de texto o cifradas → manifiesto de supresión e inventario K2 en la misma ola.
- Archivos de prueba sintéticos (imágenes, PDF y MP4 mínimos generados en la prueba); nunca los adjuntos reales del cliente 22.
- Boundaries: Assurance usa el módulo de medios por su puerto; la migración usa el puerto de Soporte para crear adjuntos importados.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** No regresión | — | Línea base con conteo real: `apps/api/src/modules/{assurance,media,migration}`; integración de assurance y migración; portal `components/assurance` y `components/crm/subscribers`; E2E de tickets e importación UISP | `sr-qa` |
| **A** Contrato y esquema | §2.1, §3 | `MediaUsage.TICKET_ATTACHMENT`; esquema del adjunto y estados; conteo en el ticket; motivos de importación. Migración tenant **212** `ticket_comment_attachments`. Supresión y K2. Recompilar `@iwana/shared` | `sr-backend` |
| **B** Media y Soporte | §2.1, §2.2, §2.4, §2.5 | Uso `TICKET_ATTACHMENT` con límites por tipo y validación MP4 (`ftyp`); cuarentena reutilizada; crear comentario con adjuntos (multipart, todo o nada, `Content-Length` validado antes de leer); listar adjuntos del comentario y del ticket; enlace firmado respetando la visibilidad interna; conteo en el listado; participante de supresión | `sr-backend` (consulta `sec-eng`) |
| **C** Importación | §2.3 | Promoción: adjuntos de cada comentario desde `tickets/<ticket>/<filename>`, idempotentes por `external_id`; conteo de no importados por motivo; reversión que retira filas y archivos | `sr-backend` |
| **F** Portal | §2.2 | Selector en el comentario con validación previa (tipo, tamaño, 10 máx.); adjuntos bajo cada comentario (miniatura, video, PDF; en revisión y bloqueado); sección «Adjuntos (N)»; clip en la lista de la ficha | `fe-platform` |
| **I** Infra | §2.5 | nginx de producción: `client_max_body_size 110M` solo en la ruta de comentarios con adjuntos | `plat-ops` |
| **QA** | §5, §6 | Integración (comentario con adjuntos, visibilidad, importación idempotente, reversión, supresión); E2E (subir y abrir; importación sintética con adjuntos); a11y | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 · A | — |
| 2 | B · I | A |
| 3 | C · F | B (C usa el puerto de Soporte; F contra el contrato congelado en A y los endpoints de B) |
| 4 | QA · revisores · cierre y reimportación del cliente 22 (con el usuario) | 1–3 |

**Ruta crítica:** A → B → C → QA. F corre en paralelo a C; I, en paralelo a B.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias (leer antes de escribir código) | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | `wcag-audit-patterns`; subagente `e2e-triage` si una E2E falla | `iwana-matriz-motivos` (no cruza MOD11↔MOD12) |
| A | `sr-backend` | `iwana-tenant-migration`, `postgresql`, `typescript-expert` | `openapi-spec-generation` | `database-migration` (es tenant) |
| B, C | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `testing-patterns` | `bullmq-specialist` (solo si la cuarentena encola análisis) | `auth-implementation-patterns` (no toca acceso) |
| F | `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `iwana-identity-ui-review`, `frontend-security-coder` | `testing-patterns` | `core-components` (sin primitives nuevas) |
| I | `plat-ops` | `docker-expert` | — | — |
| Revisión | `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `sec-eng`, `gate-verifier` | `requesting-code-review` | — | — |

Script de gate: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos de F.

## 5. Gates

- **G6 por ola:** conteo ≥ línea base de W0; migración 212 up/down contra Postgres real.
- **Ola 2:** prueba de que un adjunto de comentario interno no se descarga sin permiso, y de que un archivo con firma falsa se rechaza.
- **Antes de cerrar:** E2E en verde, `audit-ui.mjs` sin hallazgos y `sec-eng` GO.
- **G6.5:** solo tras push autorizado y CI de `main` en verde.

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Archivo malicioso | Firma real, cuarentena y descarga solo firmada |
| R2 | Fuga de adjuntos internos | Mismos permisos que el comentario; prueba de gate |
| R3 | Subidas grandes que agotan memoria | `Content-Length` antes de leer; límites por tipo; 110M solo en la ruta |
| R4 | Duplicar adjuntos al reimportar | `external_id` con índice único parcial |
| R5 | Datos personales en nombres y archivos | Supresión y manifiesto; K2 |

## 7. Cierre

Informe `docs/informes/INFORME-MOD09-ADJUNTOS-TICKETS-v1.0.md` con conteos y deudas. Revertir y reimportar el lote del cliente 22 se hace con el usuario, en su tenant.

## Lanzamiento

Espejo de [PROMPT-MOD09-ADJUNTOS-TICKETS-LAUNCH-v1.0](../prompts/PROMPT-MOD09-ADJUNTOS-TICKETS-LAUNCH-v1.0.md); el archivo prevalece si divergen.
