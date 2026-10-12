# LAUNCH — MOD05 · Remediación de cumplimiento · Ola 1-bis

> **Superado el 2026-10-12** por [PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.2.md](PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.2.md). No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md` v1.1 · **Prompt:** `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.1.md`
**Ola que lanza:** 1-bis — relanzamiento de B2 y B3 tras el re-sync de C-API-2 · **Gates:** G4 firmado (2026-10-12)
**Cerrado, no re-despachar:** B1 (`59e425ee`) y B4 (spec ratificada §6). B6 fue absorbido por B2.
**Bloqueos abiertos:** E-1 (IVA) y E-2 (Habeas Data). No correr la Fase 04 en paralelo. No desplegar la migración 143 sin B5.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | prompt v1.1 §3 B2 | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `testing-patterns` | C-API-1 v1.0, C-API-2 v1.1, spec B4 §6 |
| 2 | `fe-platform` | prompt v1.1 §3 B3 | `frontend-dev-guidelines`, `frontend-security-coder`, `testing-patterns` | C-API-1 v1.0, C-API-2 v1.1 |

**Paralelo:** los dos. B3 consume C-API-2 v1.1 tal como está escrito en el prompt §2.1, sin esperar a B2.
**Cierre de ola:** B2 y B3 con conteo real de tests (`--force`, `Cached: 0`); test por rol y 403 para TECHNICIAN/AUDITOR en el listado. Al cerrar B2 se lanza B5 (Ola 2).

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.1 y tu encargo `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.1.md` §3 bloque `{B#}`; la v1.1 sustituye a la v1.0 y resuelve tu `[BLOQUEO]` anterior.
> Antes de escribir código lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Consumes C-API-1 v1.0 y C-API-2 v1.1 (prompt §2.1): no los modifiques; si necesitas cambiarlos, emite `[BLOQUEO]` y para.
> Alcance: solo tu bloque. Fuera de alcance: `subscriber-creation.service.ts`, parties, DDL, Habeas Data, IVA, copy o columnas visibles nuevas.
> Cierras con el stop/go de tu bloque. Reporta en `docs/informes/INFORME-MOD05-SUBSCRIBERS-REMEDIACION-{B#}-v1.1.md` con ruta, conteo real de tests y deuda nueva por severidad.
