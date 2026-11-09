---
# GENERADO por scripts/sync-skills.mjs desde .agents/skills/iwana-queue-inspect/SKILL.md — no editar a mano.
name: iwana-queue-inspect
description: "Inspección de solo lectura de las colas BullMQ del Redis de desarrollo: conteos por estado y últimos fallos con su motivo. Usar al depurar relay, eventos, DLQ o recibos de OT, o antes de afirmar que una cola quedó drenada. No usar para escribir productores o consumidores (→ bullmq-specialist)."
metadata:
  category: backend
  triggers: BullMQ, cola, job fallido, DLQ, relay, outbox, Redis, worker, drenada, failedReason
---

# iwana-queue-inspect

Esta skill vive en el catálogo común `.agents/skills/` (gobernado por `.agents/skills/INDEX.md`).

Antes de actuar, lee completo y aplica **`.agents/skills/iwana-queue-inspect/SKILL.md`**. Sus rutas relativas
(`references/`, `scripts/`, `assets/`) se resuelven desde `.agents/skills/iwana-queue-inspect/`.
