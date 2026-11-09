# LAUNCH — UI · TOKENS-FUENTE-UNICA

**Plan:** `docs/plans/2026-11-08-ui-tokens-fuente-unica-orquestacion.md` v1.1 · **Spec:** `docs/specs/2026-11-08-ui-tokens-fuente-unica-spec.md` v1.1
**Ola que lanza:** Ola 1 — B1, veredictos y contrato de sustitución · **Gates:** G0 pendiente (CTO) · G1, G2, G3, G4, G6 y G6.5 no iniciados
**Bloqueos abiertos:** [BLOQUEO] G0 (spec §6) — no lanzar B1 hasta que el CTO resuelva D1 y D2

| # | Subagente | Encargo | Skills a leer antes de trabajar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `ds-owner` | Plan §5 B1; spec §5 | `core-components`, `iwana-identity-ui-review`, `wcag-audit-patterns` | Ninguno: B1 produce el spec §5, que queda congelado al cerrar G1 |

**Paralelo:** ninguno; B1 es la única pieza de la ola.
**Cierre de ola:** G1 del plan §6 (spec §5 sin celdas «(B1)» y congelado). No hay prompt de ejecución aparte: el encargo es el plan §5 B1.

---

### Bloque copiar-pegar

```text
===== UI-TOKENS-FUENTE-UNICA · Ola 1 · B1 · ds-owner =====
Requisito: G0 cerrado (spec §6, D1 y D2). Si falta, no arranques.
Actúa como ds-owner. Lee AGENTS.md, el spec docs/specs/2026-11-08-ui-tokens-fuente-unica-spec.md (§2, §3, §5) y el plan docs/plans/2026-11-08-ui-tokens-fuente-unica-orquestacion.md (§5 B1).
Antes de trabajar, lee los SKILL.md de core-components, iwana-identity-ui-review y wcag-audit-patterns (como documentación).
Corre node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs packages/ui/src y contrasta con la tabla H4 del spec.
Alcance: solo completar la tabla del spec §5. Por fila: token destino (con su modificador), veredicto con motivo (real, falso positivo o se mantiene) y si hay cambio visual. Para los P1, contraste medido sobre el fondo real en claro y en oscuro, y si es texto o ícono aria-hidden. Decide el token de texto para #181818 en modo claro.
Fuera de alcance: editar código, crear tokens, apps/ y .agents/skills/. Sin Prettier. En main, sin commit.
Si un veredicto exige un token que no existe en globals.css, emite [BLOQUEO] con la fila y para.
Cierras cuando G1 se cumple: §5 sin celdas «(B1)» y congelado.
Informa: tabla final, P1 confirmados y descartados con su contraste, y deuda nueva por severidad.
```
