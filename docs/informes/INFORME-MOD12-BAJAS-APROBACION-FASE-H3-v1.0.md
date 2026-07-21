# Informe — MOD12 Inventario — Bajas con aprobación — Fase H3

**Version:** 1.0  
**Fecha:** 2026-07-21  
**Estado:** ✅ Entrega completa — **G5 GO** · **G6 GO** · **G7 GO recomendado**  
**Modo activo:** Ejecución multiagente (AI-SR-FULL + AI-FE-PLATFORM)  
**Orquestador:** AI-EM-ARCH  
**PRD:** `docs/prds/PRD-MOD12-BAJAS-APROBACION-v1.0.md`  
**Spec:** `docs/specs/2026-07-21-mod12-bajas-aprobacion-fase-h3-design.md`  
**G5:** `INFORME-MOD12-BAJAS-APROBACION-FASE-H3-G5-AUDITORIA-ARCH-v1.0.md`

---

## 1. Resumen

Implementada la fase **H3** — cierre del hallazgo Alto **RF-INV-19**: las bajas pasan por documento en `inventory_write_offs` con aprobación de un segundo usuario antes de afectar el ledger.

---

## 2. Entregables

### Backend (AI-SR-FULL)

| Artefacto | Ruta |
| --- | --- |
| Migración 082 | `packages/database/src/migrations/tenant/082_extend_inventory_write_offs_payload.ts` |
| Servicio | `apps/api/src/modules/inventory/services/write-off.service.ts` |
| Ledger refactor | `recordWriteOffWithManager` en `stock-ledger.service.ts` |
| Controller | 5 endpoints write-offs |
| Tests | `write-off.service.spec.ts` (9 casos) |

### Frontend (AI-FE-PLATFORM)

| Artefacto | Ruta |
| --- | --- |
| API client | `writeOffs.*` + tipos en `api-client.ts` |
| Panel | `WriteOffsPanel.tsx` — pendientes + historial |
| Integración | `InventoryClient.tsx` — solicitar / aprobar / rechazar |

---

## 3. Trazabilidad RF-WO

| RF | Estado |
| --- | --- |
| RF-WO-01 … RF-WO-10 | ✅ Implementados según PRD |
| RF-INV-19 (PRD padre) | ✅ Construido |
| H3 (auditoría MOD12) | ✅ Cerrado — G7 GO recomendado |

---

## 4. Breaking change

`POST /inventory/write-offs` **ya no aplica al ledger**. Portal y tests actualizados en la misma entrega.

---

## 5. Limitaciones declaradas

- Sin backfill de bajas pre-H3 (solo ledger histórico) — D-H3-09
- Sin adjuntos en object storage — solo `notes`
- E2E Playwright ✅ (`portal-inventory-scm.spec.ts`)

---

## 6. Gates

| Gate | Veredicto |
| --- | --- |
| G5 ARCH | **GO** |
| G6 UX/DS/QA | **GO** — [`…G6-REVIEW…`](INFORME-MOD12-BAJAS-APROBACION-FASE-H3-G6-REVIEW-v1.0.md) |
| G7 EM-ARCH | **GO recomendado** — [`…CIERRE-G7…`](INFORME-MOD12-BAJAS-APROBACION-FASE-H3-CIERRE-G7-v1.0.md) |

---

## 7. Verificación

```text
pnpm --filter @iwana/db build                                    → OK
pnpm --filter @iwana/api test -- write-off                       → 9/9
pnpm --filter @iwana/api test -- src/modules/inventory           → 317 passed
pnpm --filter @iwana/portal test -- InventoryClient              → 31/31
npx playwright test … -g "solicita baja" (portal)                → 1/1
```

Migración 082 aplicada: `pnpm db:migrate:all` → tenant_iwana OK (2026-07-21)
