# MOD05 ↔ MOD14 · Facturación en la ficha estilo UISP · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente).

**Objetivo:** Documentos solo con archivos y Facturación dividida en Facturas, Pagos y Estado de cuenta, con recibo numerado, libro con saldo corrido, envíos por correo y desasociar pago.
**Spec:** [2026-11-13-mod05-mod14-facturacion-en-la-ficha-estilo-uisp](../specs/2026-11-13-mod05-mod14-facturacion-en-la-ficha-estilo-uisp.md) (G0 2026-11-13)
**Launcher:** [PROMPT-MOD05-MOD14-FACTURACION-FICHA-LAUNCH-v1.0](../prompts/PROMPT-MOD05-MOD14-FACTURACION-FICHA-LAUNCH-v1.0.md)
**Publicación:** un solo commit y push al terminar.

## 1. Reglas

`main` sin ramas; no `pnpm dev` ni `dev.mjs`; no matar procesos; jest sin caché con conteo real; integración `DB_NAME=test`; suite completa si cambia un `@Module`; migraciones tenant desde 207; manifiesto de supresión para texto libre del registro de correos.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** | — | Línea base: ficha (Documentos, Facturación), pagos, PDF, mailer | `sr-qa` |
| **A** Recibos y desasociar | D3, D6, R3, R5, CA-3, CA-5 | Consecutivo de recibo, PDF del recibo, endpoint desasociar aplicación | `sr-backend` |
| **B** Libro y correos | D4, D5, R2, R4, CA-2, CA-4 | Endpoint del libro con saldo corrido y filtros, PDF; envío de factura, recibo y estado con registro (outbox/BullMQ, mailer) | `sr-backend` |
| **F** Portal | D1, D2, R1, R6, CA-1 | Documentos sin cobros; subpestañas Facturas, Pagos, Estado de cuenta con detalle, acciones y envíos | `fe-platform` |
| **QA** | CA-1–CA-5 | E2E y regresión | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 · A · B | — |
| 2 | F | A, B |
| 3 | QA · revisores · commit y push | 1–2 |

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias | De apoyo |
|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | `e2e-triage`, `wcag-audit-patterns` |
| A, B | `sr-backend` | `nestjs-expert`, `iwana-tenant-migration`, `postgresql`, `backend-security-coder`, `bullmq-specialist`, `testing-patterns` | `openapi-spec-generation` |
| F | `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | `iwana-identity-ui-review`, `frontend-security-coder` |
| Revisión | `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `sec-eng` | — | — |

## 5. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Perder capacidades al reorganizar la pestaña | Inventario W0 de lo visible hoy y CA de no retroceso |
| R2 | Libro que no cuadra con la cartera | Prueba integrada saldo final = cartera |
| R3 | Correos con PII en logs o reintentos duplicados | Payload solo con ids, idempotencia por documento y destinatario enmascarado |
