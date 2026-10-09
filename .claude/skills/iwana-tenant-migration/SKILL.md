---
# GENERADO por scripts/sync-skills.mjs desde .agents/skills/iwana-tenant-migration/SKILL.md — no editar a mano.
name: iwana-tenant-migration
description: Crea la siguiente migracion de schema tenant de iWana neXt (packages/database/src/migrations/tenant/NNN_snake_case.ts) con up/down simetricos, la registra en runner.ts y la verifica contra migration-order.spec.ts. Usar al añadir o cambiar tablas, columnas, indices o restricciones de los schemas tenant. Complementa a database-migration, que es generica; no aplica a migraciones del schema public.
disable-model-invocation: true
metadata:
  category: backend
  triggers: migracion tenant, schema tenant, nueva columna, nueva tabla, indice, runner.ts, TENANT_MIGRATIONS, down reversible
---

# iwana-tenant-migration

Esta skill vive en el catálogo común `.agents/skills/` (gobernado por `.agents/skills/INDEX.md`).

Antes de actuar, lee completo y aplica **`.agents/skills/iwana-tenant-migration/SKILL.md`**. Sus rutas relativas
(`references/`, `scripts/`, `assets/`) se resuelven desde `.agents/skills/iwana-tenant-migration/`.
