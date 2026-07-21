# Informe — MOD12 Bajas con aprobación Fase H3 — Review G6 (UX / DS / QA)

**Version:** 1.0  
**Fecha:** 2026-07-21  
**Estado:** ✅ **G6 GO** — habilita G7 de cierre H3  
**Modo activo:** UX / DS / QA (review independiente)  
**Revisor:** AI-EM-ARCH (aprobador ≠ productor FE)  
**PRD:** `docs/prds/PRD-MOD12-BAJAS-APROBACION-v1.0.md`  
**Entrega FE:** `WriteOffsPanel.tsx`, pestaña Bajas en `InventoryClient.tsx`

---

## 1. Veredicto

**G6 GO** — flujo solicitud→aprobación usable, copy en español, sin enums crudos, tests portal y E2E cubren el camino feliz.

---

## 2. Checklist

| Ítem | Resultado |
| --- | --- |
| RF-WO-10 copy español | ✅ Motivos/estados vía `inventory-labels.ts` |
| Solicitud sin ledger inmediato | ✅ Mensaje «Solicitud registrada — pendiente de aprobación» |
| Bandeja pendientes | ✅ Subvista en Bajas; Aprobar/Rechazar inline |
| Separación solicitante/aprobador UI | ✅ Botón Aprobar deshabilitado para autor |
| Historial + enlace movimiento | ✅ Filtro estado + «Ver MOV-…» |
| Tests portal | ✅ 31/31 `InventoryClient.spec.tsx` |
| E2E Playwright | ✅ `solicita baja de consumible y la aprueba un segundo usuario` |
| H5 (select nativos) | 🟡 Deuda aceptada — formulario Bajas legacy; fuera alcance H3 |

---

## 3. Evidencia E2E

```text
npx playwright test e2e/tests/portal-inventory-scm.spec.ts -g "solicita baja" --config e2e/playwright.portal.config.ts
→ 1 passed
```

---

## 4. Decisión

Habilita **G7** de cierre formal de la fase H3.
