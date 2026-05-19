---
description: "Use when writing or updating TypeORM migrations, tenant schema logic, DataSource configuration, search_path handling, or PostgreSQL multi-tenant persistence in packages/database. Covers reversible migrations and schema-safe tenancy rules."
applyTo: "packages/database/**"
---

# Database and Tenancy Instructions

Referencia maestra: `AGENTS.md`.

- `packages/database` es la fuente de verdad para DataSource, entidades, contexto de tenant y migraciones versionadas.
- Distinguir siempre entre migraciones de `public` y migraciones de `tenant`; no mezclar responsabilidades.
- Para schemas tenant, validar nombres antes de interpolarlos y usar helpers aprobados como `runInTenantSchema()`.
- Las migraciones de tenant deben ser idempotentes cuando el flujo operativo lo requiera y dejar manejo claro de fallos parciales.
- En migraciones tenant, registrar resultado por schema y fallar el proceso completo si hay fallos parciales; no dejar errores silenciosos.
- Al agregar una nueva migracion ejecutable por CLI, mantener sincronizados los scripts de `package.json` o el punto de entrada operativo para evitar que el runner siga apuntando a una migracion anterior.
- Usar `IF NOT EXISTS` o estrategia equivalente cuando la migracion retroactiva de tenant deba tolerar reintentos operativos.
- Mantener el patron de `main()` con importacion dinamica del DataSource cuando el script de migracion se ejecute directamente desde `dist`.
- Mantener comentarios en espanol cuando la logica de migracion, tenancy o seguridad de datos no sea trivial.
- Antes de proponer cambios de persistencia, revisar entidades, `data-source.ts`, migraciones existentes y ADRs aplicables.
