# LAUNCH — ROLES · Auditoría de cruces · Ola 2 (T1 ∥ T2 ∥ T3 ∥ T4)

**Plan:** `docs/plans/2026-11-09-roles-auditoria-cruces-olas-2-4-orquestacion.md` v1.1 · **Definición:** `docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md` v1.4, §10
**Gates verificados:** G0-5 a G0-11 ✅ 2026-11-09 (informe §10.6) · Ola 1 cerrada (`75528631`, G6.5 ✅)
**Bloqueos abiertos:** ninguno. Al lanzar, `git status --short docs/roles .claude/agents` debe estar vacío

| # | Agente | Encargo (plan §5) | Skills a leer | Contrato congelado |
| --- | --- | --- | --- | --- |
| T1 | AI-EM-ARCH (sesión principal) | Protocolo v1.10: D1–D9 | `docs-architect` | Informe §10.3 (v1.3, sin cambios en v1.4) |
| T2 | AI-EM-ARCH (segunda sesión) | EMA, SRF, FEP, OPS | `docs-architect` | Informe §10.3 (v1.3, sin cambios en v1.4) |
| T3 | AI-EM-ARCH (tercera sesión) | PUX, DSO, QA, SEC | `docs-architect` | Informe §10.3 (v1.3, sin cambios en v1.4) |
| T4 | AI-EM-ARCH (cuarta sesión) | GAT, BND, CON, TCR + 4 subagentes + sync | `docs-architect` | Informe §10.3 (v1.3, sin cambios en v1.4) |

**Paralelo:** los cuatro, sin archivos compartidos; solo T4 corre `pnpm sync:agents`.
**Cierre de ola:** G1 del plan §6 sobre los 17 archivos.

---

### Bloque copiar-pegar

```text
===== ROLES-CRUCES · Ola 2 · T1 · AI-EM-ARCH (sesión principal) =====
Antes de empezar: git status --short docs/roles .claude/agents vacío. Si no, para.
Lee AGENTS.md, el informe docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md (§10) y el plan docs/plans/2026-11-09-roles-auditoria-cruces-olas-2-4-orquestacion.md (§5 reglas y T1, §6 G1).
Lee como documentación .agents/skills/docs-architect/SKILL.md.
Alcance: solo el protocolo, con la columna «Protocolo v1.10» de D1 a D9 del §10.3 y su cabecera v1.10.
===== ROLES-CRUCES · Ola 2 · T2 · AI-EM-ARCH (segunda sesión) =====
Mismas precondiciones y lecturas, con §5 T2. Alcance: EMA, SRF, FEP y OPS, columna «Espejos» de D1, D7, D10 y D11.
===== ROLES-CRUCES · Ola 2 · T3 · AI-EM-ARCH (tercera sesión) =====
Mismas precondiciones y lecturas, con §5 T3. Alcance: PUX, DSO, QA y SEC, columna «Espejos» de D2, D4, D6, D10 y D11.
===== ROLES-CRUCES · Ola 2 · T4 · AI-EM-ARCH (cuarta sesión) =====
Mismas precondiciones y lecturas, con §5 T4. Alcance: GAT, BND, CON, TCR y los subagentes sr-qa, ds-owner, gate-verifier y boundary-reviewer; cierra con pnpm sync:agents y pnpm sync:agents:check.
===== Común a los cuatro =====
Solo el texto congelado del §10.3; cada archivo sube a la versión del §10.4 con Fecha y changelog. Fuera de alcance: los archivos de los otros tramos, informes, AGENTS.md, .agents/skills/ y código. Sin Prettier, sin commit, en main.
Si el texto no encaja o contradice AGENTS.md o un ADR aprobado: [BLOQUEO] y para.
Reporta: archivo · versión · Dn aplicados · salida de pnpm audit:adr-citations (T4: también sync:agents:check) · deuda vista.
```
