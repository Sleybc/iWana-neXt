# INFORME — MOD12 Compras · Tributos informativos en Compra de Mostrador — Fase 26

**Versión:** 1.0
**Estado:** Implementado — pendiente G6 formal / G7 CTO
**Fecha:** 2026-09-09
**Módulo:** MOD12 Inventario / SCM — Compras / Ingreso directo (Compra de mostrador)
**Ejecutores:** Track A AI-SR-FULL (+ AI-DATA-ENG consulta) · Track B AI-FE-PLATFORM · Consolidación AI-EM-ARCH (ejecutor)
**Orquestador:** Protocolo multiagente (subagent-driven-development: Track A ∥ Track B contra contrato congelado, Track C al cierre)
**Spec:** [2026-09-09-mod12-compras-mostrador-impuestos-design.md](../specs/2026-09-09-mod12-compras-mostrador-impuestos-design.md)
**Precedente:** [SPEC Fase 25](../specs/2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos-design.md)
**ADR:** Update 2026-09-09 en [ADR-050](../adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md) (intacto en su exclusión de valorización contable/DIAN) · consumo [ADR-029](../adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md) D4

## Contexto

El ingreso directo por compra de mostrador (`POST /inventory/counter-purchases`, `CounterPurchasePanel`) no permitía capturar los tributos de la factura en mano. Esta fase agrega captura informativa a nivel cabecera del movimiento replicando el patrón Fase 25, sin tocar costing, sin columnas en `stock_movements` y sin afirmar cumplimiento DIAN.

## Cambios verificados (sin reimplementar)

### Datos (Track A)
- Entidad `StockMovementTax` (`stock_movement_taxes`), análoga a `SupplierQuoteTax`; exportada en `@iwana/db` y registrada en `TypeOrmModule.forFeature` de `InventoryModule`.
- Migración tenant `127_add_stock_movement_taxes`: `CREATE TABLE` + CHECKs (`tax_category`, `effect`, montos ≥ 0) + FK CASCADE a `stock_movements` + `uq_stock_movement_taxes_movement_tax_code` + `idx_stock_movement_taxes_tenant_movement`. `down()` reversible directo (índices + tabla). Sin backfill, sin seed, sin FK a `tax_definitions`.

### Backend (Track A)
- `AddCounterPurchaseTaxSchema` + `CreateCounterPurchaseSchema` extendido con `taxes` opcional + `superRefine` duplicados; Swagger (`AddCounterPurchaseTaxDto`, summary del POST actualizado).
- `CounterPurchaseService`: inyecta `TaxCatalogReadPort`; base = Σ (`quantity` × `unitCost`) en unidad base en centavos HALF_UP; `computeQuoteTaxes({ amount: base, shippingCost: 0, taxes, catalog })`; `QuoteTaxCalcError` → 400; snapshot persistido en la misma transacción; costing intacto sobre base neta; `buildDerivedIdempotencyKey` incluye taxes normalizadas; replay devuelve taxes + `payableAmount`; respuesta `{ movement, lines, taxes, payableAmount }`.
- `GET /purchasing/tax-presets` (ADMIN|NOC|SUPPORT, `INVENTORY_PURCHASING_READ`) servido por `PurchasingQueryService.listTaxPresets()` reutilizando `mapPurchaseTaxPreset`.

### Frontend (Track B)
- `api-client.ts`: `CreateCounterPurchaseDto.taxes`, `CounterPurchaseTaxSnapshot` + `StockMovementResultRecord` con `taxes?`/`payableAmount?` (tolerancia legacy), `purchasingApi.getTaxPresets()`.
- `QuoteTaxFields` con `title`/`hint` opcionales (defaults Fase 25 intactos).
- `CounterPurchasePanel`: sección "Tributos de esta compra (según factura)" con hint informativo; estado `QuoteTaxState` con IVA 19 aplicado por defecto; footer Subtotal (neto) → tributos → "Total estimado con tributos" (`computeQuoteTaxPreview` con `shippingCost: 0`); label "Costo unitario (sin impuestos)" (`CounterPurchaseLinesTable`); payload vía `buildQuoteTaxesPayload`; bloqueo con tasa inválida.
- `PurchaseWorkspace` carga presets al abrir modo counter-purchase y los pasa por props (panel 100% props-driven; fallback a defaults locales).

## Criterios de aceptación

| CA | Estado | Evidencia |
| --- | --- | --- |
| CA-26-01 retrocompatible sin taxes | **GO** | `counter-purchase.service.spec.ts` → bloque Fase 26 (caso sin taxes: `taxes: []`, neto = base) |
| CA-26-02 IVA 19 → 19.00 + snapshot ADD | **GO** | `counter-purchase.service.spec.ts` → IVA 19 sobre base 100 (persistencia verificada) |
| CA-26-03 RETE_IVA sobre IVA; 0 sin IVA | **GO** | `counter-purchase.service.spec.ts` → RETE_IVA 15% del IVA (2.85); sin IVA → 0 |
| CA-26-04 duplicado → 400 | **GO** | service spec → validación Zod duplicados |
| CA-26-05 catálogo inactivo/fuera de contexto → 400 | **GO** | service spec → BadRequest catálogo |
| CA-26-06 rate 0–100 | **GO** | service spec → rate 101 error; panel bloquea tasa 200 (`CounterPurchasePanel.spec.tsx`) |
| CA-26-07 replay devuelve taxes | **GO** | service spec → replay con taxes |
| CA-26-08 hash incluye taxes | **GO** | service spec → no-colisión con tributos distintos |
| CA-26-09 costing sobre base neta | **GO** | service spec + `counter-purchase-uom-conversion.spec.ts` (costing recibe base neta) |
| CA-26-10 GET tax-presets RBAC + shape | **GO** | `counter-purchase.http.integration.spec.ts` → RBAC presets + shape `PurchaseTaxPresetRecord[]` |
| CA-26-11 panel sección/payload/preview/label | **GO** | `CounterPurchasePanel.spec.tsx` → 6 casos nuevos (sección, IVA por defecto, payload, preset, preview 120000→142800, bloqueo tasa, label sin impuestos) |
| CA-26-12 guardias boundary verdes sin edición | **GO** | `inventory-tax-boundary.spec.ts` API + portal en verde, sin editar |
| CA-26-13 migración 127 reversible; OpenAPI; sin PII; RBAC | **GO** | `127_add_stock_movement_taxes.spec.ts` 4/4; DTOs swagger fuente; sin PII |

## Verificación de comandos (consolidación centralizada, 2026-09-09)

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | **0 errores** (api 7 warnings + portal 46 warnings, todos preexistentes; ninguno en archivos de los tracks) |
| `pnpm typecheck` | **8/8 successful** |
| `pnpm --filter @iwana/api exec jest` (counter-purchase.service + http.integration + boundary + quote-tax-calc) | **38/38 pass** (4 suites) |
| `pnpm --filter @iwana/db exec jest 127_add_stock_movement_taxes.spec.ts` | **4/4 pass** |
| `pnpm --filter @iwana/db build` | **OK** (tsc limpio; migraciones corren contra `dist/`) |
| `pnpm --filter @iwana/portal exec jest CounterPurchasePanel.spec + boundary` | **10/10 pass** (panel 10 incl. 4 preexistentes + 6 nuevos; suite boundary incluida en corrida Track B: 11 tests en 2 suites) |

No se ejecutó E2E Playwright (mismo estado que Fase 25; sin fixture estable para este flujo).

## Deuda / concerns

1. **Tasas del catálogo (IVA 19, retefuente, Rete ICA, Rete IVA 15 % placeholder).** Requieren verificación con fuente oficial. Esta fase no afirma cumplimiento DIAN.
2. **Migración 127:** verificada por spec de SQL (`up`/`down`), no aplicada en esta sesión contra un tenant real.
3. **Working copy con líneas ajenas en curso:** el repo trae modificaciones de otras líneas (auth, drawer, capas) no relacionadas; el diff de Fase 26 está acotado a ~12 backend/DB + 6 portal + spec/ADR/informe.

## Tests añadidos (solo cobertura de CA; sin lógica de producto)

- `counter-purchase.service.spec.ts` — bloque Fase 26 (11 casos).
- `counter-purchase.http.integration.spec.ts` — payload con taxes + RBAC presets.
- `127_add_stock_movement_taxes.spec.ts` — patrón spec 124.
- `CounterPurchasePanel.spec.tsx` — 6 casos Fase 26.
- `counter-purchase-uom-conversion.spec.ts` — extensión mínima (6.º arg mock de catálogo).

## Stop/go G6

**Recomendación: GO de G6 con concerns** (no BLOCKED).

Los 13 CA tienen test que pasa. Boundary Inventory→Taxation (backend y portal), costing sin capitalización y vocabulario visible están verdes. Concerns (fuente oficial de tasas, E2E browser, migración no aplicada aquí) no son criterio de stop.

G6 formal y G7 CTO permanecen pendientes (mismo estado que Fase 25; no se autofirma G7 del CTO). No commit en esta sesión.

## Protocolo

| Gate | Estado |
| --- | --- |
| G4 spec | Cumplido (`2026-09-09-mod12-compras-mostrador-impuestos-design.md` congelado primero) |
| G5 Track A (DB+API) ∥ Track B (portal) | Implementado (verificado por tests) |
| G5 consolidación | Lint + typecheck + suites objetivo en verde (esta sesión) |
| G6 QA | Informe emitido — pendiente firma formal |
| G7 CTO | Pendiente |
