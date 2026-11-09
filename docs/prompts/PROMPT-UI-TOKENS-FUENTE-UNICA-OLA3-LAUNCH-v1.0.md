# LAUNCH — UI · TOKENS-FUENTE-UNICA · Ola 3

**Plan:** `docs/plans/2026-11-08-ui-tokens-fuente-unica-orquestacion.md` v1.3 · **Spec:** `docs/specs/2026-11-08-ui-tokens-fuente-unica-spec.md` v1.3
**Ola que lanza:** Ola 3 — B3 (evidencia visual) ∥ B4 (gates) · **Gates:** G0 ✅ · G1 ✅ · G2 ✅ · G3 y G4 no iniciados
**Bloqueos abiertos:** ninguno. P4 (CI de `main` en rojo) solo bloquea B6

| # | Subagente | Encargo | Skills a leer antes de trabajar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-qa` | Plan §5 B3 | `e2e-testing-patterns`, `wcag-audit-patterns` | Spec v1.3 §5 |
| 2 | `gate-verifier` | Plan §5 B4 | — (verificador auxiliar) | Spec v1.3 §8 criterio 3 |

**Paralelo:** 1 y 2 a la vez; los dos son de solo lectura sobre el código. Cada uno levanta y detiene solo sus propios procesos.
**Cierre de ola:** G3 y G4 (plan §6). No hay prompt de ejecución aparte: el encargo es el plan §5.

---

### Bloque copiar-pegar

```text
===== UI-TOKENS-FUENTE-UNICA · Ola 3 · B3 · sr-qa =====
Actúa como sr-qa. Lee AGENTS.md, el spec docs/specs/2026-11-08-ui-tokens-fuente-unica-spec.md (§5, §8 y §9) y el plan docs/plans/2026-11-08-ui-tokens-fuente-unica-orquestacion.md (§5 B3, §6 G3).
Antes de trabajar, lee los SKILL.md de e2e-testing-patterns y wcag-audit-patterns (como documentación).
Alcance: corre docs/informes/evidence/ui-tokens-fuente-unica/antes/capturas.mjs sin cambios sobre el árbol actual, con salida en docs/informes/evidence/ui-tokens-fuente-unica/despues/; compara las 8 parejas píxel a píxel. Solo se admiten diferencias en modo claro en los íconos de SectionAccordion (líneas 154 y 227: lima → iwana-secondary-700); mide su contraste final. Confirma en el CSS generado por la app que shadow-iwana-secondary/20 es una sombra de color lima al 20 % (criterio 6). Repite audit-ui.mjs sobre packages/ui/src.
Fuera de alcance: editar código, packages/ui, la suite e2e/ y .agents/skills/. En main, sin commit. Nunca mates procesos por nombre (taskkill /IM node.exe, turbo.exe ni similares): solo los PID que lanzaste tú.
Cierras cuando G3 se cumple: cada diferencia está explicada por §5 o es un hallazgo.
Informa: tabla de las 8 parejas (idéntica o con diferencia y su causa), contraste medido, regla CSS de la sombra, salida de audit-ui.mjs y deuda nueva por severidad.

===== UI-TOKENS-FUENTE-UNICA · Ola 3 · B4 · gate-verifier =====
Actúa como gate-verifier. Lee AGENTS.md («Gates Before Merge»), el spec (§8 criterio 3, §9.3) y el plan (§5 B4, §6 G4).
Alcance: los gates sobre @iwana/ui, @iwana/web y @iwana/portal, sin caché de Turbo (Cached: 0): lint, typecheck y pruebas con conteo real. Línea base declarada por fe-platform: 55, 233 y 3.479 tests. Separa los rojos ya presentes en esa línea base (apps/portal tiene specs de otras olas sin commitear) de los nuevos; solo los nuevos bloquean. Si algún spec cambió en el diff de packages/ui, deriva a test-change-reviewer.
Fuera de alcance: corregir código o pruebas. Nunca mates procesos por nombre (taskkill /IM node.exe, turbo.exe ni similares): solo los PID que lanzaste tú.
Cierras cuando G4 tiene veredicto con evidencia.
Informa: comando, conteo y Cached por paquete y gate; rojos nuevos frente a preexistentes; veredicto de G4.
```
