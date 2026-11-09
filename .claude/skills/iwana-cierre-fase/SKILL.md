---
# GENERADO por scripts/sync-skills.mjs desde .agents/skills/iwana-cierre-fase/SKILL.md — no editar a mano.
name: iwana-cierre-fase
description: "Cierra una fase de un módulo con INFORME en docs/informes/, plan de orquestación con matriz agente×skill en docs/plans/ y launcher de máximo 40 líneas en docs/prompts/, mostrado completo en la respuesta. Usar cuando el usuario pide cerrar, consolidar o despachar la siguiente fase. No usar para un plan suelto (→ writing-plans)."
disable-model-invocation: true
metadata:
  category: workflow
  triggers: cierre de fase, cerrar fase, informe de fase, plan de orquestacion, matriz de dispatch, launcher, siguiente ola
---

# iwana-cierre-fase

Esta skill vive en el catálogo común `.agents/skills/` (gobernado por `.agents/skills/INDEX.md`).

Antes de actuar, lee completo y aplica **`.agents/skills/iwana-cierre-fase/SKILL.md`**. Sus rutas relativas
(`references/`, `scripts/`, `assets/`) se resuelven desde `.agents/skills/iwana-cierre-fase/`.
