---
# GENERADO por scripts/sync-skills.mjs desde .agents/skills/iwana-checkpoint-commit/SKILL.md — no editar a mano.
name: iwana-checkpoint-commit
description: "Commitea una ola sobre main verificando el contenido exacto del índice (stash --keep-index, respaldo SHA-256, gate sobre el índice aislado) y revisa el CI del push. Usar cuando el usuario pide commitear una ola, hacer un checkpoint o publicar en main. No usar sin esa petición expresa."
disable-model-invocation: true
metadata:
  category: workflow
  triggers: checkpoint, commit por ola, commitear ola, stash keep-index, staging parcial, push a main, G6.5
---

# iwana-checkpoint-commit

Esta skill vive en el catálogo común `.agents/skills/` (gobernado por `.agents/skills/INDEX.md`).

Antes de actuar, lee completo y aplica **`.agents/skills/iwana-checkpoint-commit/SKILL.md`**. Sus rutas relativas
(`references/`, `scripts/`, `assets/`) se resuelven desde `.agents/skills/iwana-checkpoint-commit/`.
