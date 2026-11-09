---
# GENERADO por scripts/sync-skills.mjs desde .agents/skills/iwana-tenant-migration/SKILL.md — no editar a mano.
name: iwana-tenant-migration
description: "Crea la siguiente migración tenant NNN_snake_case.ts en packages/database/src/migrations/tenant/, con up/down simétricos, registro en runner.ts y verificación con migration-order.spec.ts. Usar cuando se añaden o cambian tablas, columnas, índices o restricciones de los schemas tenant. No usar para el schema public (→ database-migration)."
metadata:
  category: backend
  triggers: migracion tenant, schema tenant, nueva columna, nueva tabla, indice, runner.ts, TENANT_MIGRATIONS, down reversible
---

# iwana-tenant-migration

Esta skill vive en el catálogo común `.agents/skills/` (gobernado por `.agents/skills/INDEX.md`).

Antes de actuar, lee completo y aplica **`.agents/skills/iwana-tenant-migration/SKILL.md`**. Sus rutas relativas
(`references/`, `scripts/`, `assets/`) se resuelven desde `.agents/skills/iwana-tenant-migration/`.
