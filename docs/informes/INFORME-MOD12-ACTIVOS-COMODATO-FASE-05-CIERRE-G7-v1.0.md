# Informe — MOD12 Activos y comodato Fases 05A + 05B — Cierre G7 (re-verificación CTO)

**Version:** 1.3  
**Fecha:** 2026-07-21  
**Estado:** ✅ **G7 — GO APROBADO POR CTO** (submódulo Activos y comodato MVP cerrado)  
**Modo activo:** Re-verificación independiente post-auditoría CTO (precedente Fase 3A)  
**Responsable:** AI-EM-ARCH (auditor ≠ productor de la sesión original)  
**Aprobador final:** CTO Humano — **GO formal 2026-07-21**
**Cadena:** G5 → `…FASE-05-G5-AUDITORIA-ARCH…` · G6 → `…FASE-05-G6-REVIEW…`  
**PRD:** `docs/prds/PRD-MOD12-ACTIVOS-COMODATO-v1.0.md` · ADR-048 · Spec D-F5

---

## 1. Resumen ejecutivo

Re-verificación G7 solicitada tras auditoría CTO que detectó tres hallazgos (A1–A3). La emisión original de G5/G6/G7 el mismo día que el código tenía separación productor/aprobador **nominal**; **este informe v1.1 es la verificación independiente** con evidencia reproducible.

| Fase | Veredicto G7 (post-remediación) |
| --- | --- |
| **5A — Ficha 360** | **GO** |
| **5B — Comodato** | **GO** (condición EV-1 cumplida) |

**Recomendación consolidada: GO** para cierre MVP RF-ACT-01…12. **Confirmado por CTO (2026-07-21).** RF-ACT-13 permanece fase futura con gate ADR.

---

## 2. Hallazgos CTO y remediación

| ID | Severidad | Hallazgo | Remediación | Evidencia |
| --- | --- | --- | --- | --- |
| **A1** | Media (funcional) | `resolvePurchaseOrigin` descartaba OC/recepción/costo si faltaba fila en `supplier_profiles` (OCs anteriores a migración 064) | Perfil solo enriquece `supplierDisplayName`; la sección ya no depende del perfil | `serialized-asset.service.ts` · test `returns purchase origin without supplier profile when OC chain resolves (A1)` |
| **A2** | Media (QA) | E2E comodato verificaba mock propio; sin smoke transaccional real del ciclo 5B | Suite EV-1 `asset-loan.transactional.ev1.spec.ts` contra PostgreSQL real (patrón Fase 3B) | `EV1_REAL_DB=1` → **3/3 passed** (2026-07-21) |
| **A3** | Media (gobierno) | G5/G6/G7 auto-aprobados en misma sesión productora | Re-verificación independiente documentada en v1.1; veredicto condicionado hasta EV-1 verde | Este informe |

**Corrección colateral EV-1:** bajas con motivo `LOST`/`STOLEN` transicionan a `SerializedAssetStatus.LOST` (HLD MOD12), habilitando cierre de comodato en baja desde `INSTALLED_COMODATO` — `stock-ledger.service.ts` (`resolveWriteOffAssetStatus`).

---

## 3. EV-1 comodato transaccional (A2)

Suite: `apps/api/src/modules/inventory/tests/asset-loan.transactional.ev1.spec.ts`

```text
EV1_REAL_DB=1 pnpm --filter @iwana/api test -- asset-loan.transactional.ev1.spec.ts --coverage=false
→ 3 passed (2026-07-21)
```

| Caso | Invariante verificado |
| --- | --- |
| Alta en OT + idempotencia + cierre en retorno | `asset_loan_assignments` escrito/cerrado en DB real; replay mismo `idempotencyKey` no duplica |
| Cierre en baja con comodato abierto | `removed_at` poblado tras `recordWriteOff` (motivo LOST) |
| Retorno sin comodato abierto (D-F5-13) | Operación no falla; conteo de comodatos = 0 |

**Nota sobre E2E portal:** el spec `portal-inventory-scm.spec.ts` (comodato) valida **cableado UI** con `page.route`; no sustituye EV-1. Ambos complementarios.

---

## 4. Re-verificación independiente (checklist)

| Ítem | Resultado |
| --- | --- |
| `GET /inventory/assets/:id` compuesto | ✅ |
| Origen compra sin `supplier_profiles` (A1) | ✅ |
| Comodato alta/cierre misma TX ledger | ✅ + EV-1 |
| Idempotencia `stockMovementId` | ✅ + EV-1 |
| `GET /inventory/loans` + aislamiento tenant | ✅ |
| Sin DDL / sin ADR nuevo | ✅ |
| Drawer 360 + bandeja Comodatos | ✅ |
| Refs opacas / sin PII suscriptor | ✅ |

---

## 5. Gates re-ejecutados (auditor G7 v1.1)

| Gate | Resultado |
| --- | --- |
| EV-1 comodato (DB real) | ✅ **3/3** passed |
| Jest API `serialized-asset-detail` + `stock-ledger` | ✅ **32/32** passed |
| Jest API `src/modules/inventory` (sesión original) | ✅ **303/303** passed (3 skipped) |
| Jest portal `src/components/inventory` | ✅ **266/266** passed |
| E2E ficha 360 + comodato (UI) | ✅ **2/2** passed |

---

## 6. Trazabilidad de gates

| Gate | Veredicto | Fecha | Notas |
| --- | --- | --- | --- |
| G4 (prompts emitidos) | GO | 2026-07-21 | — |
| G5 ARCH | GO | 2026-07-21 | Sesión original; no re-auditado en v1.1 |
| G6 UX/DS/QA | GO | 2026-07-21 | E2E UI; EV-1 añadido post-A2 |
| G7 EM-ARCH v1.0 | GO nominal | 2026-07-21 | **Supersedido** por v1.1 |
| **G7 EM-ARCH v1.2** | **GO recomendado** | 2026-07-21 | Deuda G5-05A/B cerrada (migración 081) |
| **G7 CTO** | **GO APROBADO** | 2026-07-21 | Cierre formal submódulo Activos y comodato |

---

## 7. Deuda residual

| ID | Estado | Nota |
| --- | --- | --- |
| G5-05A-01 | ✅ **Cerrado** | Migración 081: `asset_lifecycle_events.stock_movement_id` + enlace UI «Ver movimiento» |
| G5-05A-02 | ✅ **Cerrado** | `SerializedAssetDetailResponseDto` + `@ApiOkResponse` en `GET /inventory/assets/:id` |
| G5-05B-01 | ✅ **Cerrado** | Índice único parcial `uq_asset_loan_assignments_tenant_movement` (migración 081) |
| G5-05B-04 | Aceptada | Sin backfill comodatos históricos (decisión PRD §9) |
| G6-P2-01 | Aceptada | 11 E2E compras/RFQ preexistentes — fase Compras, no 5A/5B |
| H3/H4/H5 | Fases propias | Bajas con aprobación, alertas vida útil, tabs legacy |

---

## 8. Decisión

| Pregunta | Respuesta |
| --- | --- |
| ¿GO producción 5A? | **Sí** (A1 corregido) |
| ¿GO producción 5B? | **Sí** (EV-1 verde) |
| ¿Submódulo Activos y comodato MVP? | **Completo** (RF-ACT-01…12) |
| ¿ADR nuevo requerido? | **No** |

**Decisión CTO (2026-07-21): GO G7 v1.3** — submódulo Activos y comodato **MVP cerrado** en `main`.

---

## 9. Post-cierre (ejecutado)

1. ✅ `INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md` — H1/H2 **cerrados**.
2. ✅ Prompts 5A/5B → **CERRADOS**.
3. ✅ PRD submódulo → **Aprobado / MVP cerrado**.
4. ✅ Commit + push a `main` (2026-07-21).
