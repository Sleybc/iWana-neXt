# LAUNCH — UI · ANILLO-FOCO-AUTH

**Plan:** `docs/plans/2026-11-08-ui-anillo-foco-auth-orquestacion.md` v1.1 · **Spec:** `docs/specs/2026-11-08-ui-anillo-foco-auth-spec.md` v1.1
**Ola que lanza:** Ola 1 — B1, contrato del anillo de foco · **Ola cerrada:** G1 ✅ 2026-11-08 (spec §9.2); no relanzar
**Bloqueos abiertos:** ninguno para B1. P2 del plan (specs de otra sesión en `apps/portal/src/components/auth/`) solo afecta a B2

| # | Subagente | Encargo | Skills a leer antes de trabajar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `ds-owner` | Plan §5 B1; spec §5 | `core-components`, `iwana-identity-ui-review`, `wcag-audit-patterns` | Ninguno: B1 produce el spec §5, que queda congelado al cerrar G1 |

**Paralelo:** ninguno; B1 es la única pieza de la ola.
**Cierre de ola:** G1 del plan §6. No hay prompt de ejecución aparte: el encargo es el plan §5 B1.

---

### Bloque copiar-pegar

```text
===== UI-ANILLO-FOCO-AUTH · Ola 1 · B1 · ds-owner =====
Requisito: G0 cerrado (spec §6, D1 y D2). Si falta, no arranques.
Actúa como ds-owner. Lee AGENTS.md, el spec docs/specs/2026-11-08-ui-anillo-foco-auth-spec.md (§2 a §5) y el plan docs/plans/2026-11-08-ui-anillo-foco-auth-orquestacion.md (§5 B1).
Antes de trabajar, lee los SKILL.md de core-components, iwana-identity-ui-review y wcag-audit-patterns (como documentación).
Corre node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/app/auth y contrasta con H7 y H8.
Alcance: solo completar la tabla del spec §5 (una fila por línea con hex si D1). Por fila: clase destino, veredicto con motivo y si hay cambio visual. Mide el anillo contra el fondo del campo y del contenedor, en claro y en oscuro, y el hover de los enlaces de H9. Decide el anillo de error y cómo compone apps/web su borde oscuro con la constante.
Fuera de alcance: editar código, crear tokens, .agents/skills/ y e2e/. Sin Prettier. En main, sin commit.
Si un veredicto exige un token que no existe en globals.css, emite [BLOQUEO] con la fila y para.
Cierras cuando G1 se cumple: §5 sin celdas «(B1)» y congelado.
Informa: tabla final, contrastes medidos y deuda nueva por severidad.
```
