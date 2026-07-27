# ADR-062 — Extensión `pg_trgm` para búsqueda de usuarios (MOD04)

**Estado:** Aprobado  
**Fecha:** 2026-07-22  
**Decisión CTO:** D-2=A ([INFORME-MOD04-OLA-C-ESCALACION-CTO-v1.0](../informes/INFORME-MOD04-OLA-C-ESCALACION-CTO-v1.0.md) §5)  
**GO plataforma:** AI-PLAT-OPS 2026-07-22 (`postgres:18-alpine`, trusted)

## Contexto

`UsersService.findAll` con `search` cargaba toda la tabla del tenant y filtraba en Node (Levenshtein). No escala a cientos de miles de usuarios y la paginación aplicaba el cursor antes del filtro.

## Decisión

Adoptar la extensión PostgreSQL `pg_trgm` con índices GIN `gin_trgm_ops` sobre `users.first_name`, `users.last_name`, `users.email` y `users.job_title`.

- Extensión: migración **public** `018_enable_pg_trgm` (`CREATE EXTENSION IF NOT EXISTS pg_trgm`).
- Índices: migración **tenant** `084_users_search_trgm_indexes`.
- Búsqueda en SQL (ILIKE + operador `%` / similarity); se retira Levenshtein en TypeScript.
- Semántica de `total` / `nextCursor`: total del conjunto filtrado; cursor **después** del filtro (alineado a FE-01).

## Consecuencias

- Requiere imagen Postgres con contrib (`postgres:18` / `18-alpine` en Compose/CI).
- On-prem sin contrib → NO-GO de extensión; fallback documentado: ILIKE/prefijo (opción B del acta).
- `down` de la extensión public no hace `DROP EXTENSION` (riesgo CASCADE entre schemas).
