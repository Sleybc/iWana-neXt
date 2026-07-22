# INFORME MOD04 — Ola C (SR-FULL / servicio-API)

**Versión:** 1.0  
**Fecha:** 2026-07-22  
**Autor:** AI-SR-FULL  
**Estado:** DONE_WITH_CONCERNS  
**Prompt:** [PROMPT-MOD04-OLA-C-v1.0](../prompts/PROMPT-MOD04-OLA-C-v1.0.md)  
**Acta:** [INFORME-MOD04-OLA-C-ESCALACION-CTO-v1.0](./INFORME-MOD04-OLA-C-ESCALACION-CTO-v1.0.md) §5

---

## 1. Resumen

Implementada la capa servicio/API de Ola C para MOD04: búsqueda SQL con `pg_trgm` (H-05), `bulkCreate` async BullMQ (H-06), auditoría de email con hashes (H-15), regla explícita de admin principal (H-12), evidencia H-14 (sin retiro aún), FE-12 documentado.

## 2. Cambios por hallazgo (`file:line` principales)

| ID | Cambio | Ubicación |
| --- | --- | --- |
| H-05 | `findAll` con search en SQL (`ILIKE` + `%` / similarity); cursor **después** del filtro; `total` = COUNT del filtro | `apps/api/src/modules/users/users.service.ts` (~280–400) |
| H-05 | Retirado Levenshtein / filtro en Node | mismo archivo (helpers) |
| H-05 | Extensión `pg_trgm` | `packages/database/src/migrations/public/018_enable_pg_trgm.ts` |
| H-05 | Índices GIN `public.gin_trgm_ops` | `packages/database/src/migrations/tenant/084_users_search_trgm_indexes.ts` + `runner.ts` |
| H-05 | ADR | `docs/adrs/ADR-062-Extension-pg-trgm-Busqueda-Usuarios.md` |
| H-05 | OpenAPI search | `apps/api/src/modules/users/users.controller.ts` (~97–105) |
| H-06 | Encola job + Idempotency-Key; status + claim one-time | `users.service.ts` (`bulkCreate` / `getBulkJobStatus` / `claimBulkJobResult` / `executeBulkCreateJob`) |
| H-06 | HTTP 202 + GET/POST jobs | `apps/api/src/modules/users/users-bulk.controller.ts` |
| H-06 | Processor (API process; ver deuda) | `users-bulk-create.processor.ts`, `users.module.ts` |
| H-06 | Contrato tipado | `packages/shared/src/contracts/users-bulk-create.contract.ts`, `queue-names.ts` |
| H-06 | UX consumida | `docs/specs/UX-MOD04-BULKCREATE-ASYNC-OLA-C-v1.0.md` |
| H-15 | `previousEmailHash` / `nextEmailHash` (SEC APROBAR A) | `users.service.ts` `changeLoginEmail` / `changeLoginEmailAsAdmin` |
| H-12 | Regla documentada + propuesta `principal_admin_user_id` (no mergeada) | `isPrincipalAdminUser` JSDoc |
| H-14 | Retirado `decodeLegacyValue` + `MFA_ENCRYPTION_KEY` en UsersService (GO DATA-ENG) | `users.service.ts` `toDto`; tests plaintext |
| FE-12 | Precarga RSC no forzada (token localStorage) | `apps/portal/src/app/dashboard/users/page.tsx` |
| H-03 | Consumo: migración DATA-ENG `083` ya en runner | `083_align_users_entity_ddl.ts` |

## 3. Veredictos externos aplicados

| Fuente | Resultado |
| --- | --- |
| PLAT-OPS D-2 | **GO** `pg_trgm` |
| SEC-ENG D-4 | **APROBAR A** hashes |
| PROD-UX D-3 | Spec UX congelada (polling + one-time credentials) |

## 4. Medición H-05 (≥50k)

Schema `tenant_bench_h05`, **50 000** filas (`scripts/mod04-h05-search-bench.sql`).

| Escenario | Resultado |
| --- | --- |
| Filas sembradas | 50 000 |
| BEFORE — Seq Scan ILIKE `%ana%` (índices deshabilitados) | **~57 ms** |
| AFTER — `LIMIT 51` ILIKE `%soporte%` | **~0.81 ms** execution |
| AFTER — COUNT ILIKE `%soporte%` | **~11.5 ms** |
| AFTER — fuzzy `% 'lilina'` (sin filas match en seed) | ~134 ms (planner PK+filter; follow-up) |
| BEFORE app (eliminado) | Hydrate tabla completa + Levenshtein en Node |

**Cierre:** paginación correcta + SQL + sin Levenshtein. Ganancia clara en listados acotados (`LIMIT`); fuzzy corto merece afinado de plan en follow-up.

## 5. H-14

GO DATA-ENG (`INFORME-MOD04-OLA-C-DATA-ENG-v1.0.md`): 0 residuales en todos los `tenant_*` del lab.

**Retirado:**
- `decodeLegacyValue` / `decryptLegacyValue`
- carga de `MFA_ENCRYPTION_KEY` vía `loadAesGcmKeyPair` en `UsersService`
- `ConfigModule` en `UsersModule` (solo existía por esa ruta)

`toDto` mapea email/perfil/documentNumber en texto plano. MFA real permanece en Auth (sin cambio).

## 6. Tests (salida real)

```
Test Suites: 4 passed, 4 total  (src/modules/users)
Tests:       110 passed, 110 total
```

(H-14 follow-up: retirados 4 casos de descifrado legacy; mapping plaintext cubierto.)

## 7. Migraciones

| Escenario | Resultado |
| --- | --- |
| Public `018` | Aplicada (`EnablePgTrgm0180000000000`) |
| Tenant `083`+`084` en `tenant_iwana` | OK (`migration:tenant:run`) |
| Índice GIN | Requiere `public.gin_trgm_ops` (search_path tenant) |

## 8. Riesgos residuales / concerns

1. **Processor de bulk en `@iwana/api`** (no en worker) para reutilizar `UsersService.create`. Deuda: mover a worker cuando el alta se extraiga a dominio compartido.
2. **Contrato breaking** `POST /users/bulk` → 202 + jobId (FE-PLATFORM debe adoptar UX async).
3. **H-12** propuesta de modelo sin merge — escala a EM-ARCH.
4. **Planner** en queries trigram cortas: monitorear EXPLAIN en staging.
5. **Prod H-14:** re-ejecutar `scripts/db/mod04-ola-c-h14-scan.sql` antes de producción; residual ≠ 0 → BLOCKED.

## 9. Status

**DONE_WITH_CONCERNS** — gates users en verde; medición aportada; OpenAPI actualizado; sin commit/push.
