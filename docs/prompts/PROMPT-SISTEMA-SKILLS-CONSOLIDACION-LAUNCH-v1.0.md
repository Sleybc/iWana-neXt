# LAUNCH — SISTEMA · SKILLS-CONSOLIDACION

**Plan:** `docs/plans/2026-11-08-skills-consolidacion-orquestacion.md` v1.0 · **Definición:** `docs/informes/INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0.md` v1.0 · **Spec:** no aplica
**Ola que lanza:** Ola 1 — B1, correcciones de ruteo sin renombrar · **Gates:** G0 pendiente (CTO) · G1 a G6.5 no iniciados
**Bloqueos abiertos:** [BLOQUEO] G0 (informe §6) — no lanzar B1 hasta que el CTO lo cierre

| # | Subagente / rol | Encargo | Skills a leer antes de editar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | AI-EM-ARCH (sesión principal; rol, no subagente) | Informe §5.2 (filas de B1) y §5.4; plan §3 B1 y §5 | `writing-skills`, `skill-creator` | Ninguno hasta G0. Tras G0: informe v1.0 §4 (catálogo resultante) |

**Paralelo:** ninguno; B1 es la única pieza de la ola. No hay prompt de ejecución aparte: el encargo es el informe §5.2 y §5.4.
**Cierre de ola:** G1 del plan §6 y `pnpm sync:skills:check` en verde.

---

### Bloque copiar-pegar

```text
===== SKILLS-CONSOLIDACION · B1 · AI-EM-ARCH (sesión principal) =====
Requisito: G0 cerrado (INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0 §6). Si falta, no arranques.
Actúa como AI-EM-ARCH. Lee AGENTS.md, el informe docs/informes/INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0.md (§2.1, §3, §5.2, §5.4 y §6) y el plan docs/plans/2026-11-08-skills-consolidacion-orquestacion.md (§3 B1 y §5).
Antes de editar, lee los SKILL.md de writing-skills y skill-creator (.agents/skills/<nombre>/SKILL.md, como documentación).
Comprueba P2 con git status y toma la línea base con pnpm sync:skills:check y pnpm sync:agents:check.
Alcance (solo B1, sin renombrar ni borrar skills): las filas de §5.2 de brainstorming, database-migration, postgresql, iwana-tenant-migration (solo si G0-3 lo aprobó), verification-before-completion, requesting-code-review y dispatching-parallel-agents; y las dos acciones de §5.4.
Fuera de alcance: fusiones, bajas, INDEX, MANIFEST, AGENTS.md y cualquier código. Sin Prettier. En main, sin commit.
Si un cambio exige tocar una regla de AGENTS.md fuera de Skills Dispatch, emite [BLOQUEO] con archivo:línea y para.
Cierras cuando G1 se cumple (plan §6) y pnpm sync:skills:check sigue en verde.
Informa: archivos tocados; antes y después de cada disparador; salida de los dos sync:*:check (línea base y cierre); grep de finishing-a-development-branch en .agents/skills/ (solo su propio directorio e INDEX); deuda nueva por severidad.
```
