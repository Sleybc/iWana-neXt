# LAUNCH — ROLES · Auditoría de cruces · Ola 2, cierre (T5 → T6 → T7)

**Plan:** `docs/plans/2026-11-09-roles-auditoria-cruces-olas-2-4-orquestacion.md` v1.2 · **Definición:** `docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md` v1.4, §10
**Gates verificados:** G0 ✅ · G1 ✅ 2026-11-09 (plan §6, con los patrones corregidos en v1.2)
**Bloqueos abiertos:** ninguno. Cerrado y no se re-despacha: T1 a T4 (17 archivos, versiones de §10.4)

| # | Agente | Encargo (plan §5) | Skills a leer | Salida |
| --- | --- | --- | --- | --- |
| T5 | AI-EM-ARCH (sesión principal) | Informe vivo §15 y §9.3 del informe de cruces | `docs-architect` | G3 |
| T6 | `docs-governance` (invocado por la misma sesión) | 17 archivos de la Ola 2 + los dos informes | — | G4 |
| T7 | AI-EM-ARCH (sesión principal) | Commit con las 30 rutas del plan §5 T7 | `iwana-checkpoint-commit` | SHA, sin push |

**Secuencia:** T5 → T6 → T7 en una sola sesión. La Ola 4 no arranca hasta que exista el commit de T7.
**Cierre de ola:** G3 y G4 ✅ y commit hecho. G6.5 llega con el tren (ADR-107 D3 y D4).

---

### Bloque copiar-pegar

```text
===== ROLES-CRUCES · Ola 2 · cierre T5 → T6 → T7 · AI-EM-ARCH (sesión principal) =====
Lee AGENTS.md, el plan docs/plans/2026-11-09-roles-auditoria-cruces-olas-2-4-orquestacion.md (§5 T5 y T7, §6 G1, G3 y G4) y el informe docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md (§9 y §10).
Lee como documentación .agents/skills/docs-architect/SKILL.md; antes de T7, .agents/skills/iwana-checkpoint-commit/SKILL.md.
T1 a T4 están cerrados con G1 ✅: no reabras ni retoques sus 17 archivos. Si T6 encuentra un bloqueante en ellos, corrígelo solo si cabe en el texto de §10.3; si no, [BLOQUEO] y para.
T5: informe vivo, §15 «Actualización 2026-11-09 — Auditoría de cruces, Ola 2» (tabla archivo · versión anterior → nueva · Dn; G0-5 a G0-11; gates; los dos patrones de G1 corregidos en el plan v1.2). Informe de cruces: §9.3 con la misma tabla y el Estado al día. Cierra G3 con pnpm audit:doc-locations.
T6: invoca el subagente docs-governance sobre los 17 archivos de la Ola 2 y los dos informes; pásale la lista y la salida de los dos scripts de auditoría. Registra su veredicto en §9.3. Cierra G4.
T7: commit con exactamente las 30 rutas del plan §5 T7 (git add por ruta; nada del resto del árbol, que tiene trabajo ajeno). Mensaje docs(roles) en inglés, con «Línea base de pruebas: no aplica». Sin push, sin --no-verify, en main.
Reporta: secciones escritas, veredicto de docs-governance, SHA del commit, git status de las 30 rutas tras el commit y deuda nueva.
```
