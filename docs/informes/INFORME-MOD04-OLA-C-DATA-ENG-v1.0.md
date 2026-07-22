# INFORME MOD04 — Ola C (DATA-ENG / modelo y migraciones)

**Versión:** 1.1  
**Fecha:** 2026-07-22  
**Autor:** AI-DATA-ENG  
**Estado:** DONE_WITH_CONCERNS  
**Prompt:** [PROMPT-MOD04-OLA-C-v1.0](../prompts/PROMPT-MOD04-OLA-C-v1.0.md)  
**Acta:** [INFORME-MOD04-OLA-C-ESCALACION-CTO-v1.0](./INFORME-MOD04-OLA-C-ESCALACION-CTO-v1.0.md) §5  
**Consumidor:** AI-SR-FULL / AI-EM-ARCH

---

## 1. Resumen

Cierre de datos Ola C: migraciones tenant `083`/`084` + public `018` en runner; huérfanas `003`/`004`/`005` retiradas del árbol; convergencia DDL demostrada (nuevo ≡ preexistente); H-14 = **0 residuales** en todos los `tenant_*` del lab → **GO** escrito para retirar `decodeLegacyValue`. D-2A con GO PLAT-OPS y [ADR-062](../adrs/ADR-062-Extension-pg-trgm-Busqueda-Usuarios.md). H-12: regla documentada en servicio + [ADR-063 borrador](../adrs/ADR-063-Admin-Principal-Explicito-MOD04.md) **sin merge**.

## 2. Migraciones — veredicto

| Artefacto | Runner | Idempotencia | Reversible | Evidencia |
| --- | --- | --- | --- | --- |
| Public `018_enable_pg_trgm` | Glob public | `CREATE EXTENSION IF NOT EXISTS` | `down` no-op (ADR-062) | `pg_trgm` v1.6 instalada |
| Tenant `083_align_users_entity_ddl` | `TENANT_MIGRATIONS` | Solo altera si difiere | up/down en schema sintético | Aplicada en `tenant_iwana` |
| Tenant `084_users_search_trgm_indexes` | `TENANT_MIGRATIONS` | `IF NOT EXISTS` + `public.gin_trgm_ops` | `DROP INDEX IF EXISTS` | Índices GIN presentes; CLI revert 084 OK |

**No editar `000`.** Contrato objetivo = `user.entity.ts` (email 255 + `uq_users_email`; nombres 100 + idx; document_number 30).

### Huérfanas

| Archivo | Estado |
| --- | --- |
| `003_add_user_profile_fields.ts` | Retirado (nunca en runner; columnas en `000`) |
| `004_add_mfa_required_to_users.ts` | Retirado (nunca en runner; columna en `000`) |
| `005_simplify_user_fields.ts` | Retirado; DDL estructural absorbido por `083` |

## 3. Convergencia DDL

Script: `scripts/db/mod04-ola-c-convergence-probe.sql`

| schema | email | first | last | doc | uq_email | idx nombres | idx email_trgm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `tenant_iwana` (preexistente) | 255 | 100 | 100 | 30 | sí | sí | sí |
| `tenant_mod04_ola_c_conv` (000+083+084 sintético) | 255 | 100 | 100 | 30 | sí | sí | sí |

**Veredicto:** `distinct_fingerprints = 1` → `OK_CONVERGENCE`.

Reversibilidad `083`: `scripts/db/mod04-ola-c-083-reversibility.sql` → after_up (255/100/30 + uq/idx) → after_down (512 + sin uq/idx).

## 4. H-14 — evidencia

Script canónico: `scripts/db/mod04-ola-c-h14-scan.sql` (gemelo `scripts/mod04-h14-legacy-scan.sql`).

```
NOTICE: schema=tenant_bench_h05 ... residual=0  (50000 filas; DDL bench incompleto)
NOTICE: schema=tenant_iwana ... residual=0
NOTICE: H-14 SUMMARY schemas_scanned=2 schemas_with_residual=0
```

### GO — retiro `decodeLegacyValue`

**Veredicto DATA-ENG: GO** para AI-SR-FULL (lab actual). Antes de producción: re-ejecutar el mismo script; si `schemas_with_residual > 0` → **BLOCKED**.

## 5. D-2 / H-05 — medición (≥50k)

- Seed/bench: `scripts/mod04-h05-search-bench.mjs` + schema `tenant_bench_h05` (**50 000** filas presentes).
- Índices GIN bench: `idx_bench_users_*_trgm`.
- Medición SQL lab (2026-07-22):

| Escenario | Plan | Execution Time |
| --- | --- | --- |
| ILIKE `%xyzzy%` OR×4 (proxy pre-H-05 / sin uso GIN) | Seq Scan 50k | **~37.8 ms** |
| `%` selectivo `first_name % 'xyzzyunlikely'` | Bitmap Index Scan `idx_bench_users_fn_trgm` | **~0.18 ms** |
| `%` alta selectividad / OR amplio | a veces Index Scan PK + Filter | sub-ms a ~0.5 ms (planificador) |

**Coordinación SR-FULL:** forma de la query (evitar OR que hinche selectividad) para favorecer GIN; semántica `total`/`nextCursor` post-filtro (FE-01).

Script Node completo requiere `DB_*` en el entorno del operador (no embebido en este informe).

## 6. H-12 — admin principal

- Regla **explícita en código** (JSDoc + `isPrincipalAdminUser`: ADMIN activo más antiguo por `createdAt`) — SR-FULL.
- Cambio de modelo **no decidido**: borrador [ADR-063](../adrs/ADR-063-Admin-Principal-Explicito-MOD04.md) opción B (`public.tenants.principal_admin_user_id`). Pendiente GO EM-ARCH/CTO.

## 7. Artefactos tocados (DATA-ENG)

| Ruta | Rol |
| --- | --- |
| `packages/database/src/migrations/tenant/083_align_users_entity_ddl.ts` | D-1 / H-03 |
| `packages/database/src/migrations/tenant/084_users_search_trgm_indexes.ts` | D-2 / H-05 |
| `packages/database/src/migrations/public/018_enable_pg_trgm.ts` | D-2 extensión |
| `packages/database/src/migrations/tenant/runner.ts` | Registro 083+084 |
| `docs/adrs/ADR-062-…` | Extensión pg_trgm (aceptado) |
| `docs/adrs/ADR-063-…` | Admin principal (propuesto) |
| `scripts/db/mod04-ola-c-*.sql` | Evidencia H-14 / DDL / convergencia / 083 rev |
| `scripts/mod04-h05-search-bench.mjs` | Seed+medición ≥50k |

## 8. Concerns / hand-off

1. **H-12:** ADR-063 propuesto — no implementar sin GO.
2. **Revert CLI `083` en `tenant_iwana`:** no re-ejecutado en esta pasada (sí `084` vía CLI; `083` up/down en sintético). Operador puede: `migration:tenant:revert -- --schema=tenant_iwana --steps=2 --yes` luego `migration:tenant:run`.
3. **Planificador:** OR de ILIKE/`%` puede no elegir GIN en consultas poco selectivas; SR-FULL afinará predicado.
4. Sin commit/push (restricción Ola C).

## 9. Status

**DONE_WITH_CONCERNS** — datos Ola C entregados; concerns = H-12 diferido + afinado de plan GIN + revert 083 live opcional.

---

*Sin PII. Naming `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`.*
