# LAUNCH — `privacy` Fase 1b · Ola 2 (verificación; nadie corrige)

**Fecha:** 2026-10-16 · **Estado:** Vigente cuando el CI de `main` en `0af184d4` o posterior esté verde · **Plan:** `docs/plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md` v1.2 · **Prompt:** v1.0 §5 + deltas v1.1 y v1.2 (prevalece el más reciente)
**Ola que lanza:** V1 ∥ V2 ∥ V3; después V4 y V5 · **Gates:** G4 (V2, V3) y G6 (V1, V4)
**Precondición de entorno (CTO):** `pnpm db:backup` y luego `pnpm db:migrate:all` sobre `dbiw`, hasta la tenant 151. Sin esto no hay E2E contra la API real. Se trabaja en `main`; nadie commitea.

| # | Subagente | Encargo | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| V1 | `sr-qa` | v1.0 §5 V1 (casos 1 a 4), más v1.1 R15 y R16, más v1.2 §4; matriz R1–R16 ↔ test, test por test | `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence`, `verification-before-completion` | `INFORME-PRIVACY-FASE-1B-V1-QA-v1.0.md` |
| V2 | `sec-eng` | v1.0 §5 V2, más los puntos de seguridad de los deltas v1.1 y v1.2 | `security-auditor`, `backend-security-coder`; apoyo `frontend-security-coder` | `INFORME-PRIVACY-FASE-1B-V2-SEC-v1.0.md` |
| V3 | `boundary-reviewer` ∥ `contract-drift-reviewer` | Diff `aeedeffc..HEAD` | `architect-review`; apoyo `monorepo-architect` | `INFORME-PRIVACY-FASE-1B-V3-REV-v1.0.md` |
| V4 | `gate-verifier` | «Gates Before Merge» de `api`, `shared`, `db`, `portal` y `worker`, con `--force --continue` | `iwana-test-evidence`, `turborepo-caching` | `INFORME-PRIVACY-FASE-1B-V4-GATES-v1.0.md` |
| V5 | `docs-governance` | Los `docs/` de la fase | `docs-architect` | `INFORME-PRIVACY-FASE-1B-V5-DOCS-v1.0.md` |

**Puntos que V2 revisa:**
- atomicidad e irreversibilidad de `resolve` de SUPRIMIR;
- `crm.blocked_data.read` es solo de lectura;
- 403 en los seis subrecursos;
- auditoría con `grantedBy` y `blockedServed`;
- enumeración por búsqueda;
- evidencia de autorizaciones conservada (D-1B-7);
- `visit-requests.service.spec.ts:785` usa un valor sintético;
- el criterio fail-closed de `page.tsx` frente a la guarda truthy de `ExpedienteSections` (P2 heredado).

**Cierre:** los cinco informes → AI-EM-ARCH consolida `INFORME-PRIVACY-FASE-1B-CIERRE-G6-v1.0.md`. Los hallazgos vuelven a su dueño con un delta.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.2 y los prompts `PROMPT-PRIVACY-FASE-1B-v1.0.md`, `-v1.1.md` y `-v1.2.md` (prevalece el más reciente). Tu encargo es tu fila de este launcher.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Eres verificador: no corrijas código ni contratos. Reporta los hallazgos por severidad, con archivo:línea y evidencia. Si te falta algo, emite `[BLOQUEO]` y para.
> Ninguna PII, ciphertext, HMAC ni clave real en el repo, los informes o los logs. No commitees.
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}`, con el conteo real sin caché (y sin `--passWithNoTests`).
