# Plan de orquestación — `privacy` · Bloqueo en proyecciones operativas

**Estado:** Propuesta. Espera el G0 del CTO sobre [§8 de la spec](../specs/2026-11-05-privacy-bloqueo-proyecciones-operativas-spec.md).
**Fecha:** 2026-11-05 · **Autor:** AI-EM-ARCH · **Spec:** [2026-11-05-privacy-bloqueo-proyecciones-operativas-spec.md](../specs/2026-11-05-privacy-bloqueo-proyecciones-operativas-spec.md) · **Lanzador:** [PROMPT-PRIVACY-BLOQUEO-PROYECCIONES-LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-BLOQUEO-PROYECCIONES-LAUNCH-v1.0.md)

## 1. Dependencias de entrada

- H-2 y el barrido publicados: comparten `assurance` y `wfm`.
- RS-21 de MOD14 quedó en el patrón de CRM (CTO, 2026-11-05): D-BLQ-1 lo reutiliza.

## 2. Olas

| Ola | Encargo | Agente | Depende de | Rutas |
| --- | --- | --- | --- | --- |
| 1 | B1 · Puerto, canarios y clasificación de §5 | `sr-backend` | G0 | `crm/ports`, `crm/adapters`, specs nuevas |
| 2 | B2 · Tickets, visitas y agenda (F-1 a F-3, D-BLQ-4) | `sr-backend` | B1 | `assurance`, `wfm` |
| 2 | B3 · OT, red, `parties` y Media (F-4 a F-8) | `sr-backend` | B1 | `tasks`, `network`, `parties`, `media` |
| 2 | F1 · Máscara y `SchedulingClient.tsx` | `fe-platform` | B1 | `apps/portal` |
| 3 | V1 · Canarios y CA-BLQ | `sr-qa` | B2, B3, F1 | Specs |
| 3 | V2 · Revisión de seguridad | `sec-eng` | B2, B3 | Solo lectura |
| 3 | V3 · Fronteras | `boundary-reviewer` | B2, B3 | Solo lectura |
| 3 | V4 · Gates | `gate-verifier` | V1 a V3 | Solo lectura |

## 3. Matriz agente × skill

| Agente | Skills |
| --- | --- |
| `sr-backend` | `nestjs-expert`, `postgresql`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` |
| `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `frontend-security-coder` |
| `sr-qa` | `testing-patterns`, `iwana-test-evidence`, `verification-before-completion` |
| `sec-eng` | `security-auditor`, `backend-security-coder` |
| `boundary-reviewer` | `architect-review` |

## 4. Gates

| Gate | Criterio | Decide |
| --- | --- | --- |
| G0 | Puntos 1 a 7 de la spec | CTO |
| G3 | CA-BLQ-01 a 06 contra PostgreSQL real con `DB_NAME=test`, y §5 clasificada | AI-EM-ARCH |
| G6 | V1 a V4 sin hallazgos abiertos; suite completa, porque cambia un `@Module` | AI-EM-ARCH |
| G6.5 | Publicado y CI de `main` verde sobre el SHA | AI-EM-ARCH |

## 5. Estado de ejecución

| Paso | Estado |
| --- | --- |
| Inventario | Hecho el 2026-11-05 por lectura de código; sin canarios |
| G0 | Pendiente |
