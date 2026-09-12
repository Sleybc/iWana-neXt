# Evidencia de calidad — MOD12 Compras Fase 30 (2026-09-11)

Corridas globales con `Cached: 0` (turbo, sin caché remota), ejecutadas por AI-EM-ARCH en Windows local.

## `pnpm typecheck` — VERDE

`Tasks: 8 successful, 8 total · Cached: 0 cached, 8 total · Time: 15.442s`
Paquetes: @iwana/api, @iwana/config, @iwana/db, @iwana/portal, @iwana/shared, @iwana/storage, @iwana/ui, @iwana/web, @iwana/worker. Cero errores.

## `pnpm lint` — VERDE (0 errores)

`Tasks: 8 successful, 8 total · Cached: 0 cached, 8 total · Time: 23.153s`
0 errores en los 9 paquetes. Warnings preexistentes fuera de la superficie Fase 30
(db cli 5, worker 1, web 10, portal 46, api 7); ningún warning nuevo en archivos de la fase.

## Suites tocadas por la fase (conteos reales)

| Suite | Resultado |
| --- | --- |
| Contrato `purchase-award-matrix.spec.ts` (@iwana/shared) | 9/9 |
| Helper `purchase-request-award-coverage.spec.ts` (@iwana/api) | 12/12 |
| Migración 128 unit (@iwana/db) | 9/9 |
| `migration-order` + `migration-parity` (@iwana/db) | 31/31 |
| Migración 128 integration (PG real) | 3 SKIP — sin PostgreSQL local |
| `purchasing.service.spec.ts` (filtros CA-30/310/R1/R2) | 16/16 + 5/5 + 1/1 + 1/1 |
| `purchasing.http.integration.spec.ts` DELETE awards | 3/3 |
| `purchasing.swagger.spec.ts` | 8/8 |
| Portal inventario completa (regresión FE-2+FE-3+fixes) | 87 suites, 721 passed, 1 skipped, 0 fallos |
| `@iwana/ui` | 4 suites, 30/30 |
| E2E `portal-inventory-purchasing-awards.spec.ts` | **5/5** (tras DEF-AWD-001/002) |

## Axe

- jest-axe sin violaciones: AwardMatrixTable, AwardMatrixTable bloqueada, AwardQuoteAccordion, AwardSelectionBar (con/sin selección), AwardMatrixPanel (matriz + acordeón).
- E2E CA-311: matriz y acordeón sin violaciones; teclado Tab/flechas/columna verificado.
- Desviación documentada: `SectionAccordion` usa `text-iwana-secondary-800` (no `-700`: axe mide 4.32 sobre `bg-gray-100`; con `-800` queda limpio). Consulta a AI-DS-OWNER pendiente (token existente, sin primitivas nuevas).

## Pendiente (no bloquea merge, bloquea G6.5)

- `pnpm test` global con `Cached: 0` + reporte de cobertura ≥80% del núcleo.
- 128-integration contra PostgreSQL real (conteo backfill por tenant para el informe).
- Corrida Linux de CI por SHA (G6.5, acumulada con fases 28 y 29).
