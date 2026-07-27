# Portal — Adopción CTA lima (Firma iWana)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans`. Steps use `- [ ]`.

**Goal:** Alinear los CTAs principales de **página/panel/empty** del portal a `Button variant="lime"` (deuda de adopción vs Usuarios / UI-18).

**Architecture:** Carril rápido de UI. No cambia tokens de marca ni API de `Button`. Solo adopción del contrato ya congelado: lima = una acción de avance por vista; navy (`primary`) = submit de modal/sección; outline/secondary/ghost = secundarias.

**Tech Stack:** `@iwana/ui` Button CVA (`lime` ≠ `secondary` — la tabla en `firma-elements.md` que cita `secondary` está desactualizada; manda `Button.tsx`).

**Gobierno:** AI-EM-ARCH. R = AI-FE-PLATFORM. C = AI-DS-OWNER. V = AI-SR-QA.

---

## Contrato congelado (UI-18 + Firma)

| Superficie | Variant |
| --- | --- |
| CTA de página / `PortalPanel.actions` / empty primera vez que **abre** alta | `lime` |
| Submit dentro de Dialog/Drawer/form («Crear X», «Guardar», «Confirmar») | `primary` (default) |
| Importar / Actualizar / Cancelar / outline | `outline` / `secondary` / `ghost` |

**STOP:** no pintar submits de modal en lima. No tocar `apps/web` salvo que aparezca el mismo patrón. No cambiar badges `variant="lime"`.

### Ratificación DS-OWNER (2026-07-23) — GO con IN/OUT afinado

**IN (openers → lime):** PlanCatalogPanel Nuevo plan; AdditionalProducts/Services Agregar *; PromotionsManager Crear promoción (header/empty; submit peek OUT); InventoryClient Nuevo producto + Nueva categoría (header+empty); StockLocationsPanel + StockLocationsMatrix empty Crear bodega; StockCountsWorkspace Nuevo conteo; StockIssuesWorkspace Crear salida **solo opener**; SubscribersListClient Nuevo suscriptor; AssuranceClient + AssuranceTicketsTable Nuevo ticket; AccessControlSettingsClient Crear perfil PageHeader (submit dialog OUT).

**OUT (quedan primary/secondary):** CommercialActivityPanel «Crear plan»; RfqInvitationsPanel «Crear solicitud…»; StockIssueComposer/FormDrawer «Crear salida»; cualquier submit Dialog/Drawer; badges lima; apps/web; Scheduling/PurchaseRequest.

**Docs este lote:** corregir `firma-elements.md` L86 `secondary` → `lime`.

---

## Inventario candidato (FE confirma y aplica)

### Comercial
- [ ] `PlanCatalogPanel.tsx` — «Nuevo plan» (header + empty)
- [ ] `AdditionalProductsPanel.tsx` — «Agregar producto» (header + empty)
- [ ] `AdditionalServicesPanel.tsx` — «Agregar servicio» (header + empty)
- [ ] `PromotionsManager.tsx` — «Crear promoción» (header + empty)
- [ ] `CommercialActivityPanel` / CTAs de actividad que abran alta de plan — si aplica

### Inventario
- [ ] `InventoryClient.tsx` — «Nuevo producto» (y análogo categoría si es CTA de página)
- [ ] `StockLocationsPanel.tsx` — «Crear bodega»
- [ ] `StockCountsWorkspace.tsx` — «Nuevo conteo»
- [ ] `StockIssuesWorkspace.tsx` — «Crear salida» (si es CTA de página, no submit de composer)
- [ ] `RfqInvitationsPanel.tsx` — «Crear solicitud de cotización» (si header/página)

### CRM / Assurance / Settings
- [ ] `SubscribersListClient.tsx` — «Nuevo suscriptor»
- [ ] `AssuranceClient.tsx` / `AssuranceTicketsTable.tsx` — «Nuevo ticket»
- [ ] `AccessControlSettingsClient.tsx` — CTA de página «Crear perfil» (no el submit del dialog)

### Ya alineados (no tocar salvo regresión)
- Usuarios: `UsersClient` / empty `UsersTable` ya `lime`

---

## Tasks

### Task 1: Migrar CTAs
- [ ] Añadir `variant="lime"` solo donde el botón es CTA de página/panel/empty de alta.
- [ ] Dejar submits de modal sin `lime` (default `primary`).
- [ ] Actualizar specs que asuman clase/color si fallan (preferir role/name, no color).

### Task 2: Verificación
- [ ] Grep: `Nuevo plan|Nuevo producto|Nuevo suscriptor|Nuevo ticket|Crear promoción|Crear bodega|Nuevo conteo` junto a Button — confirmar lime en openers.
- [ ] `pnpm --filter @iwana/portal exec jest` acotado a specs tocadas.
- [ ] Typecheck portal si el cambio lo amerita.

### Task 3: Reporte
- [ ] Lista archivo:línea tocados, IDs fuera de alcance descubiertos, STOP si duda.

## Criterio stop/go
- **GO** si Comercial «Nuevo plan» e Inventario «Nuevo producto» son lima y submits de modal siguen navy.
- **NO-GO** si algún submit de Dialog quedó lima o si se cambió el default global de Button.

### Estado de ejecución (2026-07-23)

| Gate | Resultado |
| --- | --- |
| G4 / contrato | GO — DS-OWNER IN/OUT afinado |
| G5 FE | GO — adopción + gaps (ActivityPanel secondary; empties categoría/bodega matriz; firma-elements) |
| G6 SR-QA | **GO con deuda** — 14 suites / 106 tests; empties StockLocationsPanel/StockCountsWorkspace sin createAction (P3) |
| G7 EM-ARCH | **GO** — deuda P3 registrada; «Nuevo proveedor» / Scheduling / PurchaseRequest fuera de lote |
