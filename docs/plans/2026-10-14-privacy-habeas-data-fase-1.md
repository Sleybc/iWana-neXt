# Módulo `privacy` — Habeas Data · Fase 1 · Plan de orquestación

**Fecha:** 2026-10-14 · **Versión:** 1.6 · **Emisor:** AI-EM-ARCH (modo EM + Orchestrator)
**Decisión:** [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) — Aprobado por el CTO el 2026-10-14 (retención de prospectos: 24 meses)
**Prompt G4:** [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md) — A22 a A26, D-POT, D-F1A y el cierre (§3 y §4), sobre v1.2 (A10–A21), v1.1 (A1–A9) y v1.0; las anteriores, superadas
**Último launcher (cerrado):** [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.8.md](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.8.md) · anteriores: [LAUNCH-v1.7](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.7.md) (Ola 4a-bis), [LAUNCH-v1.6](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.6.md) (Ola 4a, NO-GO), [LAUNCH-v1.5](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.5.md) (A24), [LAUNCH-v1.4](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.4.md) (Q3Δ3 → Q7), [LAUNCH-v1.3](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.3.md) (Q7 bloqueado), [LAUNCH-v1.2](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.2.md) (Ola 2-bis + Ola 2), [LAUNCH-v1.1](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.1.md) (Ola 1-bis), [LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.0.md) (Ola 1)

**Goal:** cerrar E-2 (SUB-A06, SUB-A07, SUB-B03) con el titular modelado como Party, plazos legales calculados con festivos y la suplantación operativa antes de que rija la Ley 2573 (19-nov-2026 ⚠).

**Impacto declarado:**
- **Multi-tenant:** tablas en el schema del tenant; el ISP es el Responsable.
- **Seguridad:** la evidencia y el bloqueo son PII de alto impacto; las tablas son de solo-anexar a nivel de base de datos.
- **Escala:** un job diario por tenant; índices por `(status, due_at)`.
- **Regulación:** Ley 1581, Decreto 1377, Ley 2573, Decreto 1704 y Ley 962.

## Estado al 2026-10-14 (v1.6) — Fase 1a cerrada en G6

| Tema | Estado |
| --- | --- |
| Fase 1a (Q1 a Q7, A1 a A26) | ✅ **G6 GO**, condicionado a G6.5. Consolidado en [INFORME-PRIVACY-FASE-1A-CIERRE-G6-v1.0](../informes/INFORME-PRIVACY-FASE-1A-CIERRE-G6-v1.0.md) |
| Construcción | Q1 a Q6 (integraciones reales: Q1 10, Q2 1, Q3 12, Q5 16, Q6 1); spec Q4 v1.2 ratificada (53 CA); Q7 en el portal |
| Correcciones del emisor | A1–A9 (v1.1), A10–A21 (v1.2), A22–A26 (v1.3). Lección en memoria: pasada regla → campo antes de congelar |
| Cierre (Ola 4a → 4a-bis) | Ola 4a NO-GO → R1 (SEC-01, envolturas), R2 (A25 `logWithin`), R3 (enums del cliente), R4 (cobertura), R5 (A26 `partyId`), R4b (E2E reales 3/3). Re-verificación: SEC GO, BOUNDARY sin hallazgos, DRIFT GO, GATES verdes en 5 paquetes, DOCS corregido en esta versión |
| D-F1A | ✅ Aprobada por el CTO: Q8 (bloqueo y anonimización) pasa a la **Fase 1b** |
| D-POT | ✅ El CTO decidió desmontarlo: `PotentialsModule` **no** está registrado en `CrmModule` (revertido antes del checkpoint) |
| Commits | Checkpoint `91283057`, `15bda462`, `a5a78672`, `e20bdf01`. R1 a R5, R4b y el cierre, sin commitear |
| G6.5 (pendiente) | **CI de `main` en rojo desde el 12-10** por el spec B5 (`b5-identity-conversion…:336`, dependiente del estado de migración). En CI pasaron: la 026, la 143, la 145 y la P2 de D-PDF. La 027 **pasó** en `38644689892`. En esa corrida falla además `contracts.service.postgres.integration.spec.ts` (fixture sin `party_id`, regresión de la Fase 1a). Corrección: R6 (hecho en local) + R7 (prompt v1.3 §5). Ningún G6.5 (IVA, D-PDF, Fase 1a) se declara hasta tener el CI en verde |
| Deuda registrada | Ver el informe de cierre §5 |
| Ruta crítica (Ley 2573, 19-nov) | La suplantación quedó lista en G6. Antes de producción: G6.5, dictámenes de ADR-094 §7.3 y `HLD-PRIVACY-v1.0` (G7) |

## 0. Gates y bloqueos

| Gate / bloqueo | Estado |
| --- | --- |
| G1–G3 | ADR-094 aprobado |
| G4 | ✅ Firmado al lanzar la Ola 1 · G6 de la Fase 1a: ✅ GO (informe de cierre) · G6.5: pendiente (027 en CI) |
| Precondición | ✅ IVA y D-PDF commiteados (`4a1b437a`, `9d227eaf`) |
| Número de módulo `privacy` | Pendiente del CTO (roadmap). **No bloquea**: el nombre técnico es `privacy` |
| Dictámenes ⚠ (ADR-094 §7.3) | **Bloquean producción, no la construcción** |
| Fase 04 de suscriptores | No corre en paralelo con Q5 ni con Q8 (comparten `crm/subscribers/**`) |

## 1. Olas y ruta crítica

```
Ola 1:  Q1 data-eng (146 + 147, backfill)  ∥  Q2 sr-backend (calendario, autorizaciones, marcas, puertos)
        ∥  Q3 sr-backend (solicitudes, reloj legal, suplantación)  ∥  Q4 prod-ux (spec UX)
Ola 1-bis: Q1–Q4 contra v1.1 (cerrada)
Ola 2-bis: Q1Δ ∥ Q2Δ ∥ Q3Δ ∥ Q4Δ (deltas v1.2)   ∥   Ola 2: Q5 sr-backend (CRM, A17/A18/A20/A21) ∥ Q6 sr-backend (alertas en la API, A19)
Ola 2 (cont.): Q7 fe-platform (portal, spec v1.2 ratificada) ∥ Q1Δ2 ∥ Q3Δ2 (A22)
Ola 3:  Q8 sr-backend (bloqueo y anonimización)
Ola 4:  sec-eng ∥ sr-qa → boundary-reviewer · contract-drift-reviewer · gate-verifier · docs-governance → G6
```

**Ruta crítica (suplantación, fecha legal):** Q2 → Q3 → Q5 (suspensión real de contratos) → Q7 (radicación en el portal) → cierre. Q8 no está en la ruta de la suplantación. Si el calendario aprieta, la suplantación puede salir a G6 parcial antes que el bloqueo; esa decisión es del CTO.

**Sincronización:**
1. Q2 publica C-CAL-1 y los DTOs → Q3 y Q4 los consumen.
2. Q1 en el árbol → Q5 y Q6.
3. Spec Q4 ratificada → Q7.
4. Q5 cerrado → Q8.

Q2 y Q3 son dos sesiones de `sr-backend` con carpetas disjuntas dentro de `privacy/`. `privacy.module.ts` es de Q2.

## 2. Matriz de dispatch

Skills verificadas en disco (`ls .agents/skills/<nombre>/SKILL.md`, 2026-10-11/14). Se leen como documentación antes de escribir.

| Bloque | Subagente | Obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| Q1 DDL y backfill | `data-eng` | `postgresql`, `database-migration`, `backend-security-coder` | — | `nestjs-expert`: solo mapeo de entidades; `bullmq-specialist`: sin colas | integración `up/down/up` + triggers + reporte de backfill |
| Q2 Núcleo | `sr-backend` | `nestjs-expert`, `typescript-expert`, `backend-security-coder`, `test-driven-development` | `auth-implementation-patterns` (permisos `privacy.*`) | `database-migration`: DDL de Q1; `bullmq-specialist`: el job es Q6 | turbo `api` + `shared` `--force` |
| Q3 Solicitudes | `sr-backend` | `nestjs-expert`, `test-driven-development`, `backend-security-coder`, `postgresql` | `typescript-pro` (máquina de estados tipada) | `database-migration`: DDL de Q1 | turbo API `--force` + integración de R5 |
| Q4 Spec UX | `prod-ux` | `iwana-identity-ui-review`, `system-vocabulary-review`, `docs-architect` | `ui-ux-pro-max`, **subordinada** a `iwana-identity-ui-review`, `core-components`, `tailwind-patterns` y tokens (solo para el semáforo de vencimiento si no existe receta) | `frontend-dev-guidelines`: no escribe código | ratificación AI-EM-ARCH |
| Q5 Integración CRM | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `test-driven-development` | `postgresql` (transacción de suspensión) | `database-migration`: sin DDL | turbo API `--force` + integración R5 de punta a punta |
| Q6 Job de alertas | `sr-backend` | `bullmq-specialist`, `nestjs-expert`, `testing-patterns` | `observability-engineer` (métricas del job) | `database-migration`: sin DDL | turbo API `--force` (el procesador vive en la API, A19) |
| Q7 Portal | `fe-platform` | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `core-components`, `tailwind-patterns`, `system-vocabulary-review` | `playwright-skill` (radicar → transicionar), `frontend-security-coder` (carga de evidencia) | `ui-ux-pro-max`: la spec decide | turbo portal `--force` + `audit-ui.mjs` |
| Q8 Bloqueo y anonimización | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development` | — | `bullmq-specialist`: la ejecución automática es de la Fase 2 | integración contra Postgres real |
| Cierre seguridad | `sec-eng` | `security-auditor`, `backend-security-coder` | `frontend-security-coder` | — | GO/NO-GO |
| Cierre calidad | `sr-qa` | `testing-patterns`, `iwana-test-evidence`, `verification-before-completion` | `e2e-testing-patterns` | — | matriz CA ↔ test + cobertura ≥ 80 % en stmts y branches |

## 3. Fuera de este plan

- **Fase 2:** jobs automáticos de anonimización por vencimiento; formulario público; flujo completo de incidentes.
- **Fase 3:** centrales de riesgo (con Billing) y Ley 2300 (con comunicaciones).
- **Deuda registrada para el turno de `assurance`:** reemplazar `sla.service.ts:85-99` por C-CAL-1.
- **Dictámenes jurídicos** (ADR-094 §7.3): los gestiona el CTO.
- **Fase 2 (P3):** limpieza de evidencias huérfanas (A16); nombres de contrato en el detalle de suplantación; alerta o bloqueo de altas nuevas con el documento de un titular con `VICTIMA_FALSEDAD_PERSONAL` (candidato a decisión del CTO).

## Lanzamiento

> Espejo de [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.8.md](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.8.md). **El archivo es la fuente y prevalece si divergen.**

Fase 1a cerrada (G6 GO). Siguiente: la Fase 1b (Q8 y el plazo de traslado), con un plan y un contrato propios.
