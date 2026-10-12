# LAUNCH — MOD05 · Remediación de cumplimiento del Suscriptor

> **Superado el 2026-10-12** por [PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.1.md](PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.1.md). No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md` v1.0 · **Informe:** `docs/informes/INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md` v1.0
**Ola que lanza:** Ola 1 — PII, DDL y mapa de proyección · **Gates:** G1–G3 heredados · G4 se firma al lanzar
**Bloqueos abiertos:** E-1 (IVA) y E-2 (Habeas Data) — no lanzar nada fiscal ni de consentimiento. No correr la Fase 04 de suscriptores en paralelo.

| # | Subagente | Encargo (prompt · bloque) | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `data-eng` | `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.0.md` §3 B1 | `postgresql`, `database-migration`, `backend-security-coder` | C-DDL-1, C-NORM-1 (prompt §2) v1.0 |
| 2 | `sr-backend` | mismo prompt §3 B2 | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `testing-patterns` | C-API-1, C-API-2 v1.0 |
| 3 | `fe-platform` | mismo prompt §3 B3 | `frontend-dev-guidelines`, `frontend-security-coder`, `testing-patterns` | C-API-1, C-API-2 v1.0 |
| 4 | `prod-ux` | mismo prompt §3 B4 | `docs-architect` | ADR-067 §2 y §9 |

**Paralelo:** los cuatro. B3 trabaja contra C-API-1 sin esperar a B2.
**Cierre de ola:** B1 con migración `up/down/up` y backfill dry-run probados contra Postgres real; B2 y B3 con conteo real de tests (`--force`, `Cached: 0`); B4 con spec entregada para ratificación.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md` y tu encargo `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.0.md` §3 bloque `{B#}`.
> Antes de escribir código lee los `SKILL.md` de tu fila en la matriz del plan §2 (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Consumes los contratos congelados del prompt §2 v1.0: no los modifiques; si necesitas cambiarlos, emite `[BLOQUEO]` y para.
> Alcance: solo tu bloque. Fuera de alcance: reglas IVA, Habeas Data, `subscriber-creation.service.ts` (es de B5, Ola 2).
> Cierras cuando se cumple el stop/go de tu bloque. Reporta entregables con ruta, evidencia con conteo real de tests y deuda nueva por severidad en `docs/informes/INFORME-MOD05-SUBSCRIBERS-REMEDIACION-{B#}-v1.0.md`.
