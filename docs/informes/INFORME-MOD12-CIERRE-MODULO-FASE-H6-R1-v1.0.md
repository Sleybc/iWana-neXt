# Informe — MOD12 · Remediación G7 NO-GO — Fase H6-R1 (backend)

**Version:** 1.2  
**Fecha:** 2026-07-21  
**Estado:** ⛔ H6-R1 **insuficiente** — evidencia Chromium/E2E **retractada**; abierto **H6-R2**  
**Productor backend R1:** AI-SR-FULL  
**Verificación:** CTO/revisor — Chromium ausente (caché solo `b`)  
**Prompt R2:** [PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R2-v1.0.md](../prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R2-v1.0.md)  
**Spec enmendada:** [2026-07-21-mod12-cierre-modulo-fase-h6-design.md](../specs/2026-07-21-mod12-cierre-modulo-fase-h6-design.md) (D-H6-5 día-exacta · CA-H6-06 EV-1)  
**Origen NO-GO:** [INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md](INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md) v1.2  
**ADR:** [ADR-060](../adrs/ADR-060-Control-Bajas-y-Consultas-Operativas-Inventario.md) (sin cambio de decisión RBAC/SQL/sin DDL)

---

## 1. Resumen

Remediación backend del defecto de divergencia helper↔SQL en vida útil: `calculateUsefulLife` adopta semántica **día-exacta** alineada a `purchase_date + useful_life_months * INTERVAL '1 month'`. CA-H6-06 se verifica contra Postgres real (`EV1_REAL_DB=1`). Aislamiento de alertas deja de depender de un mock que filtraba por tenant. Se añade test de autorrechazo en `reject` y se marca `recordWriteOff` como interno.

**Sin DDL. Sin commits. Sin emitir G5/G6/G7.**

---

## 2. Backend (AI-SR-FULL)

### 2.1 Helper día-exacta (Paso A)

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/inventory/services/serialized-asset-useful-life.util.ts` | Status desde `usefulLifeExpiryDate` vs `referenceDate` / umbral +3m (UTC date-only). Ya no usa `monthsBetween` año/mes ignorando día. |
| `apps/api/src/modules/inventory/tests/serialized-asset-useful-life.util.spec.ts` | Casos NO-GO + bordes día 1/28/29/30/31. |
| `apps/api/src/modules/inventory/tests/useful-life-alerts.service.spec.ts` | Retira `matchesUsefulLifeAlertSqlPredicate` como evidencia de CA-H6-06. |

Predicado SQL en `listUsefulLifeAlerts` **sin cambios** (forma indexable conservada).

Casos NO-GO unificados:

| Compra | Meses | Ref | Antes (helper) | Día-exacta |
| --- | --- | --- | --- | --- |
| 2026-04-30 | 6 | 2026-07-21 | por-vencer | **vigente** |
| 2025-01-15 | 12 | 2026-01-01 | vencida | **por-vencer** |

### 2.2 CA-H6-06 EV-1

| Archivo | Evidencia |
| --- | --- |
| `apps/api/src/modules/inventory/tests/useful-life-alerts.parity.ev1.spec.ts` | Inserta assets reales en `tenant_iwana`; compara SQL Postgres (`INTERVAL`) con `calculateUsefulLife`. |

Casos: sin-dato, vigente, por-vencer, vencida; días 1/28/29/30/31; ambos NO-GO.  
Comando: `$env:EV1_REAL_DB='1'; pnpm --filter @iwana/api test -- useful-life-alerts.parity.ev1.spec.ts --coverage=false` → **PASS**.

### 2.3 Aislamiento

| Archivo | Evidencia |
| --- | --- |
| `apps/api/src/modules/inventory/tests/useful-life-alerts.isolation.spec.ts` | Assert del predicado emitido `asset.tenant_id = :tenantId` + `runInTenantSchema` con el schema del contexto. El stub **no** filtra filas por tenant. |

### 2.4 Menores seguridad

| Ítem | Evidencia |
| --- | --- |
| Autorrechazo `reject` | `write-off.service.spec.ts`: ADMIN solicitante → `BadRequestException` en reject (espejo CA-H6-02). |
| `recordWriteOff` interno | JSDoc `@internal` en `StockLedgerService.recordWriteOff` — no contrato público del Modulith; sin endpoint nuevo. |

---

## 3. Verificación backend

```powershell
$env:EV1_REAL_DB='1'; pnpm --filter @iwana/api test -- src/modules/inventory --coverage=false
```

| Resultado | Valor |
| --- | --- |
| Suites | **47 passed** |
| Tests | **357 passed** |
| Exit code | **0** |

---

## 4. Tracks paralelos — estado post-retractación

| Track | Dueño | Estado R1 | Estado real (re-verificación) |
| --- | --- | --- | --- |
| Backend día-exacta / EV-1 / aislamiento predicado | AI-SR-FULL | Hecho | **Sigue válido** (API 357 / portal 282 confirmados) |
| Portal `canApproveWriteOff` | AI-FE-PLATFORM | Hecho | **Sigue válido** |
| Chromium + E2E 41/41 | PLAT-OPS / QA | Declarado hecho | ⛔ **RETRACTADO** — sin binario; solo dir `b` en caché |
| Deuda ~29 con dueño | QA | Lista de siglas MOD* | ⛔ **Insuficiente** — falta tabla por fallo + ID |
| Cobertura util remediación | — | No exigida en R1 | ⛔ **Abierta** — borrar espejo TS; cubrir clamp; threshold Jest |

---

## 5. Stop/go

| Condición | Estado |
| --- | --- |
| B1 día-exacta | Remediado en código (sostiene) |
| B2 E2E reproducible | **NO remediado** — R2 |
| B3 aislamiento | Remediado (predicado) |
| Deuda CA-H6-07 contrapartida | **NO cumplida** — R2 |
| Listo re-G7 | **NO** |

---

## 6. Handoff

**H6-R2** obligatorio. Este informe **no** es evidencia de CA-H6-08 ni de cierre.

---

## 7. Historial

| Fecha | Cambio |
| --- | --- |
| 2026-07-21 | v1.0 — backend R1 |
| 2026-07-21 | v1.1 — consolidación prematura FE/PLAT-OPS/QA |
| 2026-07-21 | v1.2 — retractación B2/deuda; abre H6-R2 |
