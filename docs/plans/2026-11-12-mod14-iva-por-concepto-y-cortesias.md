# MOD14 · IVA por concepto y cortesías · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente).

**Objetivo:** cada línea del cobro lleva el IVA de su concepto del catálogo, los adicionales se facturan y ADMIN/ACCOUNTANT pueden otorgar cortesías auditadas.
**Spec:** [2026-11-12-mod14-iva-por-concepto-y-cortesias](../specs/2026-11-12-mod14-iva-por-concepto-y-cortesias.md) (G0 2026-11-12)
**Launcher:** [PROMPT-MOD14-IVA-CONCEPTO-CORTESIAS-LAUNCH-v1.0](../prompts/PROMPT-MOD14-IVA-CONCEPTO-CORTESIAS-LAUNCH-v1.0.md)
**Publicación:** un solo commit y push al terminar todas las olas (decisión del usuario).

## 1. Reglas

`main` sin ramas; no commitear por ola; no `pnpm dev` ni `dev.mjs`; no matar procesos; jest sin caché con conteo real; integración `DB_NAME=test E2E_TENANT_SLUG=test`; suite completa si cambia un `@Module`; migración tenant desde 201; manifiesto de supresión e inventario K2 si hay columnas de texto o cifradas.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** | — | Línea base: generación, primer cobro, instalación, emisión, pagos, catálogo | `sr-qa` |
| **A** IVA por concepto | D1, D2, R1, R2, CA-1 | Tratamiento de IVA por ítem del catálogo (reutiliza `catalog-tax-contract`); instalación y adicionales lo congelan en el contrato; la línea de instalación deja de copiar el IVA del internet | `sr-backend` |
| **C** Adicionales facturados | D3, R3, CA-2 | Productos una vez, servicios cada periodo con prorrateo; idempotente; adiós «adicionales sin cobrar» | `sr-backend` |
| **D** Cortesías | D4, D5, R4, R5, CA-3, CA-4 | Permiso nuevo; línea negativa en borrador; ajuste no monetario en emitido; anulación; auditoría; estado de cuenta | `sr-backend` |
| **F** Portal | todas | Catálogo: IVA por ítem; cobro: líneas con su IVA; botón «Otorgar cortesía» con motivo; vista en documento y estado de cuenta | `fe-platform` |
| **QA** | CA-1–CA-4 | E2E y regresión W0 | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 · A | — |
| 2 | C · D | A |
| 3 | F | A, C, D |
| 4 | QA · revisores · commit y push | 1–3 |

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias | De apoyo |
|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | `e2e-triage` |
| A, C, D | `sr-backend` | `nestjs-expert`, `iwana-tenant-migration`, `postgresql`, `backend-security-coder`, `testing-patterns` | `openapi-spec-generation` |
| F | `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | `frontend-security-coder` |
| Revisión | `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `sec-eng` | — | — |

## 5. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | IVA de la instalación ligada a internet excluido | Configurable por ítem; confirmar con el contador antes de G7 |
| R2 | Cortesía sobre documento emitido sin soporte DIAN | Ajuste no monetario auditado; concepto contable pendiente |
| R3 | Doble cobro de adicionales | Idempotencia por contrato, ítem y periodo |

## 6. Línea base de pruebas (W0, 2026-11-12, HEAD `dbd5cb5f`)

| Paquete | Suites | Tests |
|---|---|---|
| api unit (billing, commercial, crm/contracts) | 75 | 993 |
| shared (`src/commercial`) | 1 | 3 |
| portal (billing, commercial, crm/subscribers, settings) | 82 | 766 |
| api integración (+ Redis índice 15) | 21 | 242 |
