---
# GENERADO por scripts/sync-skills.mjs desde .agents/skills/iwana-matriz-motivos/SKILL.md — no editar a mano.
name: iwana-matriz-motivos
description: "Arma y ejecuta la matriz motivo de rechazo → test integrado de MOD11↔MOD12 con conteo real contra Postgres y Redis. Usar al redactar, aprobar o cerrar un encargo que cruce consumo de inventario de OT, recibos o colas firmadas, o al agregar un motivo de rechazo. No usar para otros módulos (→ testing-patterns)."
metadata:
  category: testing
  triggers: MOD11, MOD12, motivo de rechazo, rejectionReasonCode, test integrado, inventario de OT, recibo, colas firmadas, G4, GO de bloque
---

# iwana-matriz-motivos

Esta skill vive en el catálogo común `.agents/skills/` (gobernado por `.agents/skills/INDEX.md`).

Antes de actuar, lee completo y aplica **`.agents/skills/iwana-matriz-motivos/SKILL.md`**. Sus rutas relativas
(`references/`, `scripts/`, `assets/`) se resuelven desde `.agents/skills/iwana-matriz-motivos/`.
