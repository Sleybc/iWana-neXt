# PRD — MOD12 Inventario / Fase H5 — UX pestañas legacy Movimientos/Bajas

**Version:** 1.0  
**Estado:** ✅ **MVP cerrado** — G5+G6+G7 GO recomendado (2026-07-21)  
**Fecha:** 2026-07-21  
**Modo activo:** Product Architect + Orchestrator  
**Autor:** AI-EM-ARCH  
**Clasificación:** Confidencial — Uso interno  
**PRD padre:** [PRD-MOD12-INVENTARIO-SCM-v1.0.md](PRD-MOD12-INVENTARIO-SCM-v1.0.md)  
**Auditoría:** [INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md](../informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md) (hallazgo **H5**)  
**Spec:** [2026-07-21-mod12-ux-legacy-pestanas-fase-h5-design.md](../specs/2026-07-21-mod12-ux-legacy-pestanas-fase-h5-design.md)

---

## 1. Contexto

Tras H3/H4, el hallazgo **H5** (Media) es deuda UX: formularios de Movimientos/Bajas embebidos en `InventoryClient` y selects nativos residuales, fuera del patrón workspace/panel de Compras, Salidas y Existencias.

Consulta previa: **AI-DS-OWNER GO** (solo `Select` `@iwana/ui`); **AI-PROD-UX OK** (sin 12ª pestaña; flujos intactos).

## 2. Alcance

### En scope

- Extraer Movimientos (venta + retorno) a `MovementsWorkspace`.
- Mover «Solicitar baja» dentro de `WriteOffsPanel` (misma pestaña).
- Cero `<select>` HTML en `apps/portal/src/components/inventory/` (incluye filtros comodatos y vida útil).
- Tests + E2E smoke; informes G5–G7.

### Fuera de scope

- Partir summary/catalog/resto del shell (~3k líneas) en más workspaces.
- Backend, migraciones, ADR, rediseño Firma iWana, nuevas pestañas.

## 3. RF

| ID | Requisito |
| --- | --- |
| RF-H5-01 | `MovementsWorkspace` contiene venta + retorno; shell solo monta y pasa handlers. |
| RF-H5-02 | Formulario solicitar baja vive en superficie `WriteOffsPanel` (orden: solicitar → pendientes → historial). |
| RF-H5-03 | Todos los filtros/formularios inventory usan `Select` de `@iwana/ui`. |
| RF-H5-04 | Sin pestaña de primer nivel nueva. |
| RF-H5-05 | Copy y flujos H3 (bajas) y movimientos sin cambio de semántica. |

## 4. Gates

| Gate | Criterio |
| --- | --- |
| G5 | Shell vs workspace; sin boundary FE roto |
| G6 | UX/DS/QA — Select, flujos, tests/E2E |
| G7 | H5 cerrado en informe maestro; siguiente H6 |

## 5. Criterios de aceptación

- [x] Grep `<select` en `components/inventory` = 0
- [x] MovementsWorkspace extraído + tests
- [x] Solicitar baja fuera de InventoryClient inline
- [x] InventoryClient.spec + E2E bajas/vida útil OK
- [x] Informe maestro H5 cerrado

---

**Prompt:** [PROMPT-MOD12-UX-LEGACY-PESTANAS-FASE-H5-v1.0.md](../prompts/PROMPT-MOD12-UX-LEGACY-PESTANAS-FASE-H5-v1.0.md)
