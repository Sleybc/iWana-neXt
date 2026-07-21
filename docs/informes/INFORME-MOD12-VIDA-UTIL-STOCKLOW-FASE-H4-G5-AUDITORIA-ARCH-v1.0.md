# Informe — MOD12 Vida útil + StockLow Fase H4 — Auditoría ARCH (G5)

**Version:** 1.1  
**Fecha:** 2026-07-21  
**Estado:** ✅ **G5 GO** — habilita G6  
**Modo activo:** Architect (review de segunda capa + re-gate delta)  
**Auditor:** AI-EM-ARCH (aprobador ≠ productor)  
**Alcance:** Fase H4 — eventos `inventory.stock-low` / `inventory.asset-sold`, endpoint useful-life-alerts, panel portal  
**PRD:** `docs/prds/PRD-MOD12-VIDA-UTIL-STOCKLOW-v1.0.md`  
**Spec:** `docs/specs/2026-07-21-mod12-vida-util-stocklow-fase-h4-design.md`  
**ADR:** ADR-048 — sin migración; sin ADR nuevo (D-H4-08)

---

## 1. Veredicto

**G5 GO** — tubería de eventos post-commit OK; contrato useful-life-alerts alineado BE↔FE tras remediación P1; approve de bajas publica StockLow post-commit (parcial P2).

**Recomendación técnica:** habilitar G6 UX/DS/QA.

---

## 2. Checklist ARCH

| Ítem | Resultado |
| --- | --- |
| Boundaries Modulith | ✅ |
| Emisión post-commit | ✅ |
| Dedup al cruzar umbral | ✅ |
| Ambos niveles StockLow | ✅ |
| SALE → ASSET_SOLD | ✅ |
| Listener sin side-effects | ✅ |
| Sin migración indebida | ✅ |
| Multi-tenant | ✅ |
| Contrato useful-life API↔portal | ✅ (v1.1) |
| Write-off / cycle-count / receipt / counter-purchase → StockLow | ✅ (v1.1) |

---

## 3. Hallazgos

| ID | Severidad | Estado | Nota |
| --- | --- | --- | --- |
| G5-H4-P1 | P1 | ✅ Cerrado | `status` opcional; respuesta plana (`sku`, `status`, `monthsRemaining`, `pageSize`+`limit`) |
| G5-H4-P2 | P2 | ✅ Cerrado | StockLow post-commit en write-off approve, cycle-count close, goods-receipt y counter-purchase |
| G5-H4-P3 | P3 | Aceptada | Full-scan en memoria MVP |

---

## 4. Evidencia remediación

```text
pnpm --filter @iwana/api test -- useful-life write-off inventory-domain-event --coverage=false
→ 6 suites, 29 passed
```

---

## 5. Decisión

**Habilita G6.** P2 residual cerrada (cycle-count / goods-receipt / counter-purchase).
