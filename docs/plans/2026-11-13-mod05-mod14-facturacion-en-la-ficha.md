# MOD05 ↔ MOD14 · Facturación en la ficha estilo UISP · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente).

**Objetivo:** Documentos solo con archivos y Facturación dividida en Facturas, Pagos y Estado de cuenta, con recibo numerado, libro con saldo corrido, envíos por correo y desasociar pago.
**Versión:** 1.1 (2026-11-13). Incorpora la revisión AI-EM-ARCH: migraciones y archivos asignados por bloque, contrato de la ola 2, matriz con skills descartadas y gates, revisores de cierre, espejo `## Lanzamiento` y lista de exclusiones del commit.
**Spec:** [2026-11-13-mod05-mod14-facturacion-en-la-ficha-estilo-uisp](../specs/2026-11-13-mod05-mod14-facturacion-en-la-ficha-estilo-uisp.md) v1.1 (G0 sobre v1.0; reafirmado sobre v1.1 por el usuario el 2026-11-13 al aprobar el plan de ejecución)
**Launcher:** [PROMPT-MOD05-MOD14-FACTURACION-FICHA-LAUNCH-v1.1](../prompts/PROMPT-MOD05-MOD14-FACTURACION-FICHA-LAUNCH-v1.1.md). Lanza la ola 1; las olas 2 y 3 se ejecutan desde este plan en la misma sesión (ADR-107 D8.2).
**Informe de la fase:** `docs/informes/INFORME-MOD05-MOD14-FACTURACION-FICHA-CIERRE-v1.0.md`. Cada ola actualiza su sección; G6.5 se registra al final. Dueño: la sesión orquestadora.
**Publicación:** un solo commit y push al terminar. Lleva migraciones con restricciones (ADR-107 regla 7).

## 1. Reglas

- `main` sin ramas; no `pnpm dev` ni `dev.mjs`; no matar procesos.
- Jest sin caché, con conteo real. Integración con `DB_NAME=test`. La E2E corre con un tenant desechable y el aprovisionador.
- Cambia `BillingModule`, así que corre la suite completa de `api`.
- Manifiesto de supresión para el registro de correos, que no guarda texto libre.
- Migraciones tenant: A usa **207** y B usa **208**. Antes de crearlas, verificar que siguen libres.

## 2. Bloques

| Bloque | Spec | Superficie y archivos propios | Dueño |
|---|---|---|---|
| **W0** | R6 | Línea base con conteo real e inventario de lo visible hoy en Documentos y Facturación (métricas, documentos, pagos, cortesías, retenciones, valor real de la instalación, facturación por servicio, anular y aplicar pago) | `sr-qa` |
| **A** Recibos y desasociar | D3, D6, D8, D11, R3, R5, CA-3, CA-5, CA-7 | Migración 207: consecutivo de recibo con backfill de pagos nativos y motivo de reversión en `billing_payment_allocations`. PDF del recibo y endpoint para desasociar. **Dueño exclusivo** de `billing/payments/billing-payments.{controller,service}.ts`, `allocation.ts` y `packages/shared/.../billing-payments.contract.ts` | `sr-backend` |
| **B** Libro y correos | D4, D5, D7, D9, D10, D11, R2, R4, CA-2, CA-4, CA-6 | Migración 208: registro de correos. El libro extiende `billing-accounts.contract.ts` de forma aditiva y vive en un controlador y un servicio nuevos, que leen `statementForSubscriber` sin editarlo. PDF del estado de cuenta. Envío de factura, recibo y estado con un procesador en `apps/api` (patrón `contract-signed-copy`), plantilla nueva en `mailer/templates/` y participante de supresión de billing. **No toca** los archivos de A. Registra en `runner.ts`, `billing.module.ts` y `packages/shared/.../index.ts` solo después de que A cierre | `sr-backend` |
| **F** Portal | D1, D2, R1, R6, CA-1 | Documentos sin cobros; subpestañas Facturas, Pagos y Estado de cuenta, con detalle, acciones y envíos | `fe-platform` |
| **QA** | CA-1–CA-7 | E2E, regresión e inventario W0 contra el resultado | `sr-qa` |

**Contrato congelado de la ola 2:** `packages/shared/src/contracts/billing/billing-payments.contract.ts` y `billing-accounts.contract.ts`, más los contratos de correo que cree B, en su estado al cierre de la ola 1, con la OpenAPI regenerada. El informe registra ese estado. F no los modifica; si necesita un cambio, emite `[BLOQUEO]`.

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 · A · B (B registra módulos y runner después de A) | — |
| 2 | F | Contrato congelado de la ola 1 |
| 3 | QA · `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `sec-eng` · correcciones · `gate-verifier` · `docs-governance` · commit y push · CI de `main` y G6.5 | 1–2 |

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias | De apoyo (condición) | Descartadas (motivo) | Gate ejecutable |
|---|---|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | `wcag-audit-patterns` (las subpestañas de R1); subagente `e2e-triage` (corrida E2E roja) | `iwana-matriz-motivos` (no cruza MOD11↔MOD12) | `pnpm test --filter api --filter portal` sin caché; Playwright de los specs nuevos |
| A, B | `sr-backend` | `nestjs-expert`, `iwana-tenant-migration`, `postgresql`, `backend-security-coder`, `openapi-spec-generation`, `testing-patterns` | `bullmq-specialist` (solo B, procesador de correo); `i18n-localization` (formatos de moneda y fecha en los PDF) | `database-migration` (el schema `public` no cambia); `auth-implementation-patterns` (no hay flujo de autenticación) | Integración con `DB_NAME=test`; `migration-order.spec.ts`; suite completa de `api` |
| F | `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `iwana-identity-ui-review`, `testing-patterns` | `frontend-security-coder` (PII del titular en el libro y el registro de correos); `tailwind-patterns` (variantes nuevas) | `core-components` (no se crean primitives ni tokens) | `pnpm test --filter portal` sin caché; `audit-ui.mjs` si aplica a la pantalla |
| Revisión | `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `sec-eng`, `gate-verifier`, `docs-governance` | — | — | — | Gates Before Merge de `AGENTS.md`; `pnpm audit:adr-citations`; `pnpm audit:doc-locations` |

## 5. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Perder capacidades al reorganizar la pestaña | Inventario W0 de lo visible hoy, con QA contra él |
| R2 | Un libro que no cuadra con el estado de cuenta | Prueba integrada: saldo final del libro = saldo de `statement` |
| R3 | Correos con PII en logs o reintentos duplicados | Payload solo con ids, idempotencia por documento y destinatario, destinatario enmascarado |
| R4 | A y B chocan en archivos o en el número de migración | Propiedad exclusiva de archivos y 207/208 (§2) |
| R5 | Desasociar un importado deja valor que no se puede volver a aplicar | R5 y CA-7 lo excluyen |

## 6. Fuera del commit

Son cambios ajenos que ya estaban en el árbol: `package.json`, `scripts/dev*`, `apps/*/next-env.d.ts`, `apps/worker/*`, `inventory-execution-request.processor*`, los specs del portal de otras sesiones, los docs ajenos, `coverage-*`, `graphify-out` y `.claude/launch.json`. Los archivos del mailer que hoy salen como `M` no tienen diff real (`git diff --ignore-cr-at-eol` vacío): si B los edita, pasan a ser de la fase.

## Lanzamiento

Fuente: [PROMPT-MOD05-MOD14-FACTURACION-FICHA-LAUNCH-v1.1](../prompts/PROMPT-MOD05-MOD14-FACTURACION-FICHA-LAUNCH-v1.1.md). **Si este espejo y el archivo divergen, prevalece el archivo.**

```text
Rige AGENTS.md. Ejecuta la fase «Facturación en la ficha estilo UISP» con executing-plans (modo subagente).
Lee el plan docs/plans/2026-11-13-mod05-mod14-facturacion-en-la-ficha.md v1.1 y el spec v1.1; el plan §2 es el encargo de cada bloque.
Ola 1 en paralelo: sr-qa W0 · sr-backend A (migración 207, dueño de billing-payments.*) · sr-backend B (migración 208, archivos nuevos; registra runner/módulo/index después de A).
Olas 2 y 3 desde el plan §3, en esta sesión. Reglas del plan §1; fuera del commit, plan §6.
Un commit y push al final; CI de main y G6.5 en docs/informes/INFORME-MOD05-MOD14-FACTURACION-FICHA-CIERRE-v1.0.md.
```
