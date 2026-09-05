# Cotización de compra: decimales e impuestos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Ejecutores: AI-DATA-ENG → AI-SR-FULL ∥ AI-FE-PLATFORM → AI-SR-QA. AI-EM-ARCH no implementa código.

**Goal:** En `/dashboard/inventory?tab=purchasing` → Registrar cotización, mostrar centavos en totales y capturar IVA / retención en la fuente / Rete ICA / Rete IVA (opcionales) para comparar por neto a pagar.

**Architecture:** Purchasing es dueño del snapshot fiscal de la oferta (`supplier_quote_taxes` + `payable_amount`). Taxation solo se lee por `TaxCatalogReadPort`. El servidor calcula en centavos HALF_UP. La política de aprobación no cambia (`amount + shippingCost`).

**Tech Stack:** NestJS + TypeORM + PostgreSQL schema tenant + Zod + Next.js portal + Jest. Sin librería decimal nueva.

**Spec congelada:** [docs/specs/2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos-design.md](../specs/2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos-design.md)

**Prompt G4:** [docs/prompts/PROMPT-MOD12-COMPRAS-COTIZACION-IMPUESTOS-FASE-25-v1.0.md](../prompts/PROMPT-MOD12-COMPRAS-COTIZACION-IMPUESTOS-FASE-25-v1.0.md)

---

## File map

| Archivo | Responsable | Rol |
| --- | --- | --- |
| `packages/database/src/migrations/tenant/124_add_supplier_quote_taxes.ts` | DATA-ENG | DDL + backfill + seed `RETE_IVA` |
| `packages/database/src/entities/supplier-quote.entity.ts` | DATA-ENG | `payableAmount` |
| `packages/database/src/entities/supplier-quote-tax.entity.ts` | DATA-ENG | Nueva entidad |
| `packages/shared/src/taxation/tax-colombia-presets.ts` | SR-FULL | Preset `RETE_IVA` |
| `packages/shared/src/enums/inventory/` (nuevo `tax-quote-effect.enum.ts`) | SR-FULL | `ADD` \| `WITHHOLD` |
| `apps/api/src/modules/inventory/dto/index.ts` | SR-FULL | Zod taxes |
| `apps/api/src/modules/inventory/utils/quote-tax-calc.ts` | SR-FULL | Motor de montos (puro, testeable) |
| `apps/api/src/modules/inventory/services/purchasing.service.ts` | SR-FULL | Persistencia + cálculo |
| `apps/api/src/modules/inventory/services/purchasing-query.service.ts` | SR-FULL | `payableAmount`, `taxes`, `purchaseTaxPresets` |
| `apps/api/src/modules/inventory/inventory.module.ts` | SR-FULL | Import `TaxationModule` |
| `apps/api/openapi/` purchasing | SR-FULL | Contrato |
| `apps/portal/src/components/inventory/inventory-labels.ts` | FE-PLATFORM | `formatInventoryMoney` |
| `apps/portal/src/components/inventory/QuoteTaxFields.tsx` | FE-PLATFORM | Interruptores + tasas |
| `apps/portal/src/components/inventory/quote-tax-calc.ts` | FE-PLATFORM | Preview UI (misma fórmula; servidor manda) |
| `apps/portal/src/components/inventory/SupplierQuoteLinesEditor.tsx` | FE-PLATFORM | Decimales + helper sin IVA |
| `apps/portal/src/components/inventory/RfqInvitationsPanel.tsx` | FE-PLATFORM | Wire RFQ |
| `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx` | FE-PLATFORM | Wire Nueva cotización |
| `apps/portal/src/components/inventory/QuoteComparisonPanel.tsx` | FE-PLATFORM | Neto a pagar |
| `apps/portal/src/lib/api-client.ts` | FE-PLATFORM | Tipos + payload |
| Tests Jest API + portal | SR-FULL / FE-PLATFORM / SR-QA | Ver spec §8 |

---

### Task 1: Migración y entidades (AI-DATA-ENG)

**Files:**
- Create: `packages/database/src/migrations/tenant/124_add_supplier_quote_taxes.ts`
- Create: `packages/database/src/migrations/tenant/124_add_supplier_quote_taxes.spec.ts` (si el repo exige spec de migración, copiar patrón de `123_*.spec.ts`)
- Create: `packages/database/src/entities/supplier-quote-tax.entity.ts`
- Modify: `packages/database/src/entities/supplier-quote.entity.ts`
- Modify: barrel de entidades de `@iwana/db` si aplica
- Modify: `packages/database/src/migrations/tenant/migration-order.spec.ts` si lista números

- [ ] **Step 1:** Escribir `up` aditivo:
  - `ALTER TABLE supplier_quotes ADD COLUMN payable_amount NUMERIC(14,2)`
  - `UPDATE ... SET payable_amount = amount + COALESCE(shipping_cost, 0)`
  - `SET NOT NULL` + `CHECK (payable_amount >= 0)`
  - índice `(tenant_id, purchase_request_id, payable_amount)`
  - `CREATE TABLE supplier_quote_taxes` según spec §5 (`rate NUMERIC(7,4)`, UNIQUE quote+code, FK CASCADE, **sin FK** a `tax_definitions`)
  - INSERT idempotente `RETE_IVA` en `tax_definitions` (`origin=SYSTEM`, `context=PURCHASE`, `category=WITHHOLDING`, `base_rate=15`)
- [ ] **Step 2:** Escribir `down` simétrico: borrar preset `RETE_IVA` SYSTEM, DROP TABLE, DROP INDEX, DROP COLUMN.
- [ ] **Step 3:** Entidad TypeORM alineada a columnas (valores monetarios como `string`). Relación OneToMany opcional desde `SupplierQuote`.
- [ ] **Step 4:** Compilar `@iwana/db`. No correr migraciones contra prod. Tests de orden/parity del paquete.
- [ ] **Step 5:** Entregar DDL listo. No tocar servicios.

**Stop:** FK física a `tax_definitions`, columnas fijas `iva_amount` en cabecera, `synchronize: true`.

---

### Task 2: Contrato shared + motor de cálculo (AI-SR-FULL)

**Files:**
- Create: `packages/shared/src/enums/inventory/tax-quote-effect.enum.ts`
- Modify: `packages/shared/src/taxation/tax-colombia-presets.ts`
- Create: `apps/api/src/modules/inventory/utils/quote-tax-calc.ts`
- Create: `apps/api/src/modules/inventory/utils/quote-tax-calc.spec.ts`

- [ ] **Step 1:** Enum `TaxQuoteEffect { ADD = 'ADD', WITHHOLD = 'WITHHOLD' }` exportado por `@iwana/shared`.
- [ ] **Step 2:** Preset `RETE_IVA` idéntico al seed de 124. Notes: requiere verificación con fuente oficial.
- [ ] **Step 3:** Función pura `computeQuoteTaxes`:
  - Input: `{ amount, shippingCost, taxes: [{ code, applies, rate }], catalog: TaxDefinitionSnapshot[] }`
  - Códigos conocidos v1 y efecto fijo: `IVA_*` → ADD sobre `amount`; `RETE_FUENTE_SERVICIOS` → WITHHOLD sobre `amount`; `RETE_ICA` → WITHHOLD sobre `amount`; `RETE_IVA` → WITHHOLD sobre `taxAmount` de IVA (0 si no hay IVA ADD > 0).
  - Redondeo: `roundHalfUpToCents(n)` = `Math.round((n + Number.EPSILON) * 100) / 100` **no** es suficiente. Usar centavos enteros: `Math.round(n * 100)` con HALF_UP sobre el tercer decimal (documentar helper; tests CA-25-04).
  - Output: `{ lines, payableAmount }` con `payableAmount = amount + shippingCost + sum(ADD) - sum(WITHHOLD)`.
- [ ] **Step 4:** Tests unitarios CA-25-04, CA-25-05, CA-25-06, applies=false, shipping no grava, amount 0, rate 0, Rete ICA 0.414 → 0.41 sobre 100.
- [ ] **Step 5:** No persistir aún.

**Stop:** Importar entidad `TaxDefinition`. Usar `ITaxApplicationReadPort`.

---

### Task 3: API purchasing (AI-SR-FULL)

**Files:**
- Modify: `apps/api/src/modules/inventory/dto/index.ts` (`AddSupplierQuoteSchema`)
- Modify: `apps/api/src/modules/inventory/services/purchasing.service.ts`
- Modify: `apps/api/src/modules/inventory/services/purchasing-query.service.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts` (import `TaxationModule`)
- Modify: `apps/api/src/modules/inventory/purchasing.controller.ts` / OpenAPI
- Modify: specs HTTP/service existentes de quotes + nuevos `*.spec.ts`

- [ ] **Step 1:** Tests que fallen: POST con `taxes` IVA 19 % persiste `payableAmount`; POST con montos cliente distintos a la fórmula los ignora; 400 code duplicado / inactivo / SALES-only; 409 segunda cotización misma invitación; `evaluateApproval` no sube de nivel por IVA.
- [ ] **Step 2:** Zod:

```
taxes: z.array(z.object({
  code: z.string().min(2).max(40),
  applies: z.boolean(),
  rate: z.coerce.number().min(0).max(100).optional(),
})).optional()
```

- [ ] **Step 3:** `addSupplierQuote`: resolver catálogo `listByContext(PURCHASE)`; calcular; persistir hijas solo `applies=true`; escribir `payableAmount`. `amount` y `shippingCost` semántica intacta.
- [ ] **Step 4:** GET detail: `quotes[].payableAmount`, `quotes[].taxes`, `purchaseTaxPresets`. Legacy sin hijas → taxes `[]`, payable = amount + shipping.
- [ ] **Step 5:** **No** cambiar `estimatedAmount` (sigue `amount + shippingCost`).
- [ ] **Step 6:** OpenAPI + tests verdes del filtro `@iwana/api`.

**Contrato de API congelado:** spec §6. FE-PLATFORM mockea estos tipos; no inventa campos paralelos.

---

### Task 4: UI registro y comparación (AI-FE-PLATFORM)

**Files:** listados en el file map. Tokens existentes. Sin Switch nuevo.

- [ ] **Step 1:** `formatInventoryMoney` con `minimumFractionDigits: 2, maximumFractionDigits: 2`. Tests en `inventory-cost-labels.spec.ts` o nuevo spec. **No** alterar `formatInventoryCurrency` (0 decimales) fuera de cotizar.
- [ ] **Step 2:** `SupplierQuoteLinesEditor`: subtotal y total con `formatInventoryMoney`; helper «sin IVA» junto a Costo unitario.
- [ ] **Step 3:** `QuoteTaxFields`: cuatro checkboxes apagados; tasa `Input type=number step=0.001` solo si on; labels canónicos; copy de no-factura. Defaults desde `purchaseTaxPresets`.
- [ ] **Step 4:** Preview local con la **misma** tabla de efectos del spec (no una fórmula distinta). Guardar deshabilitado si tasa on e inválida.
- [ ] **Step 5:** Wire `RfqInvitationsPanel.handleRegisterInvitationQuote` y `PurchaseRequestWorkbenchDrawer` → payload `taxes: [{ code, applies, rate }]`.
- [ ] **Step 6:** `QuoteComparisonPanel`: orden y hero por `payableAmount`; desglose Base / tributos activos / Envío; sin códigos internos.
- [ ] **Step 7:** Tipos en `api-client.ts`. Tests de panel RFQ, editor, comparación, drawer.

**Stop:** llamar HTTP de Taxation; mostrar `WITHHOLDING`; cambiar umbral de aprobación en `ApprovalDecisionPanel` a neto.

---

### Task 5: QA (AI-SR-QA)

- [ ] Mapear CA-25-01..14 a tests existentes o nuevos.
- [ ] Verificar: inventario no importa entidades Taxation; migración down; OpenAPI; vocabulario en specs de portal.
- [ ] Informe de fase: `docs/informes/INFORME-MOD12-COMPRAS-COTIZACION-IMPUESTOS-FASE-25-v1.0.md`.
- [ ] No E2E Playwright obligatorio si no hay fixture de RFQ estable; preferir HTTP + component tests. Si hay E2E de purchasing, actualizar aserciones de «Total con envío» → «Neto a pagar».

---

## Orden

```
Task 1 (DATA-ENG)
    → Task 2 (SR-FULL calc)  } pueden solaparse el enum/preset
    → Task 3 (SR-FULL API)   } contrato congelado
    → Task 4 (FE-PLATFORM)   } paralelo a Task 3 desde que el DTO esté en spec (ya lo está)
    → Task 5 (SR-QA)
```

Task 4 puede arrancar contra el contrato de la spec (mocks) **sin esperar** migración aplicada en local, pero no mergea sin Task 1+3 verdes.

## Self-review

| Requisito spec | Task |
| --- | --- |
| Decimales display | 4 |
| 4 tributos + fórmulas | 2, 3, 4 |
| Hija + payable | 1, 3 |
| Preset RETE_IVA | 1, 2 |
| Puerto Taxation | 3 |
| Aprobación intacta | 3, 4, 5 |
| Vocabulario | 4, 5 |
| OpenAPI + migración reversible | 1, 3, 5 |
