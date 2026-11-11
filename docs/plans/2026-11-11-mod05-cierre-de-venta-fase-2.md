# MOD05 Cierre de venta · Fase 2 · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo.

**Objetivo:** el contrato `DRAFT` nace solo al pasar la oportunidad a «lista para instalación» y el primer cobro incluye la línea de instalación, sin perder la creación ni la activación manual.
**Spec:** [2026-11-11-mod05-cierre-de-venta-fase-2-contrato-automatico-e-instalacion](../specs/2026-11-11-mod05-cierre-de-venta-fase-2-contrato-automatico-e-instalacion.md) (G0 2026-11-11)
**Launcher:** [PROMPT-MOD05-CIERRE-VENTA-F2-LAUNCH-v1.0](../prompts/PROMPT-MOD05-CIERRE-VENTA-F2-LAUNCH-v1.0.md)

## 1. Reglas

- `main` sin ramas; commitear solo las rutas de la ola; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- Jest directo sin caché con conteo real; integración `DB_NAME=test`; suite completa si cambia un `@Module`.
- Migración tenant: verificar número libre (último 190). Columna nueva de texto o cifrada → actualizar el manifiesto de supresión y el inventario K2 en la misma ola.
- Antes del push: E2E vivos de MOD05, OT, `portal-billing-flow` y `portal-mod05-cierre-venta-live`.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** | §0 | Inventario: creación manual desde la ficha, `/activate`, primer cobro sin instalación | `sr-qa` |
| **A+B** Contrato automático | A, B, CA-1–3, D-F2 | Listener de `crm.expediente.ready-for-installation` tras el suscriptor; `createFromExpediente` reutilizado; idempotencia por expediente; contrato sin ciclo permitido en `DRAFT`; firma 409 sin ciclo; aviso al responsable de la oportunidad | `sr-backend` |
| **C+E** Instalación unificada | C, E, CA-6–7 | Permanencia lee `installation_fee` vigente por plan y segmento; contrato congela `installation_fee`; migración que retira `plan_details.connection_fee` con auditoría de valores distintos | `sr-backend` |
| **D** Línea de instalación | D, CA-4–5, D-F1 | MOD14: línea «Instalación» solo en el primer documento, neta de permanencia, IVA del internet del contrato (ADR-093), idempotente | `sr-backend` |
| **F** Portal | B, D-F2, CA-2–3, CA-6 | Ficha: «Falta ciclo de facturación» y aviso «No se pudo crear el contrato»; paso «Contrato» con el motivo; vista previa del alta con el valor congelado | `fe-platform` |
| **QA** | CA-1–7 | E2E del flujo: oportunidad → contrato automático → firma → primer cobro con instalación | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 · C+E | — |
| 2 | A+B · D | C+E (valor congelado) |
| 3 | F | A+B |
| 4 | QA · revisores · push | 1–3 |

**Ruta crítica:** C+E → A+B → F → QA.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | `e2e-triage` (si falla un E2E) | `wcag-audit-patterns` (sin UI nueva compleja) |
| A+B, C+E, D | `sr-backend` | `nestjs-expert`, `iwana-tenant-migration`, `postgresql`, `backend-security-coder`, `testing-patterns` | `bullmq-specialist` (D, si toca el consumidor) · `openapi-spec-generation` (si cambia un contrato HTTP) | `database-migration` (son tenant) |
| F | `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | `frontend-security-coder` | `core-components` (sin primitives) |
| Revisión | `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer` (si cambia un spec existente), `gate-verifier` | — | `sec-eng` (si cambia el cobro) | — |

## 5. Gates

G6 por ola con conteo ≥ línea base e inventario W0 verde; migraciones up/down contra Postgres real; integración del primer cobro con instalación (neta de permanencia e idempotente); E2E vivos en verde antes del push; G6.5 con CI de `main` verde.

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Contrato duplicado si el evento se repite o alguien lo crea a mano en paralelo | Idempotencia por expediente con restricción única |
| R2 | Valor de instalación distinto entre vista previa, contrato y cobro | Congelar en el contrato al crearlo (CA-6) |
| R3 | IVA de la instalación sin concepto del contador | D-F1 resuelta por el usuario; confirmar con el contador antes de G7 |

## 7. Cierre

Informe `docs/informes/INFORME-MOD05-CIERRE-VENTA-F2-CIERRE-v1.0.md` con conteos, CA-1 a CA-7 y lo no verificado.
