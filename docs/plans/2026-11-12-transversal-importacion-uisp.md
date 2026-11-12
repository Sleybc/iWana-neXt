# Transversal · Importación desde UISP · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo.

**Objetivo:** importar clientes de UISP desde su ZIP por cliente, por lotes simulables, conciliables y reversibles, con etiquetas manuales, sin degradar datos ni consumir numeración DIAN.
**Spec:** [2026-11-10-transversal-exportacion-importacion-suscriptor-uisp](../specs/2026-11-10-transversal-exportacion-importacion-suscriptor-uisp.md) v1.1 (G0 2026-11-12) · **ADR:** [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md)
**Launcher:** [PROMPT-TRANSVERSAL-IMPORTACION-UISP-LAUNCH-v1.0](../prompts/PROMPT-TRANSVERSAL-IMPORTACION-UISP-LAUNCH-v1.0.md)
**Fuera de alcance:** exportación (§2, fase posterior), conector API de UISP y WispHub.

## 1. Reglas

- `main` sin ramas; commit por ola; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- Jest sin caché con conteo real; integración `DB_NAME=test`; suite completa si cambia un `@Module`.
- Migración tenant: último número 193. Columna nueva de texto o cifrada → manifiesto de supresión e inventario K2 en la misma ola.
- Fixtures **sintéticos** con la forma del ZIP real (spec §1); nunca datos de la muestra real.
- Ningún dato personal en logs ni payloads de cola.

## 2. Bloques

| Bloque | Spec / ADR | Superficie | Dueño |
|---|---|---|---|
| **W0** | — | Inventario de no regresión: alta manual de suscriptor, contrato, generación y emisión de cobro, pagos, tickets | `sr-qa` |
| **A** Esquema | D1–D5, D8, D10 | Migraciones: `migration_batches`, `migration_staging_records`, `migration_mappings`, etiquetas (`subscriber_tags`, asignaciones), `external_id` + `import_batch_id` con índice único parcial en contratos, documentos de cobro, pagos, tickets y soportes; estado `IMPORTADO` excluido de emisión, numeración, eventos y anulación; permiso `migration.import.manage` | `sr-backend` |
| **T** Etiquetas manuales | D8 | API CRUD de catálogo y asignación; ficha: chips con color y filtro en la lista | `sr-backend` + `fe-platform` |
| **B** Lectura y simulación | §1, §3.2, D2, D4, D9, D11 | Subida de ZIP cifrado; job BullMQ que parsea, valida y carga a intermedias; informe de simulación por entidad y motivo | `sr-backend` (consulta `data-eng`) |
| **C** Promoción, conciliación, reversión | §3.3, D3, D5–D7 | Promoción idempotente por `external_id`; facturas `IMPORTADO` con PDF; pagos y coberturas; tickets y documentos; conciliación por titular; reversión por lote; purga a 30 días | `sr-backend` |
| **F** Portal | D1, D4, D6, D7 | Ajustes → Importaciones: subir, simular, equivalencias, promover, conciliar, revertir; vocabulario en español | `fe-platform` |
| **QA** | CA-1, CA-3–CA-6 | E2E con ZIP sintético: simulación → promoción → conciliación → reversión; a11y | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 · A | — |
| 2 | T · B | A |
| 3 | C | B |
| 4 | F | B, C |
| 5 | QA · revisores · push | 1–4 |

**Ruta crítica:** A → B → C → F → QA.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | `e2e-triage`, `wcag-audit-patterns` | — |
| A, B, C, T(api) | `sr-backend` | `nestjs-expert`, `iwana-tenant-migration`, `postgresql`, `backend-security-coder`, `bullmq-specialist`, `testing-patterns` | `openapi-spec-generation` | `database-migration` (son tenant) |
| T(ui), F | `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | `frontend-security-coder`, `iwana-identity-ui-review` | `core-components` (sin primitives nuevas) |
| Revisión | `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `sec-eng`, `gate-verifier` | — | `data-eng` | — |

## 5. Gates

G6 por ola con conteo ≥ línea base e inventario W0 verde; migraciones up/down contra Postgres real; integración de promoción y reversión (CA-6); E2E antes del push; G6.5 con CI de `main` verde.

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Factura importada tratada como fiscal | Estado `IMPORTADO` excluido por prueba en emisión, numeración, eventos y anulación (CA-4) |
| R2 | Duplicar titulares existentes | Coincidencia por HMAC → conflicto, nunca fusión (D11) |
| R3 | Reversión que rompe datos nuevos | Bloqueo si algo posterior referencia la fila (D7) |
| R4 | PII en intermedias | Carga cifrada y purga a 30 días (D2, D10) |

## 7. Cierre

Informe `docs/informes/INFORME-TRANSVERSAL-IMPORTACION-UISP-CIERRE-v1.0.md` con conteos, CA y lo no verificado.
