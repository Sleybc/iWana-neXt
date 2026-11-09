# LAUNCH — ROLES · Auditoría de cruces · Ola 4 (T8 ∥ T9 ∥ T10)

**Plan:** `docs/plans/2026-11-09-roles-auditoria-cruces-olas-2-4-orquestacion.md` v1.3 · **Definición:** `docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md` v1.5, §10.5
**Gates verificados:** G0 ✅ · Ola 2 cerrada: G1, G3 y G4 ✅, commit `359246c4` (G6.5 con el tren, ADR-107 D3)
**Bloqueos abiertos:** ninguno. Cerrado y no se re-despacha: la Ola 2 completa

| # | Agente | Encargo (plan §5) | Skills a leer | Contrato congelado |
| --- | --- | --- | --- | --- |
| T8 | AI-EM-ARCH (sesión principal) | EMA, SRF, FEP, DAT, OPS | `docs-architect` | Informe §10.5 (sin cambios desde v1.3) |
| T9 | AI-EM-ARCH (segunda sesión) | PUX, DSO, QA, SEC | `docs-architect` | Informe §10.5 (sin cambios desde v1.3) |
| T10 | AI-EM-ARCH (tercera sesión) | 8 subagentes ejecutores + sync | `docs-architect` | Informe §10.5 y perfiles en `359246c4` |

**Paralelo:** los tres, sin archivos compartidos; solo T10 corre `pnpm sync:agents`.
**Cierre de ola:** G1′ del plan §6 sobre los 17 archivos.

---

### Bloque copiar-pegar

```text
===== ROLES-CRUCES · Ola 4 · T8 · AI-EM-ARCH (sesión principal) =====
Antes de empezar: git status --short docs/roles .claude/agents .opencode/agents .codex/agents vacío. Si no, para.
Lee AGENTS.md, el informe docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md (§10.5 y §10.6 G0-10) y el plan docs/plans/2026-11-09-roles-auditoria-cruces-olas-2-4-orquestacion.md (§5 reglas, T8 y T9 con la salvaguarda de normas, §6 G1′).
Lee como documentación .agents/skills/docs-architect/SKILL.md.
Alcance: EMA, SRF, FEP, DAT y OPS; cada uno recibe su bloque de §10.5 y la versión fijada en §5 T8 y T9.
===== ROLES-CRUCES · Ola 4 · T9 · AI-EM-ARCH (segunda sesión) =====
Mismas precondiciones y lecturas. Alcance: PUX, DSO, QA y SEC, igual que T8.
===== ROLES-CRUCES · Ola 4 · T10 · AI-EM-ARCH (tercera sesión) =====
Mismas precondiciones y lecturas, con §5 T10. Alcance: los 8 subagentes ejecutores de .claude/agents/ (sr-backend, fe-platform, prod-ux, ds-owner, sr-qa, sec-eng, data-eng, plat-ops): reconcilia sus reglas con el prompt de su perfil, empezando por las tres contradicciones de §5 T10; no reescribas lecturas ni procedimiento. Cierra con pnpm sync:agents y pnpm sync:agents:check.
===== Común a los tres =====
Solo el texto de §10.5 y las reglas de §5. En EMA, SRF, QA y SEC: «Formatos» y «Anti-patrones» literales; ninguna regla retirada sin destino. Fuera de alcance: los archivos de los otros tramos, el protocolo, los verificadores, informes, AGENTS.md, .agents/skills/ y código. Sin Prettier, sin commit, en main.
Si un prompt no cabe en 15 líneas sin perder una regla, o una regla no tiene destino claro: [BLOQUEO] y para.
Reporta: archivo · versión · líneas del prompt · inventario pieza retirada → destino (T8 y T9) · contradicciones corregidas (T10) · salida de pnpm audit:adr-citations (T10: también sync:agents:check) · deuda vista.
```
