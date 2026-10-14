# Módulo `privacy` — Habeas Data · Fase 1 · Plan de orquestación

**Fecha:** 2026-10-14 · **Versión:** 1.5 · **Emisor:** AI-EM-ARCH (modo EM + Orchestrator)
**Decisión:** [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) — Aprobado por el CTO el 2026-10-14 (retención de prospectos: 24 meses)
**Prompt G4:** [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md) — A22 y D-POT sobre v1.2 (A10–A21), v1.1 (A1–A9) y v1.0; las anteriores, superadas
**Launcher vigente (Ola 4a-bis):** [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.7.md](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.7.md) · superados: [LAUNCH-v1.6](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.6.md) (Ola 4a, NO-GO), [LAUNCH-v1.5](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.5.md) (A24), [LAUNCH-v1.4](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.4.md) (Q3Δ3 → Q7), [LAUNCH-v1.3](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.3.md) (Q7 bloqueado), [LAUNCH-v1.2](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.2.md) (Ola 2-bis + Ola 2), [LAUNCH-v1.1](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.1.md) (Ola 1-bis), [LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.0.md) (Ola 1)

**Goal:** cerrar E-2 (SUB-A06, SUB-A07, SUB-B03) con el titular modelado como Party, plazos legales calculados con festivos y la suplantación operativa antes de que rija la Ley 2573 (19-nov-2026 ⚠).

**Impacto declarado:**
- **Multi-tenant:** tablas en el schema del tenant; el ISP es el Responsable.
- **Seguridad:** la evidencia y el bloqueo son PII de alto impacto; las tablas son de solo-anexar a nivel de base de datos.
- **Escala:** un job diario por tenant; índices por `(status, due_at)`.
- **Regulación:** Ley 1581, Decreto 1377, Ley 2573, Decreto 1704 y Ley 962.

## Estado al 2026-10-14 (v1.3)

| Bloque | Estado |
| --- | --- |
| Q1–Q6 | ✅ Ola 2-bis + Ola 2 cerradas: API 350 suites / 4.847 tests; shared 18 / 166; 0 en caché. Integraciones reales: Q1 6/6, Q2 1/1, Q3 9/9, Q5 15/15, Q6 1/1 |
| Spec Q4 | ✅ v1.2 ratificada (52 CA + CA-53 de §17) |
| A22 (defecto del emisor) | ✅ Cerrado: Q1 v1.3 (10 integración + 3 unitarios), Q3 v1.3 (10/10; API 351 / 4.852) |
| A23 | ✅ Q3 v1.4 (API 353 / 4.856; shared 18 / 167; integración real 12/12) |
| Q7 | ✅ Portal 297 suites / 2.993 tests, 0 en caché; Playwright 3/3 (API simulada con el schema real); matriz CA-01–53. P1: captura del expediente deshabilitada |
| A24 (defecto del emisor en A18) | Canal = medio del titular, no la superficie. La conversión hoy destruye el medio original. **El árbol no se puede commitear** hasta Q2Δ4, Q5Δ1 y Q7Δ1 |
| P2 de Q7 → Ola 4 | `sr-qa`: E2E contra la API levantada y cobertura de interacciones |
| A24 | ✅ Q2 v1.3 (API 355 / 4.862; shared 18 / 168), Q5 v1.1 (integración real 16/16), Q7 v1.2 (portal 298 / 2.996). Verificado en el código: no quedan constantes de superficie salvo en tests negativos y de `LEGACY_IMPORT` |
| D-F1A | ✅ **Aprobada por el CTO** (2026-10-14): la Fase 1a se cierra ahora; Q8 sale a la Fase 1b con su contrato trazado |
| D-POT | ✅ Desmontar (CTO). `PotentialsModule` no está registrado en `CrmModule` |
| Checkpoint | ✅ `91283057` (db + shared), `15bda462` (api), `a5a78672` (portal + e2e) |
| Ola 4a | **NO-GO:** SEC-01 (P1), boundary de auditoría (bloqueante, A25), deriva de envoltura (P1), QA sin correr (falta `dbiw` migrada), cobertura de `privacy` 54 / 33 %, §Lanzamiento del plan (corregido). Gates de lint, typecheck y tests verdes en 5 paquetes → Ola 4a-bis (prompt v1.3 §4) |
| D-POT | `PotentialsModule` montado por primera vez (autorizado por el CTO), sin consumidor en el portal. AI-EM-ARCH recomienda desmontarlo. **Decisión del CTO** |
| Deuda | 027 pública → G6.5; conciliación del backfill por tenant; evidencias huérfanas (Fase 2); métrica de Q6 solo en logs (P2); el adaptador de suplantación replica la regla de transición (P3); `HLD-PRIVACY-v1.0` antes de G7 |
| Ruta crítica (Ley 2573, 19-nov) | Q7 → Ola 4 (cierre de la suplantación). Q8 (bloqueo) puede ir después si el calendario aprieta |

## 0. Gates y bloqueos

| Gate / bloqueo | Estado |
| --- | --- |
| G1–G3 | ADR-094 aprobado |
| G4 | Se firma al lanzar la Ola 1 |
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

> Espejo de [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.7.md](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.7.md). **El archivo es la fuente y prevalece si divergen.**

Ola 4a-bis: R1 `sr-backend` ∥ R2 `sr-backend` ∥ R3 `fe-platform`, después R4 `sr-qa` (con `dbiw` migrada por el CTO) y la re-verificación de solo lectura, contra el prompt v1.3 §4. Q8 sale a la Fase 1b (D-F1A).
