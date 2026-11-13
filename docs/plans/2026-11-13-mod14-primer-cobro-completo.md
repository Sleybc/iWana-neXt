# MOD14 · Primer cobro completo · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente).

**Objetivo:** el primer cobro muestra el valor real de la instalación (materiales y equipos de la OT, informativo) y los pagos de empresas registran retenciones.
**Spec:** [2026-11-13-mod14-primer-cobro-completo](../specs/2026-11-13-mod14-primer-cobro-completo.md) (G0 2026-11-13)
**Launcher:** [PROMPT-MOD14-PRIMER-COBRO-COMPLETO-LAUNCH-v1.0](../prompts/PROMPT-MOD14-PRIMER-COBRO-COMPLETO-LAUNCH-v1.0.md)
**Publicación:** un solo commit y push al terminar.

## 1. Reglas

`main` sin ramas; no `pnpm dev` ni `dev.mjs`; no matar procesos; jest sin caché con conteo real; integración `DB_NAME=test`; suite completa si cambia un `@Module`; migraciones tenant desde 205; manifiesto de supresión si hay texto libre (número de certificado).

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** | — | Línea base: cierre de OT con consumo, primer cobro, pagos | `sr-qa` |
| **A** Consumo al contrato | R1, R2 | Al cerrar la OT de instalación, puerto de Tareas/Inventario → Billing con consumo y valor de referencia congelado | `sr-backend` |
| **B** Desglose informativo | R3–R5, CA-1–3 | Tabla de desglose por documento; generación y OT tardía; PDF del documento | `sr-backend` |
| **C** Retenciones | R6–R8, CA-4–5 | Líneas de retención en el pago, presets de Tributación, estado de cuenta, anulación | `sr-backend` |
| **F** Portal | todas | Desglose en documento y ficha; retenciones en el diálogo de pago y estado de cuenta | `fe-platform` |
| **QA** | CA-1–5 | E2E y regresión | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 · A · C | — |
| 2 | B | A |
| 3 | F | B, C |
| 4 | QA · revisores · commit y push | 1–3 |

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias | De apoyo |
|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | `e2e-triage`, `iwana-matriz-motivos` |
| A, B, C | `sr-backend` | `nestjs-expert`, `iwana-tenant-migration`, `postgresql`, `backend-security-coder`, `testing-patterns` | `openapi-spec-generation`, `bullmq-specialist` |
| F | `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | `frontend-security-coder` |
| Revisión | `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `sec-eng` | — | `data-eng` |

## 5. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | El desglose altere montos fiscales | Tabla aparte, sin líneas de cobro; prueba de total invariante |
| R2 | Acoplar Billing a Tareas/Inventario | Solo por puerto con datos congelados al cierre de la OT |
| R3 | Retención mal calculada | Tarifas sugeridas editables; certificado obligatorio; auditoría |

## 6. Línea base de pruebas (W0, 2026-11-13, HEAD `5c46b981`)

| Paquete | Suites | Tests |
|---|---|---|
| api unit (tasks, inventory, billing, taxation) | 161 | 2439 |
| worker (execution-order, contract-pdf) | 9 | 108 |
| portal (billing, operations, crm/subscribers) | 111 | 1440 |
| api integración (CI 43301825858) | 100 + 5 omitidas | 706 + 31 omitidos |

`close-by-result` falla en la base `test` local por datos viejos (pasa en CI); `ola3d` e `item-usage-projection` exigen `i4_qa_*` y quedan para la ola 4.
