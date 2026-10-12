# LAUNCH — MOD05 · Remediación de cumplimiento · Ola 2-bis (correcciones)

> **Superado el 2026-10-12** por [PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.3.md](PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.3.md): B9 cerrado; B10 se relanza junto con B7. No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md` v1.2 · **Prompt:** `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.2.md`
**Ola que lanza:** 2-bis — correcciones D-1 a D-3 antes del cierre · **Gates:** G4 vigente
**Cerrado, no re-despachar:** B1 (`59e425ee`), B2, B3, B4 y B5 (B2, B3 y B5 sin commitear). B6 fue absorbido por B2.
**Bloqueos abiertos:** E-1, E-2 y E-3. No correr la Fase 04 en paralelo. No desplegar la migración 143 sin B5 y sin el backfill.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | prompt v1.2 §3 B9 | `nestjs-expert`, `backend-security-coder`, `testing-patterns`, `iwana-test-evidence` | C-API-2 v1.2 (prompt §2) |
| 2 | `fe-platform` | prompt v1.2 §3 B10 | `frontend-dev-guidelines`, `testing-patterns`, `iwana-test-evidence` | C-API-2 v1.2 (prompt §2) |

**Paralelo:** los dos; B10 consume C-API-2 v1.2 tal como está escrito, sin esperar a B9.
**Cierre de ola:** `pnpm exec turbo run test --filter=@iwana/api --force` y `--filter=@iwana/portal --force` con conteo real y sin `cache hit`; integración de B5 con el caso nuevo de D-2. Después: cierre B7 `sec-eng` ∥ B8 `sr-qa` (prompt v1.2 §4).

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.2 y tu encargo `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.2.md` §3 bloque `{B#}`.
> Antes de escribir código lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Consumes C-API-2 v1.2 (prompt §2): no lo modifiques; si necesitas cambiarlo, emite `[BLOQUEO]` y para.
> Alcance: solo tu bloque. El árbol tiene cambios sin commitear de B2, B3 y B5: no los reviertas ni los reformatees.
> Cierras con el stop/go de tu bloque. Reporta en `docs/informes/INFORME-MOD05-SUBSCRIBERS-REMEDIACION-{B#}-v1.0.md` con ruta, conteo real de tests y deuda nueva por severidad.
