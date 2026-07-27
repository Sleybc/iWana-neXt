# INFORME — ADR-065 Ola 2: índices de paginación / orden

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-SR-FULL  
**Prompt:** [PROMPT-ADR065-OLA2-INDICES-v1.0](../prompts/PROMPT-ADR065-OLA2-INDICES-v1.0.md)  
**Kickoff:** [INFORME-ADR065-KICKOFF-OLAS-RESTANTES-v1.0](INFORME-ADR065-KICKOFF-OLAS-RESTANTES-v1.0.md)  
**Deuda:** D-2 (R-5) + D-3 (índices + p95 + sortableFields)  
**Clasificación:** Uso interno

---

## Resumen ejecutivo

Migración tenant **`089_pagination_ordering_indexes.ts`** lista y registrada en `TENANT_MIGRATIONS` tras 088.  
`transactional = false` + `CREATE/DROP INDEX CONCURRENTLY IF NOT EXISTS` (ADR-066).  
**No** se publican `sortableFields` no vacíos: sin medición p95 no se inventan umbrales. R-5 queda **diferido** hasta poblar listas blancas.

---

## 1. Migración 089

| Campo | Valor |
| --- | --- |
| Archivo | `packages/database/src/migrations/tenant/089_pagination_ordering_indexes.ts` |
| Clase | `PaginationOrderingIndexes0890000000000` |
| Runner | Tras `BackfillExpedienteDocumentNumberHash088…` |
| `transactional` | `false` |
| 087 / 088 | **No tocados** |

### Tabla de índices (17)

| Índice | Tabla | ORDER BY / modo |
| --- | --- | --- |
| `idx_pag_inventory_items_created_id` | `inventory_items` | `created_at DESC, id DESC` |
| `idx_pag_stock_balances_updated_id` | `stock_balances` | `updated_at DESC, id DESC` |
| `idx_pag_serialized_assets_updated_id` | `serialized_assets` | `updated_at DESC, id DESC` |
| `idx_pag_stock_locations_created_id` | `stock_locations` | `created_at DESC, id DESC` |
| `idx_pag_purchase_requests_created_id` | `purchase_requests` | `created_at DESC, id DESC` |
| `idx_pag_subscribers_created_id` | `subscribers` | `created_at DESC, id DESC` |
| `idx_pag_supplier_profiles_created_id` | `supplier_profiles` | `created_at DESC, id DESC` |
| `idx_pag_inventory_write_offs_created_id` | `inventory_write_offs` | `created_at DESC, id DESC` |
| `idx_pag_asset_loans_installed_id` | `asset_loan_assignments` | `installed_at DESC, id DESC` |
| `idx_pag_catalog_items_updated_id` | `catalog_items` | `updated_at DESC, id DESC` (RECENTLY_UPDATED; `WHERE deleted_at IS NULL`) |
| `idx_pag_catalog_items_active_name_id` | `catalog_items` | `is_active DESC, name ASC, id ASC` (ACTIVE_NAME; soft-delete) |
| `idx_pag_audit_logs_created_id` | `audit_logs` | `created_at DESC, id DESC` |
| `idx_pag_stock_issues_created_id` | `stock_issues` | `created_at DESC, id DESC` |
| `idx_pag_stock_counts_created_id` | `stock_counts` | `created_at DESC, id DESC` |
| `idx_pag_visit_requests_created_id` | `visit_requests` | `created_at DESC, id ASC` |
| `idx_pag_support_tickets_created_id` | `support_tickets` | `created_at DESC, id DESC` |
| `idx_pag_stock_movements_created_num` | `stock_movements` | `created_at DESC, movement_number DESC` |

**Trampa `tenant_id`:** ningún índice nuevo lidera con `tenant_id` (cardinalidad 1 en schema tenant; listados no filtran por esa columna).

**Cobertura parcial consciente:** el listado principal de `visit_requests` ordena por expresión `CASE … sla_due_at` + `created_at` + `id`. El índice nuevo cubre el desempate por `created_at`/`id` y listados secundarios; un índice de expresión sobre el CASE queda **fuera de esta ola** (deuda documentada abajo).

---

## 2. p95 / `randomAccess` — **provisional (sin inventar números)**

No hay tenant local con volumen representativo para medir p95 de página profunda en esta sesión.  
**Regla ADR-065 §18:** no publicar columnas ordenables ni declarar `randomAccess` solo con fe.

| Recurso (listado offset Ola 1) | p95 página profunda | `randomAccess` (hoy) | Notas |
| --- | --- | --- | --- |
| inventory_items | **pendiente** | `true` (Ola 1 default) | Re-evaluar tras medición; bajar a `false` si p95 > 1,5 s |
| stock_balances | pendiente | `true` | |
| serialized_assets | pendiente | `true` | |
| stock_locations | pendiente | `true` | |
| purchase_requests | pendiente | `true` | |
| subscribers | pendiente | `true` | Piloto Ola 4 |
| supplier_profiles | pendiente | `true` | |
| inventory_write_offs | pendiente | `true` | |
| asset_loan_assignments | pendiente | `true` | |
| catalog_items | pendiente | `true` | Medir ACTIVE_NAME y RECENTLY_UPDATED |
| audit_logs | pendiente | según endpoint | Volumen alto esperado |
| stock_issues | pendiente | `true` | |
| stock_counts | pendiente | `true` | |
| visit_requests | pendiente | `true` | |
| support_tickets | pendiente | `true` | |
| stock_movements | pendiente | `true` | Volumen alto esperado |
| tasks / parties / tickets (SORTABLE vacío) | pendiente | `true` | Sin cambio de contrato |

### Protocolo de medición (pendiente — AI-SR-FULL + C PLAT-OPS)

1. Elegir tenant con cardinalidad ≥ percentil operativo (ideal: staging con dump anonimizado).
2. Por recurso: `EXPLAIN (ANALYZE, BUFFERS)` de la query de listado con `OFFSET` de página profunda (`page * limit` cerca del tope DEF-2 / 10_000).
3. Confirmar **Index Scan / Index Only Scan** sobre el índice `idx_pag_*` correspondiente (no Seq Scan + Sort).
4. Repetir ≥30 veces en caliente; registrar p95 de latencia HTTP o de la query sola.
5. Si p95 > **1,5 s** → `randomAccess: false` + `sortableFields: []` (conserva «Cargar más»).
6. Solo entonces poblar `sortableFields` (máx. 3–5) con columnas que tengan índice + p95 OK.

---

## 3. `sortableFields` provisional

| Recurso | `sortableFields` (esta sesión) |
| --- | --- |
| Todos los listados Ola 1 con `applySort` | `[]` (sin cambio de código) |

**Motivo:** publicar campos sin p95 violaría ADR-065 §18. La infraestructura de índices queda lista para poblar en una sub-fase de medición.

---

## 4. R-5 (test de orden efectivo)

| Estado | Detalle |
| --- | --- |
| **Diferido** | R-5 aplica solo cuando `sortableFields` **no vacío**. |
| Acción al poblar | Spec por recurso: `sortBy` válido cambia `ORDER BY` emitido; `meta.sort` = orden **aplicado** (retorno de `applySort`), no el pedido crudo. |
| Deuda | D-2 permanece abierta hasta esa sub-fase. |

---

## 5. Nota ops (AI-PLAT-OPS)

- Migración ya usa **CONCURRENTLY** vía ADR-066; no hace falta ventana de mantenimiento exclusiva tipo `CREATE INDEX` bloqueante.
- Recomendación: aplicar en **horario de bajo I/O** en tenants con `stock_movements` / `audit_logs` grandes (doble scan por índice).
- Verificar post-migrate: `SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_pag_%'` en un schema tenant.
- Revert: `pnpm` tenant revert debe ejecutar `DROP INDEX CONCURRENTLY IF EXISTS` fuera de TX.

---

## 6. Stop / go local

| Check | Estado |
| --- | --- |
| Migración + registro runner | **Hecho** |
| `pnpm db:migrate:all` | **OK** (2026-07-25) — public sin pendientes; tenant `tenant_iwana` aplicó 089 (17 índices `idx_pag_%`) |
| Revert 089 | **OK** — `migration:tenant:revert -- --schema=tenant_iwana --yes` → 0 filas bookkeeping / 0 índices; re-apply → 1 / 17 |
| p95 real | **Pendiente** (no inventado) |
| `sortableFields` poblados | **No** (conservador) |
| R-5 specs | **Diferidos** |
| Commit | **No** (orden orquestador) |

### Deuda abierta post-Ola 2 (parcial)

| Ítem | Destino |
| --- | --- |
| Medición p95 + ajuste `randomAccess` | Sub-fase Ola 2 / ops |
| Poblar `sortableFields` + R-5 | Misma sub-fase |
| Índice expresión `visit_requests` (CASE sla) | Ola posterior o ticket perf |
| D-2 en registro deuda viva | Cierra al verde R-5 |

---

## Veredicto de fase

**GO parcial de código:** migración 089 entregable y reversible por diseño.  
**NO-GO de cierre perf/contrato de orden:** sin p95 ni `sortableFields` poblados; R-5 diferido a conciencia.
