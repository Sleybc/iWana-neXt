# INFORME — E-4 Pickers soft-cap · Fase 1 (cardinalidad)

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-SR-FULL  
**Plan:** [2026-07-24-pickers-softcap-remediacion.md](../plans/2026-07-24-pickers-softcap-remediacion.md) §Fase 1  
**Kickoff:** [INFORME-ADR065-KICKOFF-OLAS-RESTANTES-v1.0.md](./INFORME-ADR065-KICKOFF-OLAS-RESTANTES-v1.0.md)  
**Clasificación:** Uso interno  

---

## Veredicto

Fase 1 **cerrada en código + medición local no representativa**. Hay **1** schema tenant (`tenant_iwana`) en Postgres local (`dbiw`); **ninguna** entidad supera el soft-cap 100 ahí. **No** se puede afirmar p95 ni “cuántos tenants superan el cap” para producción.

**Implicación para fases 3–5:** no reducir alcance por la medición local. Mantener remediación de pickers hasta que PLAT-OPS/DATA ejecuten el protocolo SQL en entorno con N≥ tenants reales (staging/prod-read o seed de carga).

---

## 1. Inventario de código (actualizado)

Constante canónica: `PICKER_SOFT_CAP = 100` en `apps/portal/src/lib/picker-soft-cap.ts`. Alias: `INVENTORY_PICKER_SOFT_CAP`, `COMMERCIAL_PICKER_LIMIT`, `SUPPLIERS_SOFT_CAP_PAGE_SIZE`.

| Archivo | Límite efectivo | Entidades | Modal/drawer | Advierte truncamiento |
| --- | --- | --- | --- | --- |
| `CreateContractDialog.tsx` | 100 (`PICKER_SOFT_CAP`) | Plans / Products / Services | Sí | No |
| `ConvertExpedienteToContractDialog.tsx` | 100 | Plans | Sí | No |
| `ServiciosTab.tsx` *(omitido en plan original)* | 100 | Plans / Products / Services | No (tab) | No |
| `expedientes/[id]/page.tsx` ~241–265 | 100 (literal) | Plans / Products / Services | No | No |
| `expedientes/[id]/page.tsx` ~631 | 100 (literal) | Usuarios ACTIVE — **sin cursor loop** | No | No |
| `TaskCoreFields.tsx` ~155, 164 | **6** | Prospectos (`listExpedientes`) / Suscriptores (`list`) | No (listbox) | No |
| `SupplierPicker.tsx` / `SupplierMultiPicker.tsx` | **API default 20** (no pasan `limit`; `ListSuppliersQuerySchema` default 20; port `SEARCH_LIMIT=20`) | Proveedores | No | No |
| `InventoryClient.tsx` | 100 (`INVENTORY_PICKER_SOFT_CAP`) en ≥13 prefetches | Items / locations / assets / balances | Sí (subflujos) | Solo matriz balances (“Ocupación parcial”) |
| `StockItemDetailDrawer.tsx` ~86 | 10 | Movimientos (kardex preview, no picker de entidad) | Sí | No |

**Defaults API relevantes (backend):** listados commercial/inventory/purchasing → `DEFAULT_LIMIT = 20`, `MAX_LIMIT = 100` (`apps/api/src/common/pagination/clamp-limit.ts`). Proveedores: Zod default `limit=20`.

---

## 2. Medición local (mejor evidencia disponible)

| Fuente | Valor |
| --- | --- |
| Host | `iwana_postgres_dev` → DB `dbiw` |
| Tenants `public.tenants` | 1 (`slug=iwana`, `schema_name=tenant_iwana`, ACTIVE) |
| Representatividad | **No** (dev local / seed) |

| Entidad | Cap picker | n local (`tenant_iwana`) | Supera cap? |
| --- | --- | --- | --- |
| Usuarios ACTIVE | 100 | 1 | No |
| Planes activos | 100 | 5 | No |
| Productos adicionales activos | 100 | 1 | No |
| Servicios adicionales activos | 100 | 1 | No |
| Items inventario | 100 | 1 (ACTIVE) | No |
| Locations | 100 | 2 (ACTIVE) | No |
| Assets (`serialized_assets`) | 100 | 12 | No |
| Proveedores (`supplier_profiles`) | 20 (default API) / 100 máx | 0 | No |

**Percentil 95 / tenants que superan cap:** no calculable (N=1).

---

## 3. Tabla entregable — entidad | cap | dónde medir | precedente lookup

| Entidad | Cap actual | Dónde medir (SQL / schema) | Precedente lookup en repo |
| --- | --- | --- | --- |
| Usuarios activos | 100 | `{tenant}.users` WHERE `status='ACTIVE' AND deleted_at IS NULL` | **No** existe `GET /users/search`. Listado `GET /users` (cursor). |
| Planes activos | 100 | `{tenant}.catalog_items` WHERE `type='PLAN' AND is_active AND deleted_at IS NULL` | **No** `.../plans/search`. Listado `GET /commercial/catalog?type=PLAN`. |
| Productos adicionales activos | 100 | `catalog_items` `type='PRODUCT'` + activos | Idem catalog |
| Servicios adicionales activos | 100 | `catalog_items` `type='SERVICE'` + activos | Idem catalog |
| Items inventario | 100 | `{tenant}.inventory_items` (picker no filtra status en prefetch; medir `ALL` y `status='ACTIVE'`) | **No** `.../items/search` |
| Locations | 100 | `{tenant}.stock_locations` (`ALL` / `ACTIVE`) | **No** `.../locations/search` |
| Assets | 100 | `{tenant}.serialized_assets` | **No** `.../assets/search` |
| Proveedores | 20 default (omitir limit) | `{tenant}.supplier_profiles` (`ALL` / `ACTIVE`) | `GET /purchasing/suppliers/lookup` = **lookup por documento** (alta), **no** typeahead. Typeahead real hoy: `purchasingApi.searchSuppliers` → list/search con limit 20. |
| Suscriptores / prospectos (TaskCoreFields) | 6 | CRM listados con `search` | `GET /crm/subscribers/search` = búsqueda **exacta** por documento/NIT/email/tel — **no** typeahead `q`. Listado `GET /crm/subscribers?search=` sí filtra texto. |

---

## 4. [BLOQUEO] Medición SQL representativa

```text
[BLOQUEO TÉCNICO]
Módulo: E-4 pickers (ADR-065 excepción) | Fase: 1 — cardinalidad
Descripción: Solo hay 1 tenant en DB local; no hay staging/prod-read ni seed de carga
  con N tenants para p95 ni conteo de tenants > soft-cap.
Intentos: 1 — psql en iwana_postgres_dev / dbiw / tenant_iwana (conteos §2).
Impacto: No se puede decidir reducción de fases 3–5; remediación sigue justificada
  por truncamiento silencioso en código (riesgo UX/operativo), no por cardinalidad medida.
Ayuda requerida: PLAT-OPS (acceso DB representativa) + DATA-ENG (opcional: seed/carga)
  + EM-ARCH (priorizar ventana de medición).
```

### Protocolo exacto para PLAT-OPS / DATA

Ejecutar **read-only** en el entorno representativo (staging o réplica). Sustituir el CTE de schemas por la fuente canónica de tenants ACTIVE.

```sql
-- 0) Universo de schemas tenant
WITH tenant_schemas AS (
  SELECT schema_name
  FROM public.tenants
  WHERE status = 'ACTIVE'
    AND schema_name IS NOT NULL
),
-- 1) Conteos por tenant (dinámico: PLAT-OPS puede loop en bash/psql \gexec)
per_tenant AS (
  -- Pseudocódigo: para cada schema_name S en tenant_schemas, SET search_path TO S; luego:
  SELECT
    current_schema() AS schema_name,
    (SELECT COUNT(*) FROM users
      WHERE status = 'ACTIVE' AND deleted_at IS NULL) AS users_active,
    (SELECT COUNT(*) FROM catalog_items
      WHERE type = 'PLAN' AND is_active = true AND deleted_at IS NULL) AS plans_active,
    (SELECT COUNT(*) FROM catalog_items
      WHERE type = 'PRODUCT' AND is_active = true AND deleted_at IS NULL) AS products_active,
    (SELECT COUNT(*) FROM catalog_items
      WHERE type = 'SERVICE' AND is_active = true AND deleted_at IS NULL) AS services_active,
    (SELECT COUNT(*) FROM inventory_items) AS inventory_items_all,
    (SELECT COUNT(*) FROM inventory_items WHERE status = 'ACTIVE') AS inventory_items_active,
    (SELECT COUNT(*) FROM stock_locations) AS stock_locations_all,
    (SELECT COUNT(*) FROM stock_locations WHERE status = 'ACTIVE') AS stock_locations_active,
    (SELECT COUNT(*) FROM serialized_assets) AS serialized_assets_all,
    (SELECT COUNT(*) FROM supplier_profiles) AS supplier_profiles_all,
    (SELECT COUNT(*) FROM supplier_profiles WHERE status = 'ACTIVE') AS supplier_profiles_active
)
-- 2) Agregados pedido por el plan
SELECT
  metric,
  COUNT(*) FILTER (WHERE n > cap) AS tenants_over_cap,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY n) AS p95
FROM (
  SELECT 'users_active' AS metric, 100 AS cap, users_active AS n FROM per_tenant
  UNION ALL SELECT 'plans_active', 100, plans_active FROM per_tenant
  UNION ALL SELECT 'products_active', 100, products_active FROM per_tenant
  UNION ALL SELECT 'services_active', 100, services_active FROM per_tenant
  UNION ALL SELECT 'inventory_items', 100, inventory_items_all FROM per_tenant
  UNION ALL SELECT 'stock_locations', 100, stock_locations_all FROM per_tenant
  UNION ALL SELECT 'serialized_assets', 100, serialized_assets_all FROM per_tenant
  UNION ALL SELECT 'supplier_profiles', 20, supplier_profiles_all FROM per_tenant  -- cap efectivo UI = default API
) x
GROUP BY metric, cap
ORDER BY metric;
```

**Script operativo sugerido (bash / psql):** iterar `schema_name` de `public.tenants`, `SET search_path`, volcar una fila CSV por tenant, agregar en host. No modificar datos. No loguear PII (solo conteos).

**Criterio de desbloqueo:** CSV/tabla con `tenants_over_cap` + `p95` por métrica, N tenants ≥ 3 o confirmación escrita de EM-ARCH de que staging es el único universo.

---

## 5. Hallazgos para Fase 4 (endpoints) — sin implementar

| Dominio | Endpoint plan | Estado verificado |
| --- | --- | --- |
| Usuarios | `GET /users/search?q=` | No existe |
| Planes / productos / servicios | `GET /commercial/.../search` | No existe (solo list catalog) |
| Items / locations / assets | `GET /inventory/.../search` | No existe |
| Suscriptores | `GET /crm/subscribers/search` | Existe, semántica distinta (campos exactos) |
| Proveedores | `GET /purchasing/suppliers/lookup` | Existe, semántica distinta (documento); typeahead parcial vía list `search` limit 20 |

---

## 6. Fuera de alcance (respetado)

- Sin pickers UI / `SearchablePicker`.  
- Sin Ola 2 índices.  
- Sin commit.

---

## 7. Entrega al orquestador

| Ítem | Estado |
| --- | --- |
| Inventario código | Completo (+ `ServiciosTab`, defaults proveedores 20) |
| Cardinalidad real multi-tenant | **Bloqueada** — protocolo SQL listo |
| Evidencia local | Completa (§2) |
| Tabla entidad\|cap\|medir\|lookup | §3 |
| Recomendación alcance 3–5 | **No reducir** hasta desbloqueo o decisión EM-ARCH |
