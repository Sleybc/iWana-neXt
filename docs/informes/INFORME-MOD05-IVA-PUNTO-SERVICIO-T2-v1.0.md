# INFORME MOD05 — IVA por punto de servicio · T2

**Versión:** 1.0 · **Fecha:** 2026-10-12 · **Bloque:** T2 — migración y backfill C-DDL-2
**Decisión:** [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md)
**Estado:** DONE_WITH_CONCERNS

## Entrega

- `packages/database/src/migrations/tenant/144_vat_service_point.ts`: añade las columnas y checks C-DDL-2, clasifica como `RESIDENTIAL` solo a suscriptores `NATURAL` del segmento `RESIDENTIAL`, copia el estrato únicamente en esa regla y deja soporte/snapshot en `NULL`.
- `catalog_items.vat_concept`: asigna `INTERNET_ACCESS` solo a `PLAN`; no adivina conceptos para `PRODUCT` ni `SERVICE`.
- `plan_details.network_type`: agrega el default `FIXED` y limita el valor a `FIXED | MOBILE`.
- `packages/database/src/migrations/tenant/runner.ts`: registra la migración 144 después de la 143.
- `apps/api/src/modules/crm/contracts/entities/contract.entity.ts`, `apps/api/src/modules/commercial/entities/catalog-item.entity.ts` y `apps/api/src/modules/commercial/entities/plan-detail.entity.ts`: mapean únicamente las columnas nuevas.
- `packages/database/src/migrations/tenant/144_vat_service_point.integration.spec.ts`: prueba en un schema efímero de PostgreSQL las reglas y el ciclo `up/down/up`.

El preflight registra conteos agregados por regla y por tipo de catálogo. Si encuentra contratos que califican como residenciales pero carecen de estrato, informa el conteo y aborta antes del DDL para no violar `chk_contract_residential_stratum`. Después del backfill reporta, por tipo, los ítems que siguen sin concepto. Los reportes no incluyen identificadores ni PII.

## Evidencia

PostgreSQL real estuvo disponible en `127.0.0.1:5433/dbiw`; el test creó y eliminó su propio schema tenant efímero.

| Comando                                                                                                                                             | Resultado observado                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/db exec jest --config jest.integration.config.js src/migrations/tenant/144_vat_service_point.integration.spec.ts --runInBand` | **1 suite, 1 test, 0 omitidos; pasó.** Ciclo `up/down/up`, checks y backfill ejercidos en PostgreSQL real. |
| `pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts --runInBand`                                                       | **1 suite, 6 tests; pasó.** Incluye completitud y orden de `TENANT_MIGRATIONS`.                            |
| `pnpm --filter @iwana/db typecheck`                                                                                                                 | Pasó.                                                                                                      |
| `pnpm --filter @iwana/api typecheck`                                                                                                                | Pasó.                                                                                                      |
| `pnpm exec eslint` sobre los seis archivos TypeScript de T2                                                                                         | Pasó.                                                                                                      |

Conteos comprobados por el test integrado: **4 contratos** — 1 `RESIDENTIAL` con estrato copiado, 0 residenciales sin estrato, 3 `NON_RESIDENTIAL` (segmento distinto, persona jurídica y referencia de suscriptor ausente); **3 ítems de catálogo** — 1 `PLAN`, 1 `PRODUCT`, 1 `SERVICE`; **2 ítems sin concepto fiscal** tras el backfill — `PRODUCT=1`, `SERVICE=1`. El PLAN recibió `INTERNET_ACCESS`; soporte y snapshot quedaron en `NULL`. `network_type` tomó `FIXED` por default.

## Deuda nueva por severidad

- **P0:** ninguna.
- **P1:** ninguna.
- **P2:** dos ítems legados del catálogo (`PRODUCT=1`, `SERVICE=1`) continúan sin concepto fiscal por decisión conservadora. El operador debe clasificarlos antes de habilitar su facturación; el comportamiento de fallo cerrado de C-API-3 los mantendrá fuera de facturación hasta entonces.
- **P3:** ninguna.

No se hizo commit.
