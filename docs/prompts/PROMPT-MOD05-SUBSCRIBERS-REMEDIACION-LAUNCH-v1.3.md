# LAUNCH — MOD05 · Remediación de cumplimiento · B10 pendiente ∥ revisión de seguridad

> **Superado el 2026-10-12** por [PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.4.md](PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.4.md). No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md` v1.2 · **Prompt:** `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.2.md`
**Ola que lanza:** cierre, parte A · **Gates:** G4 vigente
**Cerrado, no re-despachar:** B1 (`59e425ee`), B2, B3, B4, B5 y B9 (verificados contra el árbol; sin commitear salvo B1).
**Bloqueos abiertos:** E-1, E-2 y E-3. No correr la Fase 04 en paralelo. No desplegar la migración 143 sin el backfill y B5.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `fe-platform` | prompt v1.2 §3 B10 (**no se ejecutó**: la columna IVA sigue vacía) | `frontend-dev-guidelines`, `testing-patterns`, `iwana-test-evidence` | C-API-2 v1.2, ya publicado en `@iwana/shared` |
| 2 | `sec-eng` | prompt v1.0 §3 B7 + v1.2 §4 (solo lectura) | `security-auditor`, `backend-security-coder`; apoyo: `auth-implementation-patterns` si toca guards | C-API-1 v1.1, C-API-2 v1.2, C-PORT-1 |

**Paralelo:** los dos. B10 solo toca la presentación del portal; B7 revisa API, shared, DDL y el transporte del portal, que B10 no cambia.
**Cierre de la parte A:** B10 con `pnpm exec turbo run test --filter=@iwana/portal --force` en verde; B7 con veredicto GO/NO-GO. Después, la parte B: `sr-qa` (B8) más los revisores auxiliares.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.2 y tu encargo en `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.2.md` (B10: §3; B7: §4 y v1.0 §3 B7).
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si hace falta, emite `[BLOQUEO]` y para.
> El árbol tiene cambios sin commitear de B2, B3, B5 y B9: no los reviertas ni los reformatees.
> Reporta en `docs/informes/INFORME-MOD05-SUBSCRIBERS-REMEDIACION-{B#}-v1.0.md` con ruta, evidencia y hallazgos o deuda por severidad.
