# INFORME — E-4 Pickers soft-cap · Medición ops (multi-tenant)

**Tipo:** INFORME  
**Módulo:** E-4 pickers (ADR-065 excepción) · Fase 1 — cardinalidad representativa  
**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-PLAT-OPS  
**Entrada:** [INFORME-E4-PICKERS-FASE1-CARDINALIDAD-v1.0.md](./INFORME-E4-PICKERS-FASE1-CARDINALIDAD-v1.0.md) §4  
**Plan:** [2026-07-24-pickers-softcap-remediacion.md](../plans/2026-07-24-pickers-softcap-remediacion.md)  
**Clasificación:** Uso interno  

---

## Veredicto

**Estado: BLOQUEO PENDIENTE DE ENTORNO — no hay GO de medición.**

En esta sesión **no** hay acceso a staging multi-tenant, prod-read ni réplica con N≥ tenants reales. **No se inventan** `tenants_over_cap` ni `p95`.

| Comprobación | Resultado |
| --- | --- |
| Lab local (`iwana_postgres_dev` / `dbiw`) | UP; `public.tenants` ACTIVE = **1** (`iwana` → `tenant_iwana`) |
| Staging dedicado multi-tenant | **No disponible** en sesión (lab = staging surrogate histórico; N=1) |
| Prod on-prem health `http://10.0.0.2:8080/api/v1/health` | **UNREACHABLE** (timeout 3 s); sin SSH/credenciales de lectura en sesión |
| Tabla entidad\|tenants_over_cap\|p95\|cap | **No entregable** sin entorno |

**Decisión EM-ARCH (ya tomada, ratificada aquí):** no reducir fases 3–5 del plan pickers por la medición local. Remediación sigue justificada por truncamiento silencioso en código.

**Fuera de alcance respetado:** sin migraciones ADR-065 Ola 2; sin commit; sin números inventados.

---

## 1. Confirmación del protocolo (§4)

Protocolo SQL de [INFORME-E4-PICKERS-FASE1-CARDINALIDAD-v1.0.md](./INFORME-E4-PICKERS-FASE1-CARDINALIDAD-v1.0.md) §4: **revisado y listo para runbook**.

| Ítem | Estado ops |
| --- | --- |
| Universo = `public.tenants` WHERE `status = 'ACTIVE'` | Correcto |
| Conteos por schema con `SET search_path` (o `SET LOCAL` en txn) | Correcto; compatible con pgBouncer |
| Caps: 100 (mayoría) / 20 (proveedores = default API UI) | Alineados al inventario Fase 1 |
| Solo conteos; sin PII en logs/CSV | Obligatorio (Ley 1581) |
| Solo lectura | Obligatorio |
| Criterio desbloqueo: CSV con `tenants_over_cap` + `p95` y N≥3 **o** confirmación escrita EM-ARCH de universo único | Vigente |

El SQL del informe fuente es **pseudocódigo** (CTE `per_tenant` no se materializa solo). El script operativo de §3 de este informe es la forma ejecutable.

---

## 2. Entorno requerido

| Requisito | Detalle |
| --- | --- |
| **Qué** | Postgres con schemas tenant reales: staging multi-tenant **o** réplica/prod-read (preferido: réplica o rol `SELECT`-only) |
| **Quién** | Operador con acceso (PLAT-OPS humano / DATA-ENG) + ventana acordada con EM-ARCH |
| **Credenciales** | Usuario **solo lectura** sobre `public.tenants` y tablas de conteo en cada `schema_name` ACTIVE. **No** usar `iwana_migrator` ni superusuario de bootstrap para esta medición. |
| **Conectividad** | Host/puerto alcanzable desde el puesto del operador; si prod on-prem: VPN/SSH jump según runbook de despliegue |
| **Ventana** | Lectura corta (minutos); sin locks exclusivos; preferible fuera de picos de reporting si la réplica no está aislada |
| **Salida** | CSV agregado (métrica / cap / tenants_over_cap / p95 / N) — **sin** nombres de persona, emails ni documentos |
| **N mínimo** | ≥ 3 tenants ACTIVE, **o** memo EM-ARCH: “universo = staging con N declarado” |

**No sirve como desbloqueo:** lab/dev con N=1 (`tenant_iwana`), ni seed local sin carga multi-tenant.

---

## 3. Checklist ops (ejecución por DATA / humano)

### Preflight

- [ ] EM-ARCH confirma entorno (staging vs prod-read) y ventana.
- [ ] SEC-ENG / owner DB emiten o confirman rol **read-only** (sin DML/DDL).
- [ ] Conectividad verificada (`SELECT 1`; `SELECT COUNT(*) FROM public.tenants WHERE status = 'ACTIVE'`).
- [ ] Anotar `N = COUNT(*)` de tenants ACTIVE; si N < 3 y no hay excepción EM-ARCH → **no** declarar GO de cardinalidad.
- [ ] Directorio de salida sin PII; solo conteos.

### Ejecución (script sugerido)

Guardar filas por tenant y agregar en host. Ajustar `PG*` / connection string al entorno (no pegar secretos en el informe ni en tickets).

```bash
#!/usr/bin/env bash
# Medición E-4 pickers — SOLO LECTURA. Sin PII.
set -euo pipefail
OUT_DIR="${OUT_DIR:-./e4-picker-cardinality}"
mkdir -p "$OUT_DIR"
RAW="$OUT_DIR/per_tenant.csv"
AGG="$OUT_DIR/aggregates.csv"

echo "schema_name,users_active,plans_active,products_active,services_active,inventory_items_all,inventory_items_active,stock_locations_all,stock_locations_active,serialized_assets_all,supplier_profiles_all,supplier_profiles_active" > "$RAW"

psql -v ON_ERROR_STOP=1 -At -F $'\t' -c \
  "SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE' AND schema_name IS NOT NULL ORDER BY 1" \
| while IFS= read -r S; do
  psql -v ON_ERROR_STOP=1 -At -F ',' -c "
    SET search_path TO ${S}, public;
    SELECT
      current_schema(),
      (SELECT COUNT(*) FROM users WHERE status = 'ACTIVE' AND deleted_at IS NULL),
      (SELECT COUNT(*) FROM catalog_items WHERE type = 'PLAN' AND is_active = true AND deleted_at IS NULL),
      (SELECT COUNT(*) FROM catalog_items WHERE type = 'PRODUCT' AND is_active = true AND deleted_at IS NULL),
      (SELECT COUNT(*) FROM catalog_items WHERE type = 'SERVICE' AND is_active = true AND deleted_at IS NULL),
      (SELECT COUNT(*) FROM inventory_items),
      (SELECT COUNT(*) FROM inventory_items WHERE status = 'ACTIVE'),
      (SELECT COUNT(*) FROM stock_locations),
      (SELECT COUNT(*) FROM stock_locations WHERE status = 'ACTIVE'),
      (SELECT COUNT(*) FROM serialized_assets),
      (SELECT COUNT(*) FROM supplier_profiles),
      (SELECT COUNT(*) FROM supplier_profiles WHERE status = 'ACTIVE');
  " >> "$RAW"
done

# Agregados (PostgreSQL 14+ percentile_cont). Caps: 100 / proveedores 20.
psql -v ON_ERROR_STOP=1 -c "
CREATE TEMP TABLE per_tenant (
  schema_name text,
  users_active bigint,
  plans_active bigint,
  products_active bigint,
  services_active bigint,
  inventory_items_all bigint,
  inventory_items_active bigint,
  stock_locations_all bigint,
  stock_locations_active bigint,
  serialized_assets_all bigint,
  supplier_profiles_all bigint,
  supplier_profiles_active bigint
);
\\copy per_tenant FROM '$RAW' CSV HEADER

COPY (
  SELECT metric, cap,
         COUNT(*) FILTER (WHERE n > cap) AS tenants_over_cap,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY n) AS p95,
         COUNT(*) AS n_tenants
  FROM (
    SELECT 'users_active' AS metric, 100 AS cap, users_active AS n FROM per_tenant
    UNION ALL SELECT 'plans_active', 100, plans_active FROM per_tenant
    UNION ALL SELECT 'products_active', 100, products_active FROM per_tenant
    UNION ALL SELECT 'services_active', 100, services_active FROM per_tenant
    UNION ALL SELECT 'inventory_items', 100, inventory_items_all FROM per_tenant
    UNION ALL SELECT 'stock_locations', 100, stock_locations_all FROM per_tenant
    UNION ALL SELECT 'serialized_assets', 100, serialized_assets_all FROM per_tenant
    UNION ALL SELECT 'supplier_profiles', 20, supplier_profiles_all FROM per_tenant
  ) x
  GROUP BY metric, cap
  ORDER BY metric
) TO STDOUT WITH CSV HEADER
" > "$AGG"

echo "OK raw=$RAW agg=$AGG"
```

**Nota Windows/PowerShell:** equivalente con `docker exec` + `psql` en el host Postgres del entorno, o WSL. Misma semántica; no cambiar caps.

### Postflight

- [ ] Verificar que `aggregates.csv` tiene una fila por métrica con columnas `metric,cap,tenants_over_cap,p95,n_tenants`.
- [ ] Adjuntar CSV (o tabla) a informe de desbloqueo / ticket EM-ARCH.
- [ ] Confirmar que no se modificó ningún dato (`SELECT`-only).
- [ ] Rotar/destruir credenciales temporales si se emitieron solo para la ventana.

### Tabla objetivo (rellenar al desbloquear)

| Entidad (metric) | tenants_over_cap | p95 | cap |
| --- | --- | --- | --- |
| users_active | — | — | 100 |
| plans_active | — | — | 100 |
| products_active | — | — | 100 |
| services_active | — | — | 100 |
| inventory_items | — | — | 100 |
| stock_locations | — | — | 100 |
| serialized_assets | — | — | 100 |
| supplier_profiles | — | — | 20 |

*(Vacía a propósito: no hay medición representativa en esta sesión.)*

---

## 4. Evidencia de no-acceso (esta sesión)

| Fuente | Hallazgo |
| --- | --- |
| `docker ps` | Solo stack lab: `iwana_postgres_dev`, pgbouncer, redis, minio, nginx, adminer |
| `SELECT COUNT(*) FROM public.tenants WHERE status = 'ACTIVE'` | `1` |
| Tenants ACTIVE | `iwana\|tenant_iwana` |
| Health prod on-prem | Timeout / unreachable |
| Credenciales staging/prod-read en sesión agente | Ausentes / no usables |

Coincide con el [BLOQUEO TÉCNICO] del informe Fase 1 §4 y con el patrón histórico PLAT-OPS: lab = staging surrogate; prod remoto NO-GO sin operador.

---

## 5. Entrega al orquestador

| Ítem | Estado |
| --- | --- |
| Ejecución protocolo en N≥ tenants reales | **No** — sin entorno |
| Tabla entidad\|tenants_over_cap\|p95\|cap | **Pendiente** (plantilla §3) |
| Protocolo revisado / runbook-ready | **Sí** (§1 + script §3) |
| Checklist ops para DATA/humano | **Sí** (§3) |
| Falso GO de medición | **No** |
| Fases 3–5 pickers | **No reducir** (decisión EM-ARCH) |
| Migraciones ADR-065 Ola 2 | **No tocadas** |
| Commit | **No** |

```text
[BLOQUEO PENDIENTE DE ENTORNO]
Módulo: E-4 pickers | Fase: 1 — medición multi-tenant
Owner: PLAT-OPS (runbook) → ejecución: operador/DATA con credenciales read-only
Desbloqueo: aggregates.csv con tenants_over_cap + p95 + N≥3 (o excepción EM-ARCH)
Impacto producto: ninguno inmediato — fases 3–5 siguen; sin falso GO de cardinalidad
```
