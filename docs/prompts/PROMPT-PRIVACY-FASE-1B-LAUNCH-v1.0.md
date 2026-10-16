# LAUNCH — `privacy` Fase 1b · Bloqueo, anonimización y traslado · Ola 1

**Fecha:** 2026-10-16 · **Estado:** Vigente tras aprobar D-1B-1 a D-1B-4 · **Plan:** `docs/plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md` v1.0 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-FASE-1B-v1.0.md`
**Ola que lanza:** B1 (primer paso) ∥ D1; después de S1, B2 ∥ B3 ∥ B4 · **Gates:** G4 y G6 al final de la Ola 2
**Precondición:** `main` en `aeedeffc` o posterior; se trabaja en `main`, sin ramas; nadie commitea. No se migra `dbiw` en esta ola.

| # | Subagente | Encargo | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| B1 | `sr-backend` | prompt §4 B1; primer paso §2.2, §2.4 y §2.10 tal cual, y avisa S1 | `nestjs-expert`, `database-migration`, `iwana-tenant-migration`, `test-driven-development`, `backend-security-coder` | `INFORME-PRIVACY-FASE-1B-B1-v1.0.md` |
| D1 | `data-eng` | prompt §4 D1: inventario WFM y `tasks` + Anexo A del runbook | `postgresql`, `docs-architect` | `INFORME-PRIVACY-FASE-1B-D1-v1.0.md` |
| B2 | `sr-backend` | prompt §4 B2, tras S1; WFM y `tasks` tras D1 | `nestjs-expert`, `postgresql`, `backend-security-coder`, `test-driven-development`, `codebase-cleanup-deps-audit` | `INFORME-PRIVACY-FASE-1B-B2-v1.0.md` |
| B3 | `sr-backend` | prompt §4 B3, tras S1 | `nestjs-expert`, `backend-security-coder`, `testing-patterns` | `INFORME-PRIVACY-FASE-1B-B3-v1.0.md` |
| B4 | `fe-platform` | prompt §4 B4, tras S1 | `core-components`, `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `iwana-identity-ui-review` | `INFORME-PRIVACY-FASE-1B-B4-v1.0.md` |

**Paralelo:** la propiedad es disjunta (prompt §4). B2 no toca `privacy/`; B1 retira el adaptador `Unavailable` cuando B2 reporte su paso 2 (S3).
**Cierre de la ola:** los cinco informes → AI-EM-ARCH emite la Ola 2 (V1 ∥ V2 ∥ V3, después V4 y V5).

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.0 y tu encargo en `docs/prompts/PROMPT-PRIVACY-FASE-1B-v1.0.md` (§0 a §3 completos y tu bloque `{#}` de §4).
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si te falta algo, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad: otro agente edita el mismo árbol en paralelo.
> Ninguna PII, ciphertext, HMAC ni clave real en el repo, los informes o los logs. No commitees.
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}`, con el conteo real de tests sin caché y la deuda nueva por severidad.
