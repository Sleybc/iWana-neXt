# LAUNCH — ROLES · Auditoría de cruces · Ola 4, cierre (T8-R → T11 → T12 → T13)

**Plan:** `docs/plans/2026-11-09-roles-auditoria-cruces-olas-2-4-orquestacion.md` v1.4 · **Definición:** `docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md` v1.5, §10.5
**Gates verificados:** G1′ ✅ salvo dos cabeceras (plan §6), que cierra T8-R · Ola 2 cerrada (`359246c4`)
**Bloqueos abiertos:** ninguno. Cerrado y no se re-despacha: T8 a T10, salvo la línea de versión de EMA y SRF

| # | Agente | Encargo (plan §5) | Skills a leer | Salida |
| --- | --- | --- | --- | --- |
| T8-R | AI-EM-ARCH (sesión principal) | Cabecera `**Versión:**` de EMA → 2.9 y SRF → 2.4 | — | G1′ completo |
| T11 | AI-EM-ARCH (sesión principal) | Informe vivo §16 y §9.4 del informe de cruces | `docs-architect` | G3′ |
| T12 | `docs-governance` (invocado por la misma sesión) | 12 archivos cambiados + los dos informes | — | G4′ |
| T13 | AI-EM-ARCH (sesión principal) | Commit con las 23 rutas del plan §5 T13 | `iwana-checkpoint-commit` | SHA, sin push |

**Secuencia:** T8-R → T11 → T12 → T13 en una sola sesión.
**Cierre de ola:** G4′ ✅ y commit hecho. G6.5 llega con el tren (ADR-107 D3 y D4). Con la Ola 4 se completa la remediación de la auditoría.

---

### Bloque copiar-pegar

```text
===== ROLES-CRUCES · Ola 4 · cierre T8-R → T11 → T12 → T13 · AI-EM-ARCH (sesión principal) =====
Lee AGENTS.md, el plan docs/plans/2026-11-09-roles-auditoria-cruces-olas-2-4-orquestacion.md (§5 T8-R, T11 y T13; §6 G1′ con su veredicto y G4′) y el informe docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md (§9 y §10).
Lee como documentación .agents/skills/docs-architect/SKILL.md; antes de T13, .agents/skills/iwana-checkpoint-commit/SKILL.md.
T8-R: solo la línea **Versión:** de la cabecera de EMA (2.8 → 2.9) y de SRF (2.3 → 2.4). Nada más en esos archivos ni en los otros 10 de T8 a T10.
T11: informe vivo, §16 «Actualización 2026-11-09 — Auditoría de cruces, Ola 4» (tabla archivo · versión · prompt en líneas; 3 contradicciones de T10; veredicto de G1′; deuda no bloqueante del plan §6). Informe de cruces: §9.4 con la misma tabla y Estado «remediación completa (olas 0 a 4)»; pendientes externos: §7 con el CTO y Legal, y G6.5 de 359246c4 y de este commit con su tren. Cierra G3′ con pnpm audit:doc-locations.
T12: invoca el subagente docs-governance sobre los 12 archivos cambiados (9 perfiles y sr-backend, fe-platform y sec-eng) y los dos informes; pásale la lista y la salida de los dos scripts. Registra su veredicto en §9.4. Cierra G4′. Si encuentra un bloqueante en T8 a T10, corrígelo solo si cabe en §10.5 o en la salvaguarda del plan §5; si no, [BLOQUEO] y para.
T13: commit con exactamente las 23 rutas del plan §5 T13 (git add por ruta; el resto del árbol tiene trabajo ajeno). Mensaje docs(roles) en inglés, con «Test baseline: not applicable». Sin push, sin --no-verify, en main.
Reporta: cabeceras corregidas, secciones escritas, veredicto de docs-governance, SHA, git status de las 23 rutas tras el commit y deuda nueva.
```
