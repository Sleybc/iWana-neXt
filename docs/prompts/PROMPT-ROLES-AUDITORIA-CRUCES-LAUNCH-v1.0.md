# LAUNCH — ROLES · Auditoría de cruces · Ola A (T1 ∥ T2)

**Plan:** `docs/plans/2026-11-08-roles-auditoria-cruces-orquestacion.md` v1.1 · **Definición:** `docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md` v1.1
**Ola que lanza:** A — T1 ∥ T2 · **Gates verificados:** G0 ✅ 2026-11-08 (informe §8) · P1 abierta (B4–B6 de la consolidación de skills)
**Bloqueos abiertos:** [BLOQUEO] no lanzar hasta que cierre P1; `git status --short docs/roles` debe estar vacío

| # | Agente | Encargo (plan §5) | Skills a leer antes de editar | Contrato congelado |
| --- | --- | --- | --- | --- |
| T1 | AI-EM-ARCH (sesión principal) | §5 T1: EMA, SRF, FEP, DAT, OPS, ANX | `docs-architect` | Protocolo v1.9 (no se edita) |
| T2 | AI-EM-ARCH (segunda sesión) | §5 T2: PUX, DSO, QA, SEC | `docs-architect`; `iwana-test-evidence` solo para QA §5.8 | Protocolo v1.9 (no se edita) |

**Paralelo:** T1 y T2 no comparten archivos; ninguno toca informes (eso es T3).
**Cierre de ola:** G1 del plan §6 sobre los 10 archivos, con `pnpm audit:adr-citations` en `BLOQUEANTE: 0`.

---

### Bloque copiar-pegar

```text
===== ROLES-CRUCES · Ola A · T1 · AI-EM-ARCH (sesión principal) =====
Antes de empezar: G0 ✅ en el informe §8 y P1 cerrada (consolidación de skills publicada); git status --short docs/roles vacío. Si no, para.
Lee AGENTS.md, el informe docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md (§4–§8) y el plan docs/plans/2026-11-08-roles-auditoria-cruces-orquestacion.md (§5 reglas y T1, §6 G1).
Lee como documentación .agents/skills/docs-architect/SKILL.md.
Alcance: solo EMA, SRF, FEP, DAT, OPS y ANX, con los cambios de la tabla T1; cada archivo sube versión, Fecha y changelog.
Fuera de alcance: protocolo, verificadores, PUX/DSO/QA/SEC (T2), informes, AGENTS.md, .claude/agents/ y código. Sin Prettier, sin commit, en main.
Si un cambio exige tocar protocolo, RACI o gates: [BLOQUEO] y para.
Cierras con la parte de G1 de tus archivos. Reporta: archivo · versión · cambios · salida de pnpm audit:adr-citations · deuda vista.
===== ROLES-CRUCES · Ola A · T2 · AI-EM-ARCH (segunda sesión) =====
Mismas precondiciones y lecturas que T1, con §5 T2.
Lee como documentación .agents/skills/docs-architect/SKILL.md; .agents/skills/iwana-test-evidence/SKILL.md solo para la §5.8 de QA.
Alcance: solo PUX, DSO, QA y SEC, con los cambios de la tabla T2; cada archivo sube versión, Fecha y changelog.
No toques la autoridad de bloqueo por cobertura de QA (C2) ni la escalación o el veto de SEC (C4): son de la Ola 2.
Fuera de alcance, cierre y reporte: iguales que T1, sobre tus cuatro archivos.
```
