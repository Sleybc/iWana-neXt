# MOD05/MOD08 Suscriptores — Remediación de cumplimiento · Plan de orquestación

**Fecha:** 2026-10-11 (v1.3: 2026-10-12) · **Versión:** 1.3 · **Emisor:** AI-EM-ARCH (modo EM + Orchestrator)
**Informe de origen:** [INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md](../informes/INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md)
**Prompt G4:** [PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.3.md](../prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.3.md) — contratos sin cambio (C-API-1 v1.1, C-API-2 v1.2); v1.0–v1.2 superados
**Launcher vigente (correcciones de cierre):** [PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.4.md](../prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.4.md) · cierre parte A: [LAUNCH-v1.3](../prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.3.md) (superado) · Ola 2-bis: [LAUNCH-v1.2](../prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.2.md) (superado) · Ola 1-bis: [LAUNCH-v1.1](../prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.1.md) (superado) · Ola 1 original: [LAUNCH-v1.0](../prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.0.md) (superado)

**Goal:** cerrar los 3 críticos y los altos no bloqueados por decisión legal, para que MOD05 llegue a G6 con solo E-1/E-2 pendientes.

## Estado al 2026-10-12 — G6 de la fase: GO

Cierre en [INFORME-MOD05-SUBSCRIBERS-CIERRE-G6-v1.0.md](../informes/INFORME-MOD05-SUBSCRIBERS-CIERRE-G6-v1.0.md). B11 verificado contra el código: los dos adaptadores filtran `MERGED` y `findByDocument` resuelve el canónico en un salto.

| Gate | Estado |
| --- | --- |
| G6 (fase de remediación) | ✅ GO — `gate-verifier` y `sec-eng` |
| G6.5 | Pendiente: commit → CI Linux por SHA → consolidación AI-EM-ARCH |
| G7 (release de la fase) | Pendiente: runbook B13 ejecutado por tenant |
| **Módulo MOD05** | **Sigue NO-GO para producción**: SUB-C03 (IVA, E-1), SUB-A06/A07 (Habeas Data, E-2) y E-3 abiertos |

## Estado al 2026-10-12 (v1.3, histórico)

| Bloque | Estado |
| --- | --- |
| B1–B5, B9, B10 | ✅ Cerrados (solo B1 commiteado) |
| B7 `sec-eng` | NO-GO por **B7-01** (MERGED en adaptadores Party), confirmado en código. B7-02 reclasificado a precondición G7; B7-03 → E-3; B7-04 → deuda transversal |
| B8 `sr-qa` | NO-GO por cobertura: `crm/subscribers` 78,28 % stmts / 62,19 % branches; `parties` 40 % branches |
| B11 `sr-backend` ∥ B12 `sr-qa` ∥ B13 `plat-ops` | **Correcciones de cierre**, propiedad de archivos disjunta (prompt v1.3 §1) |
| Re-verificación | `gate-verifier` ∥ `sec-eng` (B7-01) → G6 de la fase |

## Estado al 2026-10-12 (v1.2, histórico)

| Bloque | Estado |
| --- | --- |
| B1, B4 | ✅ Cerrados |
| B2, B3, B5 | ✅ Implementados, sin commitear; verificados contra el árbol (prompt v1.2 §0) |
| B9 `sr-backend` | ✅ Cerrado: `vatTreatment` en la base, `department` restringido, guarda `activatedAt` también en el `WHERE` atómico, wrapper de Jest retirado. Gate Turbo `--force`: 328 suites / 4.192 tests; integración B5: 6/6 |
| B10 `fe-platform` | **Pendiente**: `SubscribersListClient.tsx` sigue sin leer `vatTreatment` ni `department` (verificado 2026-10-12) |
| B7 `sec-eng` | Cierre parte A, en paralelo con B10 |
| B8 `sr-qa` + auxiliares | Cierre parte B, tras B10 y B7 |

## Estado al 2026-10-12 (v1.1, histórico)

| Bloque | Estado | Evidencia |
| --- | --- | --- |
| B1 `data-eng` | ✅ Cerrado — `59e425ee` en `main` local | migración 143 `up/down/up` (1 suite, 2 tests) y dry-run del backfill (1 suite, 1 test) contra Postgres real; verificado contra el diff |
| B2 `sr-backend` | `[BLOQUEO]` resuelto por C-API-2 v1.1 → **relanzar** | informe B2 |
| B3 `fe-platform` | `[BLOQUEO]` resuelto por C-API-2 v1.1 → **relanzar** | informe B3 |
| B4 `prod-ux` | ✅ Cerrado — ratificado con cambios (spec §6) | spec B4 |
| B6 | **Absorbido por B2** en la v1.1 | prompt v1.1 |

**Restricción de despliegue:** la migración 143 retiró `idx_party_document_active`. Hasta B5, la unicidad del Party queda solo en la comprobación de la aplicación. **No desplegar 143 sin B5 en el mismo release.**

## 0. Gates y bloqueos

| Gate | Estado |
| --- | --- |
| G1–G3 | Heredados del módulo (PRD/HLD aprobados); la remediación no cambia alcance funcional |
| G4 | **Pendiente:** se firma cuando el CTO lanza la Ola 1 |
| G6 / G6.5 / G7 | Bloqueados por SUB-C01..C03 |

| Bloqueo | Afecta | Dueño |
| --- | --- | --- |
| **E-1** regla IVA | Fiscal (SUB-C03, M03, M05) — fuera de este plan hasta el ADR sucesor | CTO |
| **E-2** modelo Habeas Data | SUB-A06, A07, B03 — fuera de este plan | CTO |
| **E-3** placeholders / `NOT NULL` | B5 paso 7 (solo ese paso) | CTO |

**Restricción de secuencia externa:** la Fase 04 de suscriptores ([plan 2026-09-04](2026-09-04-mod05-subscribers-fase-04-orquestacion.md)) comparte `subscribers.service.ts` y `subscribers.controller.ts`. No se despacha en paralelo con B2 ni B5; se re-basa sobre C-API-1/C-API-2.

## 1. Olas y ruta crítica

```
Ola 1 (paralelo):  B1 data-eng ─┐   B2 sr-backend ─┬─ B3 fe-platform (contra C-API-1)
                                │                  │
                   B4 prod-ux ──┼──────────────────┼─→ ratificación AI-EM-ARCH
                                ▼                  ▼
Ola 1-bis:         B2 sr-backend (incluye mapa ratificado + D3) ∥ B3 fe-platform (contra C-API-2 v1.1)
Ola 2:             B5 sr-backend (requiere B2 cerrado)
Cierre:            B7 sec-eng ∥ B8 sr-qa  → gate-verifier → docs-governance → informe de fase
```

**Ruta crítica:** B1 → B5 → B7/B8. B2/B3/B4 no la alargan.
**Puntos de sincronización:** (1) ✅ B1 en `main`; (2) B2 cerrado libera `subscribers.service.ts` para B5; (3) ✅ B4 ratificado (lo aplica B2).

## 2. Matriz de dispatch (agente × skill)

Skills verificadas en disco el 2026-10-11 (`ls .agents/skills/<nombre>/SKILL.md`). Se leen como documentación antes de escribir código.

| Bloque | Subagente | Obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| B1 DDL + backfill | `data-eng` | `postgresql`, `database-migration`, `backend-security-coder` | `observability-engineer` (si el CLI emite métricas de avance) | `bullmq-specialist`: el backfill es CLI por tenant, no cola; `nestjs-expert`: no toca servicios | test integrado de migración `up/down/up` contra Postgres real; `iwana-test-evidence` |
| B2 Superficie PII | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `testing-patterns` | `typescript-expert` (si el mapa rol × campo exige tipos condicionales) | `database-migration`: el DDL es de B1; `bullmq-specialist`: sin colas; `security-auditor`: auditar es de B7 | `pnpm exec turbo run test --filter=@iwana/api --force` con conteo real (corregido en v1.2, D-3) |
| B3 Consumo C-API-1 | `fe-platform` | `frontend-dev-guidelines`, `frontend-security-coder`, `testing-patterns` | `playwright-skill` (si cambia el flujo del picker de suscriptor) | `iwana-identity-ui-review`, `ui-ux-pro-max`: no hay cambio visual | `pnpm exec turbo run test --filter=@iwana/portal --force` con conteo real |
| B4 Mapa campo × rol | `prod-ux` | `docs-architect` | `security-auditor` (para fundamentar minimización); `system-vocabulary-review` (si el mapa fija etiquetas visibles) | `iwana-identity-ui-review`, `ui-ux-pro-max`: no hay pantalla | Ratificación AI-EM-ARCH |
| B5 Identidad y conversión | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development` | `typescript-expert` (si `EnsurePartyInput` cambia de forma) | `bullmq-specialist`: ADR-027 fija `EventEmitter2`; `database-migration`: DDL congelado en B1 | tests integrados del stop/go de B5 con conteo real |
| ~~B6 Mapa aplicado~~ | — | — | — | Absorbido por B2 en v1.1 | — |
| B7 Revisión | `sec-eng` | `security-auditor`, `backend-security-coder` | `auth-implementation-patterns` (si toca guards/permisos) | `test-driven-development`: no escribe código | informe SEC-ENG GO/NO-GO |
| B8 Evidencia | `sr-qa` | `testing-patterns`, `iwana-test-evidence`, `verification-before-completion` | `e2e-testing-patterns` (si B3 tocó un flujo E2E) | `ui-ux-pro-max`: sin UI | matriz hallazgo ↔ test + cobertura ≥ 80 % |
| B11 MERGED en adaptadores Party | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development` | `typescript-expert` (si cambia la forma de `PartySnapshot`) | `database-migration`: sin DDL; `bullmq-specialist`: sin colas | turbo API `--force` + integración B5 con el caso MERGED |
| B12 Cobertura ≥80 % (stmts y branches) | `sr-qa` | `testing-patterns`, `iwana-test-evidence`, `verification-before-completion` | `test-driven-development` (al escribir tests de ramas de error) | `e2e-testing-patterns`, `playwright-skill`: la brecha es unitaria/integración de API | cobertura focalizada sin caché |
| B13 Runbook G7 | `plat-ops` | `database-migration`, `postgresql` | `docker-expert` (solo si el runbook usa Compose) | `bullmq-specialist`: el backfill es CLI; `nestjs-expert`: no toca código | revisión `sec-eng` del runbook |

Auxiliares de cierre (sin bloque propio): `boundary-reviewer` sobre el diff de B5, `contract-drift-reviewer` sobre C-API-1/C-API-2, `gate-verifier`, `docs-governance`.

## 3. Fuera de este plan

- Habeas Data (E-2) y fiscal (E-1): se emiten como prompts propios de Habeas Data y fiscal cuando el CTO decida (las v1.1–v1.3 de este prompt se consumieron en los re-sync del 2026-10-12).
- ADR-058 fase 2 (`PII_ENCRYPTION_KEY`, SUB-M02): `plat-ops` + `sr-backend`, plan propio según el runbook de rotación.
- `expediente_records.email_secondary` en claro: turno de expedientes.

## Lanzamiento

> Espejo de [PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.4.md](../prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.4.md). **El archivo es la fuente y prevalece si divergen.**

Correcciones de cierre: B11 `sr-backend` ∥ B12 `sr-qa` ∥ B13 `plat-ops`. Después, `gate-verifier` ∥ `sec-eng` (re-verificación) → G6 de la fase.
