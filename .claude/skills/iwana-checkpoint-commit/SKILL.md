---
# GENERADO por scripts/sync-skills.mjs desde .agents/skills/iwana-checkpoint-commit/SKILL.md — no editar a mano.
name: iwana-checkpoint-commit
description: Commitea una ola de iWana neXt sobre main, que tiene cambios de varias olas, verificando exactamente el contenido del índice antes de cada commit (stash --keep-index con exclusiones, respaldo SHA-256 de archivos parcialmente en el índice, gate sobre el índice aislado) y, si hay push, revisando la corrida de CI de ese push. Usar cuando el usuario pide commitear una ola, hacer un checkpoint de commits o publicar en main.
disable-model-invocation: true
metadata:
  category: workflow
  triggers: checkpoint, commit por ola, commitear ola, stash keep-index, staging parcial, push a main, G6.5
---

# iwana-checkpoint-commit

Esta skill vive en el catálogo común `.agents/skills/` (gobernado por `.agents/skills/INDEX.md`).

Antes de actuar, lee completo y aplica **`.agents/skills/iwana-checkpoint-commit/SKILL.md`**. Sus rutas relativas
(`references/`, `scripts/`, `assets/`) se resuelven desde `.agents/skills/iwana-checkpoint-commit/`.
