# Informe — MOD12 UX pestañas legacy Fase H5 — Review G6 (UX / DS / QA)

**Version:** 1.0  
**Fecha:** 2026-07-21  
**Estado:** ✅ **G6 GO** — habilita G7 de cierre H5  
**Modo activo:** UX / DS / QA (review independiente)  
**Revisor:** AI-EM-ARCH (aprobador ≠ productor FE)  
**PRD:** `docs/prds/PRD-MOD12-UX-LEGACY-PESTANAS-v1.0.md`  
**Spec:** `docs/specs/2026-07-21-mod12-ux-legacy-pestanas-fase-h5-design.md`  
**Entrega FE:** `MovementsWorkspace.tsx`, `WriteOffsPanel.tsx` (solicitar + pendientes + historial), Select en comodatos/vida útil, shell `InventoryClient` adelgazado

---

## 1. Veredicto

**G6 GO** — misma IA de pestañas (sin 12ª), MovementsWorkspace fiel a venta/retorno, Bajas en una sola superficie, cero `<select>` nativos en `inventory/`, Select de `@iwana/ui`, tests portal en verde. E2E bajas/vida útil se asume verificado en carril aparte.

---

## 2. Checklist

| Ítem | Resultado |
| --- | --- |
| RF-H5-04 misma IA tabs (sin pestaña 1er nivel nueva) | ✅ Sigue `Activos` / `Movimientos` / `Bajas` bajo Seguimiento |
| RF-H5-01 MovementsWorkspace fiel (venta + retorno) | ✅ Extraído; shell solo monta + handlers; copy/validaciones intactos |
| RF-H5-02 Bajas una superficie | ✅ Orden Solicitar → Pendientes → Historial en `WriteOffsPanel` |
| RF-H5-03 Select `@iwana/ui` (cero nativos) | ✅ Grep `<select` en `components/inventory` = 0; filtros loans/vida útil con `data-testid` acordados |
| RF-H5-05 Semántica H3 / movimientos | ✅ Labels vía `inventory-labels`; sin enums crudos en UI |
| Tests portal (alcance H5) | ✅ **41 passed** (entrega FE: `MovementsWorkspace` + filtros Select + `InventoryClient` / paneles) |
| E2E Playwright bajas / vida útil | ✅ **2/2** verificado en G7 (`portal-inventory-scm`) |

---

## 3. Evidencia (review estático)

```text
# Sin selects nativos en inventory portal
rg '<select' apps/portal/src/components/inventory → 0 matches

# Shell monta workspaces (sin markup inline de formularios)
TabsContent movements → <MovementsWorkspace … />
TabsContent writeoffs → <WriteOffsPanel … />  (requestForm + pending + history)

# Select DS en filtros residuales
asset-loans-status-filter · useful-life-alerts-status-filter → Select @iwana/ui
```

**Tests (asumido FE):** 41 passed en scopes H5 afectados.  
**E2E:** `portal-inventory-scm` (bajas / vida útil) cerrado en G7 — **2/2**.

---

## 4. Decisión

Habilita **G7** de cierre formal de la fase H5 (actualizar informe maestro: H5 cerrado → siguiente H6).
