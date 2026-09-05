# INFORME — MOD12 Compras · Decimales e impuestos en cotización — Fase 25

**Versión:** 1.0
**Estado:** Implementado — pendiente G6 formal / G7 CTO
**Fecha:** 2026-09-04
**Módulo:** MOD12 Inventario / SCM — Compras / RFQ
**Ejecutores:** AI-DATA-ENG · AI-SR-FULL · AI-FE-PLATFORM · AI-SR-QA
**Orquestador:** AI-EM-ARCH
**Spec:** [2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos-design.md](../specs/2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos-design.md)
**Prompt:** [PROMPT Fase 25](../prompts/PROMPT-MOD12-COMPRAS-COTIZACION-IMPUESTOS-FASE-25-v1.0.md)
**Plan:** [2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos.md](../plans/2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos.md)
**ADR:** Addendum [ADR-053](../adrs/ADR-053-Supplier-Quote-Lines.md) · consumo [ADR-029](../adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md) D4

## Contexto

El registro de cotización mostraba subtotales/totales como enteros y no permitía declarar IVA / retención en la fuente / Rete ICA / Rete IVA. El operador no podía comparar por **neto a pagar**. Esta fase es captura operativa (no factura DIAN ni umbral de aprobación).

## Cambios verificados (sin reimplementar)

### Datos
- Migración tenant `124_add_supplier_quote_taxes`: `payable_amount`, tabla `supplier_quote_taxes`, seed idempotente `RETE_IVA`, `down` simétrico. Sin FK a `tax_definitions`.

### Backend
- Motor puro `quote-tax-calc` (centavos HALF_UP). Servidor calcula; el cliente solo envía `{ code, applies, rate? }`.
- POST quotes + GET detail: `payableAmount`, `taxes`, `purchaseTaxPresets`.
- `estimatedAmount` sigue siendo Σ `(amount + shippingCost)`.

### Frontend
- `formatInventoryMoney` (2 decimales) en superficies de cotización.
- `QuoteTaxFields` en RFQ inline y «Nueva cotización».
- Comparación por neto; copy de no-factura.

## Criterios de aceptación

| CA | Estado | Evidencia (archivo + `it`) |
| --- | --- | --- |
| CA-25-01 2 decimales en subtotal/totales | **GO** | `inventory-cost-labels.spec.ts` → `CA-25-01: formatInventoryMoney muestra 2 decimales y no altera el formato entero`; `SupplierQuoteLinesEditor.spec.tsx` → `CA-25-01: muestra subtotal y total con 2 decimales`; comparación usa el mismo formatter (`QuoteComparisonPanel.spec.tsx` CA-18-05 / CA-25-10) |
| CA-25-02 unitario etiquetado sin IVA | **GO** | `SupplierQuoteLinesEditor.spec.tsx` → `CA-25-02: el unitario se etiqueta como sin IVA` |
| CA-25-03 4 tributos apagados; tasa al encender | **GO** | `QuoteTaxFields.spec.tsx` → `CA-25-03: arranca con los cuatro tributos apagados y sin tasas visibles` y `CA-25-03: encender revela la tasa con el default del catálogo`; `quote-tax-calc.spec.ts` (portal) → `CA-25-03: el estado inicial deja los cuatro tributos apagados con default de catálogo`; `RfqInvitationsPanel.spec.tsx` → `CA-25-03: envía solo el tributo encendido y deshabilita guardar con tasa inválida` |
| CA-25-04 fórmulas 100 → 19 / 4 / 0.41 / 2.85 / neto 111.74 | **GO** | `apps/api/.../quote-tax-calc.spec.ts` → `CA-25-04: IVA 19, ReteFte 4, ReteICA 0.414, ReteIVA 15% del IVA → neto 111.74`; `purchasing.service.spec.ts` → `persiste payableAmount y taxes calculados (CA-25-04)`; portal `quote-tax-calc.spec.ts` y `QuoteTaxFields.spec.tsx` (preview local) |
| CA-25-05 Rete IVA 0 si IVA no aplica | **GO** | API `quote-tax-calc.spec.ts` → `CA-25-05: sin IVA, Rete IVA applies true → taxAmount 0` y `CA-25-05: IVA aplica con monto 0, Rete IVA → taxAmount 0`; portal `quote-tax-calc.spec.ts` → `CA-25-05: Rete IVA queda en 0 si el IVA no aplica` |
| CA-25-06 envío fuera de bases; `amount` intacto | **GO** | API `quote-tax-calc.spec.ts` → `CA-25-06: el envío no entra en las bases; amount de productos intacto`; portal `quote-tax-calc.spec.ts` → `CA-25-06: el envío no entra en las bases tributarias` |
| CA-25-07 servidor calcula (cliente no manda montos) | **GO** | API `quote-tax-calc.spec.ts` → `CA-25-07: ignora montos tributarios extra del cliente y recalcula`; `add-supplier-quote.schema.spec.ts` → `CA-25-07: descarta montos tributarios enviados por el cliente` |
| CA-25-08 legacy payable = amount + shipping | **GO** | `purchasing.service.spec.ts` → `legacy sin taxes persiste payableAmount = amount + shipping`; API `quote-tax-calc.spec.ts` → `legacy taxes omitido/vacío: taxes=[] y payable=amount+shipping` |
| CA-25-09 `estimatedAmount` sin IVA | **GO** | `purchasing.service.spec.ts` → `estimatedAmount de aprobación no incluye IVA (CA-25-09)` (490000 vs payable 583100; nivel BUYER) |
| CA-25-10 comparación por neto + copy no-factura | **GO** | `QuoteComparisonPanel.spec.tsx` → `CA-25-10: ordena por neto, hero Neto a pagar y copy de no-factura` y `CA-25-10: desglosa tributos activos y ordena por neto persistido` |
| CA-25-11 GET detail presets PURCHASE; portal no llama Taxation HTTP | **GO** | `purchasing.service.spec.ts` → `CA-25-11: GET detail expone presets PURCHASE del catálogo`; `inventory-tax-boundary.spec.ts` (portal) → `CA-25-11: componentes de inventario no llaman HTTP de Taxation`; swagger GET description incluye `purchaseTaxPresets` |
| CA-25-12 migración 124 reversible; OpenAPI/swagger taxes; RBAC intacto | **GO** | `124_add_supplier_quote_taxes.spec.ts` → `es reversible: seed, índices de taxes, tabla, índice payable y columna`; `purchasing.swagger.spec.ts` → `CA-25-12: documenta taxes en POST de cotizaciones y presets en GET detail`; `inventory-tax-boundary.spec.ts` (API) → `CA-25-12: POST quotes conserva INVENTORY_PURCHASING_MANAGE y GET detail READ` |
| CA-25-13 unique invitación 409; PATCH para corregir la misma oferta | **GO** | `rfq.service.spec.ts` → `CA-25-13: segundo POST a la misma invitación lanza 409`; `inventory-tax-boundary.spec.ts` → `PATCH de cotización exige INVENTORY_PURCHASING_MANAGE`; `purchasing.swagger.spec.ts` → `documenta PATCH para corregir una cotización registrada`; `purchasing.service.spec.ts` → `corrige una cotización en PENDING_APPROVAL y recalcula el neto` |
| CA-25-14 mismo bloque RFQ y Nueva cotización | **GO** | `RfqInvitationsPanel.spec.tsx` → `CA-25-14: muestra tributos en el registro inline y omite el payload si están apagados`; `PurchaseRequestWorkbenchDrawer.spec.tsx` → `CA-25-14: nueva cotización muestra tributos apagados y copy de no-factura` |

## Verificación de comandos

Corrido el 2026-09-04. No se ejecutó el monorepo entero. No se ejecutó E2E Playwright.

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/db exec jest src/migrations/tenant/124_add_supplier_quote_taxes.spec.ts --no-coverage` | **7/7 pass** (1 suite) |
| `pnpm --filter @iwana/api exec jest` sobre `quote-tax-calc.spec.ts`, `purchasing.service.spec.ts`, `purchasing.swagger.spec.ts`, `inventory-tax-boundary.spec.ts`, `add-supplier-quote.schema.spec.ts`, `rfq.service.spec.ts` | **83/83 pass** (6 suites) |
| `pnpm --filter @iwana/portal exec jest` sobre QuoteTaxFields, quote-tax-calc, SupplierQuoteLinesEditor, QuoteComparisonPanel, RfqInvitationsPanel, PurchaseRequestWorkbenchDrawer, inventory-cost-labels, inventory-tax-boundary | **55/55 pass** (8 suites) |

Desglose API (todos pass): quote-tax-calc 12 · purchasing.service 40 · swagger 6 · inventory-tax-boundary 4 · add-supplier-quote.schema 4 · rfq.service 17.

Desglose portal (todos pass): QuoteTaxFields 4 · quote-tax-calc 9 · SupplierQuoteLinesEditor 4 · QuoteComparisonPanel 6 · RfqInvitationsPanel 16 · PurchaseRequestWorkbenchDrawer 11 · inventory-cost-labels 4 · inventory-tax-boundary 1.

Nota: RfqInvitationsPanel emite `console.error` jsdom `Not implemented: navigation` (descarga PDF). No falla el suite.

### Checks de boundary / vocabulario (esta sesión)

| Check | Resultado |
| --- | --- |
| Inventory no importa entidad `TaxDefinition` ni `ITaxApplicationReadPort` | Pass (`inventory-tax-boundary.spec.ts` API) |
| `estimatedAmount` no incluye IVA | Pass (CA-25-09) |
| UI visible sin `IVA_19` / `WITHHOLDING` / `payableAmount` en componentes | Pass (QuoteTaxFields, QuoteComparisonPanel, RFQ, drawer). Fixtures de test sí usan códigos. |
| E2E purchasing con «Total con envío» | No hay match en `e2e/`. Nada que actualizar. |

## Deuda / concerns

1. **Tasa `RETE_IVA` (15 % placeholder).** Spec §D3/D7: requiere verificación con fuente oficial. Esta fase no afirma cumplimiento DIAN.
2. **E2E Playwright no corrido.** No hay fixture RFQ estable; no es obligatorio en el plan. No existe aserción E2E de «Total con envío» que migrar a «Neto a pagar».
3. **Migración 124:** verificada por spec de SQL (`up`/`down`), no aplicada en esta sesión contra un tenant real.
4. **RfqInvitationsPanel:** ruido jsdom de navegación en tests de descarga PDF (preexistente; no bloquea).

## Tests añadidos por QA (solo cobertura de CA; sin lógica de producto)

- `SupplierQuoteLinesEditor.spec.tsx` — CA-25-02.
- `quote-tax-calc.spec.ts` (API) y `add-supplier-quote.schema.spec.ts` — CA-25-07.
- `purchasing.service.spec.ts` — CA-25-11 presets.
- `inventory-tax-boundary.spec.ts` (portal) — CA-25-11 sin HTTP Taxation.
- `inventory-tax-boundary.spec.ts` (API) + `purchasing.swagger.spec.ts` — CA-25-12 RBAC/OpenAPI y CA-25-13 PATCH de corrección (POST duplicado sigue 409).
- `rfq.service.spec.ts` — CA-25-13 409.

## Stop/go G6

**Recomendación: GO de G6 con concerns** (no BLOCKED).

Los 14 CA tienen test que pasa. Boundary Inventory→Taxation, aprobación sin IVA y vocabulario visible están verdes. Los concerns (fuente oficial `RETE_IVA`, E2E browser, migración no aplicada aquí) no son criterio de stop del prompt.

G7 CTO permanece pendiente. No commit en esta sesión.

## Addendum 2026-09-04 — Envío y neto visible

Corrección de producto sobre el formulario de cotización:

- El neto ya no depende de un monto de envío lleno. Vacío = cero.
- Tres condiciones visibles: Es gratis · Lo cobra el proveedor · Lo paga al transportador.
- Migración tenant `125_add_supplier_quote_shipping_arrangement`.
- Layout de dos columnas: envío/tributos + resumen.

Evidencia de esta corrección: `QuoteEconomicsFields.spec.tsx`, `QuoteShippingFields.spec.tsx`, `QuoteComparisonPanel.spec.tsx` (flete al transportador), `purchasing.service.spec.ts` (PAY_CARRIER / FREE), migración 125. Auditoría UI de archivos tocados: sin hallazgos.

## Protocolo

| Gate | Estado |
| --- | --- |
| G4 spec/prompt | Cumplido (entrada de esta fase) |
| G5 DATA-ENG / SR-FULL / FE-PLATFORM | Implementado (verificado por tests) |
| G6 QA | Informe emitido — pendiente firma formal |
| G7 CTO | Pendiente |
