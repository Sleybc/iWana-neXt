---
# GENERADO por scripts/sync-skills.mjs desde .agents/skills/iwana-test-evidence/SKILL.md — no editar a mano.
name: iwana-test-evidence
description: Ejecuta las pruebas de uno o mas paquetes de iWana neXt sin cache de Turbo y reporta el conteo real de suites, tests y cobertura. Usar antes de declarar verde una fase, un informe, una ola o el gate de cobertura ≥80 %, y siempre que una corrida termine sospechosamente rapido o sin cifras. Complementa a verification-before-completion con los comandos y trampas propios de este monorepo.
metadata:
  category: testing
  triggers: tests verdes, evidencia, conteo de tests, cobertura, gate, turbo cache, passWithNoTests, cierre de fase, informe
---

# iwana-test-evidence

Esta skill vive en el catálogo común `.agents/skills/` (gobernado por `.agents/skills/INDEX.md`).

Antes de actuar, lee completo y aplica **`.agents/skills/iwana-test-evidence/SKILL.md`**. Sus rutas relativas
(`references/`, `scripts/`, `assets/`) se resuelven desde `.agents/skills/iwana-test-evidence/`.
