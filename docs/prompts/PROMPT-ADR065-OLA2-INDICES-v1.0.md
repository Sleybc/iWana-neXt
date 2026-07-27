# PROMPT — Paginación numerada · Fase 2 / Ola 2: índices y medición

**Versión:** 1.0
**Estado:** Aprobado
**Generado por:** AI-EM-ARCH
**Archivo destino:** `docs/prompts/PROMPT-ADR065-OLA2-INDICES-v1.0.md`
**Plan padre:** [2026-07-24-paginacion-numerada-adopcion.md](../plans/2026-07-24-paginacion-numerada-adopcion.md) — Ola 2

**Emisor:** AI-EM-ARCH
**Destinatario:** AI-SR-FULL · **consulta:** AI-PLAT-OPS (ventana/ops CONCURRENTLY) · AI-SR-QA (R-5)
**Fecha:** 2026-07-25 (actualizado post Ola 1 GO)
**Precondición:** Ola 1 / DEF-2 **GO**; ADR-066 **implementado** (`transactional` en runner/revert).
**Registro deuda:** [INFORME-ADR065-DEUDA-VIVA-POST-OLA1-v1.0](../informes/INFORME-ADR065-DEUDA-VIVA-POST-OLA1-v1.0.md) · ítems D-2 + D-3
**Skills:** `database-migration`, `postgresql`, `nestjs-expert`, `testing-patterns`

## Decisión previa — CERRADA

ADR-066 Aprobado e implementado. Migraciones con `transactional = false` soportan `CREATE INDEX CONCURRENTLY`. **No reabrir** el debate del runner.

## Alcance

**1 · Migración tenant `089_pagination_ordering_indexes.ts`** — numerada, escrita a mano, reversible, `transactional = false` (ADR-066). ~14 índices que cubren exactamente los `ORDER BY` de la Fase 1. (087/088 reservados: hash + backfill documento expediente.)

Órdenes **sin ningún índice de soporte** hoy:

| Tabla | Orden |
| --- | --- |
| `inventory_items` | `created_at DESC, id DESC` |
| `stock_balances` | `updated_at DESC` |
| `serialized_assets` | `updated_at DESC, id DESC` |
| `stock_locations` | `created_at DESC` |
| `purchase_requests` | `created_at DESC` |
| `subscribers` | `created_at DESC` |
| `supplier_profiles` | `created_at DESC` |
| `inventory_write_offs` | `created_at DESC` |
| `asset_loan_assignments` | `installed_at DESC` |
| `catalog_items` | modos `ACTIVE_NAME` y `RECENTLY_UPDATED` |

Con cobertura parcial (falta el desempate): `audit_logs`, `stock_issues`, `stock_counts`, `visit_requests`, `support_tickets`, `stock_movements`.

**2 · Trampa a evitar.** Dentro del schema del tenant **todas las filas comparten `tenant_id`** (cardinalidad 1). Un índice que lo lidera solo sirve si la query filtra `tenant_id`. Decide recurso por recurso: índice sin `tenant_id` como columna líder, o añadir el filtro.

**3 · Medición de p95.** Medir página profunda por recurso sobre un dataset representativo. El resultado **alimenta el flag `capabilities.randomAccess`**: si el p95 supera **1,5 s**, el recurso se declara `randomAccess: false` y conserva «Cargar más». Registrar la tabla en el informe vivo.

**4 · Lista blanca `sortableFields` (ADR-065 §18).** Máx. 3-5 columnas; solo con índice + p95 OK. Nombres lógicos; `applySort` resuelve `qb.alias`.

**5 · R-5 (stop/go):** por cada recurso que publique `sortableFields` **no vacío**, un test verifica que un `sortBy` válido **cambia el ORDER BY emitido** y que `meta.sort` refleja el orden **aplicado**, no el pedido.

## Restricciones

- Sin `synchronize`; migraciones a mano.
- `down()` con `DROP INDEX CONCURRENTLY IF EXISTS` / `IF EXISTS` según ADR-066.
- Stop/go local: `pnpm lint` + `pnpm typecheck` **raíz**; CI ya corre `pnpm test`.
- `pnpm db:migrate:all` + revert verificados.

## Entregables

1. Migración `089_*` + registro en `TENANT_MIGRATIONS`.
2. Tabla p95 + `randomAccess` por recurso.
3. Tabla `recurso → sortableFields` + specs R-5 donde aplique.
4. Informe de fase Ola 2.

## Stop / Go

- migrate/revert limpios; EXPLAIN con index scan en página profunda y en cada sort publicado.
- Ningún `randomAccess: true` con p95 > 1,5 s.
- R-5 verde para campos publicados.
- Sin commit salvo indicación del orquestador.
