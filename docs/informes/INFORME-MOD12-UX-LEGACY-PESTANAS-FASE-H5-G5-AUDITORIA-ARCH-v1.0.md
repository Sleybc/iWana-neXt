# Informe — MOD12 UX pestañas legacy Fase H5 — Auditoría ARCH (G5)

**Version:** 1.0  
**Fecha:** 2026-07-21  
**Estado:** ✅ **G5 GO** — habilita G6 (UX / DS / QA)  
**Modo activo:** Architect (review de segunda capa, solo lectura)  
**Auditor:** AI-EM-ARCH (aprobador ≠ productor)  
**Alcance:** Fase H5 — extracción Movimientos/Bajas + cero `<select>` nativos en inventory portal  
**PRD:** `docs/prds/PRD-MOD12-UX-LEGACY-PESTANAS-v1.0.md`  
**Spec:** `docs/specs/2026-07-21-mod12-ux-legacy-pestanas-fase-h5-design.md` (D-H5-01…06)  
**ADR:** no aplica (D-H5-06 — sin ADR)

---

## 1. Veredicto

**G5 GO** — sin bloqueantes de arquitectura frontend. Shell vs workspace respetado; cero `<select>` HTML en `apps/portal/src/components/inventory/`; sin pestaña de primer nivel nueva; sin cambios backend.

**Recomendación técnica:** habilitar G6 (PROD-UX / DS-OWNER / SR-QA) para validar flujos, Select DS y tests/E2E.

---

## 2. Checklist ARCH

| Ítem | Resultado | Evidencia |
| --- | --- | --- |
| Shell vs workspace (D-H5-01 / D-H5-04) | ✅ | `TabsContent value="movements"` solo monta `MovementsWorkspace`; estado + `handleSale` / `handleReturn` permanecen en `InventoryClient` |
| Solicitar baja en panel (D-H5-02) | ✅ | Bloque «Solicitar baja» vive en `WriteOffsPanel` (sección superior); orden visual Solicitar → Pendientes → Historial; `handleWriteOff` en shell |
| Cero `<select>` nativos (D-H5-03 / RF-H5-03) | ✅ | `rg '<select'` en `components/inventory` = 0; filtros comodatos/vida útil usan `Select` de `@iwana/ui` (`data-testid` exigidos) |
| Sin `PortalSelect` / wrappers locales | ✅ | Sin usos de `PortalSelect`; import directo `Select` desde `@iwana/ui` |
| Sin pestaña nueva (RF-H5-04) | ✅ | Triggers de primer nivel invariantes: summary…assets + movements + writeoffs (sin 12ª) |
| Sin backend (D-H5-06) | ✅ | Diff limitado a portal inventory + docs; `apps/api` / `packages/database` sin cambios en esta fase |
| Fuera de alcance respetado | ✅ | No se extrajo summary/catalog/locations; sin ADR nuevo |
| Boundaries FE | ✅ | Workspaces/paneles presentacionales + callbacks; API calls de venta/retorno/baja solo en shell |

---

## 3. Trazabilidad RF ↔ implementación

| RF / decisión | Estado | Nota |
| --- | --- | --- |
| RF-H5-01 MovementsWorkspace | ✅ | Props con estado en shell + `onSaleFormChange` / `onReturnFormChange`; opciones Select derivadas de `items`/`locations` |
| RF-H5-02 Solicitar baja en WriteOffsPanel | ✅ | Formulario + feedback success/error vía props del shell; sin componente aparte (opción permitida por D-H5-02) |
| RF-H5-03 Select `@iwana/ui` | ✅ | `AssetLoansPanel`, `UsefulLifeAlertsPanel`, movimientos y bajas |
| RF-H5-04 Sin pestaña nueva | ✅ | Misma IA de pestañas |
| RF-H5-05 Semántica H3 / movimientos | ✅ | Handlers API y validaciones de botones preservados en shell |

---

## 4. Evidencia de artefactos

| Artefacto | Rol H5 |
| --- | --- |
| `MovementsWorkspace.tsx` + `.spec.tsx` | Extracción venta + retorno; smoke + opciones estado retorno |
| `WriteOffsPanel.tsx` | Solicitar + pendientes + historial |
| `InventoryClient.tsx` | Shell adelgazado en movements/writeoffs |
| `AssetLoansPanel.tsx` + spec | Filtro `asset-loans-status-filter` → `Select` |
| `UsefulLifeAlertsPanel.tsx` + spec | Filtro `useful-life-alerts-status-filter` → `Select` |
| `InventoryClient.spec.tsx` | Cobertura solicitar baja / movimientos actualizada |

---

## 5. Observaciones (no bloqueantes)

| ID | Severidad | Nota |
| --- | --- | --- |
| G5-H5-01 | Info | `InventoryClient` sigue siendo shell grande; extracción de summary/catalog queda explícitamente fuera (D-H5-06 / H6 documental o fase posterior) |
| G5-H5-02 | Info | `UsefulLifeAlertsPanel` conserva fetch local (patrón H4); H5 solo migró el filtro a `Select` — coherente con alcance |
| G5-H5-03 | Baja | Smoke E2E bajas/vida útil y cierre del hallazgo H5 en informe maestro → responsabilidad **G6/G7**, no gate ARCH |

---

## 6. Decisión

**G5 GO.** Habilita **G6** (UX / DS / QA). Cierre formal de H5 en informe maestro queda para **G7** tras G6.
