# SPEC — MOD12 Compras · Tributos informativos en Compra de Mostrador — Fase 26

**Versión:** 1.0
**Estado:** Diseño aprobado — contrato congelado para ejecución Track A/B/C
**Fecha:** 2026-09-09
**Módulo:** MOD12 Inventario / SCM — Compras / Ingreso directo (Compra de mostrador)
**Autor:** AI-EM-ARCH (modos Product Architect + Architect + Orchestrator)
**Superficie:** Portal → Compras → Ingreso directo / `CounterPurchasePanel` → `POST /inventory/counter-purchases`
**ADRs:** [ADR-050](../adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md) (Aprobado, intacto + update informativo 2026-09-09) · [ADR-029](../adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md) (Aprobado) · [ADR-053](../adrs/ADR-053-Supplier-Quote-Lines.md) (precedente de snapshot fiscal, solo referencia)
**Precedente directo:** [SPEC Fase 25](../specs/2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos-design.md) — patrón a replicar
**Plan:** Fase 26 (este documento es el contrato; no hay plan separado)

---

## 1. Problema

El flujo "Ingreso directo / Compra de mostrador" (`POST /inventory/counter-purchases`, `CounterPurchasePanel`) registra mercancía ya adquirida con factura en mano, pero no permite capturar los tributos que aparecen en esa factura (IVA, retenciones). El operador no puede dejar trazabilidad del neto estimado a pagar ni conciliar visualmente contra el soporte.

Esto **no** es valorización contable ni documento DIAN (ADR-050 §Consecuencias lo deja fuera de alcance; Fase 25 reafirma la exclusión para cotizaciones). Es captura informativa a nivel cabecera del movimiento, replicando el patrón aprobado de Fase 25.

## 2. Objetivo

1. Permitir declarar, por compra de mostrador, cuáles tributos del catálogo PURCHASE aplican, con tasa editable y cálculo determinista en servidor.
2. Persistir snapshot fiscal por movimiento sin tocar el costing (costo promedio sigue sobre base neta).
3. Mostrar neto estimado a pagar ("Total estimado con tributos") en el panel, con copy que deja claro el carácter informativo.
4. Exponer presets PURCHASE vía `GET /purchasing/tax-presets` para el panel de mostrador (el panel es 100% props-driven; `PurchaseWorkspace` carga los presets al abrir el modo counter-purchase).

## 3. Fuera de alcance (declarado)

- Impuesto por línea de producto.
- Flete / costo de envío en este flujo (no existe `shippingCost` aquí; `shippingCost = 0` fijo en el motor).
- Capitalización de tributos en el costo promedio (`applyReceiptCostingWithManager` no cambia).
- Columnas nuevas en `stock_movements` (el neto NO se persiste en cabecera; se deriva `payableAmount` en respuesta).
- Valorización contable, asientos, DIAN UBL, CUFE, factura electrónica, Billing.
- Perfil fiscal de proveedor, autorretenedor, gran contribuyente, municipio DANE.
- PATCH de movimiento ya registrado.
- Tokens nuevos en `@iwana/ui` o primitive Switch.
- Consumir `ITaxApplicationReadPort` (reglas de **ventas**).

## 4. Decisiones congeladas

### D1. Tributos a nivel cabecera del movimiento (no por línea)

Precedente Fase 25 D3/D4. El cliente envía `taxes?: Array<{ code, applies, rate? }>` a nivel cabecera. Solo se persisten filas con `applies: true`. Sin `taxes` → comportamiento legacy intacto (`taxes: []`, `payableAmount = base`).

### D2. `unitCost` sigue siendo base neta del costing

El costo unitario que captura el operador es **sin impuestos**. `applyReceiptCostingWithManager` recibe los mismos `unitCost`/`quantity` en unidad base que hoy. Los tributos NO capitalizan en el costo promedio. Etiqueta congelada: **"Costo unitario (sin impuestos)"**.

### D3. Servidor es fuente de verdad (réplica Fase 25 D4)

El cliente envía `{ code, applies, rate? }`. El servidor:

1. Resuelve definición activa vía `TaxCatalogReadPort.listByContext(TaxContext.PURCHASE)` (sin entidades TypeORM de Taxation, sin FK física a `tax_definitions`, sin SQL a `tax_definitions`).
2. Calcula `baseAmount` y `taxAmount` reutilizando `computeQuoteTaxes({ amount: base, shippingCost: 0, taxes, catalog })` donde `base = Σ (quantity × unitCost)` de las líneas **en unidad base** (tras `resolveReceiptUomConversion`), en centavos HALF_UP, 2 decimales por fila, después el neto.
3. Ignora cualquier monto tributario que mande el cliente.
4. Persiste snapshot (`taxCode`, `taxCategory`, `effect`, `rate`, `baseAmount`, `taxAmount`, `taxDefinitionId` lógico nullable) en `stock_movement_taxes` dentro de la misma transacción, tras crear el movimiento.
5. `QuoteTaxCalcError` → `BadRequestException` (400). Códigos fuera del catálogo PURCHASE|BOTH, inactivos o duplicados → 400. `rate` fuera de 0–100 → 400.

```
base = Σ (quantity_base × unitCost_base)   // líneas ya convertidas a unidad base
payableAmount = base + Σ(ADD) − Σ(WITHHOLD)  // shippingCost = 0 fijo
```

`RETE_IVA` calcula sobre el monto de IVA; **0 si IVA no aplica** (mismo motor Fase 25, sin cambios en `quote-tax-calc.ts`).

### D4. Idempotencia incluye tributos

`buildDerivedIdempotencyKey` incluye las `taxes` normalizadas en el payload del hash (ordenadas por `code`, con `rate ?? null`). Ingreso idéntico con tributos distintos **no colisiona**. Replay idempotente (por `idempotencyKey` explícita o derivada) devuelve también las `StockMovementTax` del movimiento existente + `payableAmount` derivado.

### D5. Boundary (réplica Fase 25 D6)

`InventoryModule` ya importa `TaxationModule`; `CounterPurchaseService` consume **solo** `TaxCatalogReadPort`. Prohibido: entidad `TaxDefinition`, SQL a `tax_definitions`, `ITaxApplicationReadPort`. Los guardias `inventory-tax-boundary.spec.ts` (backend) e `inventory-tax-boundary.spec.ts` (portal) deben seguir en verde **sin edición**.

Presets para el formulario: nuevo `GET /purchasing/tax-presets` (roles `ADMIN|NOC|SUPPORT`, permiso consistente MOD12). No usar `GET /taxation/definitions` (roles `ADMIN|ACCOUNTANT|SYSTEM_ADMIN`; el comprador no llega). La UI de inventory jamás llama `/taxation/`.

### D6. Sin columnas en `stock_movements`

Snapshot fiscal vive solo en `stock_movement_taxes`. Sin `payable_amount` en el movimiento (diferencia deliberada con Fase 25, donde la cotización sí lo persiste para ordenar comparación). Aquí `payableAmount` es derivado en respuesta.

## 5. Modelo de datos

Migración tenant **`127_add_stock_movement_taxes`** (siguiente tras `126_create_stock_issue_line_serials`), aditiva y reversible, sin backfill.

### Entidad `StockMovementTax` (`packages/database/src/entities/stock-movement-tax.entity.ts`)

Análoga a `supplier-quote-tax.entity.ts`. Campos: `id` UUID PK, `tenantId` UUID NOT NULL, `stockMovementId` UUID NOT NULL (FK CASCADE a `stock_movements`), `taxCode` VARCHAR(32) NOT NULL, `taxCategory` VARCHAR(20) NOT NULL, `effect` VARCHAR(10) NOT NULL, `rate` NUMERIC(7,4) NOT NULL, `baseAmount` NUMERIC(14,2) NOT NULL, `taxAmount` NUMERIC(14,2) NOT NULL, `taxDefinitionId` UUID NULL (lógico, **sin FK física** — boundary Taxation), timestamps `timestamptz`. Exportarla desde el índice de `@iwana/db`. Registrarla en `TypeOrmModule.forFeature` de `InventoryModule`.

### Tabla `stock_movement_taxes`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK DEFAULT `gen_random_uuid()` | |
| `tenant_id` | UUID NOT NULL | |
| `stock_movement_id` | UUID NOT NULL | FK CASCADE a `stock_movements(id)` |
| `tax_code` | VARCHAR(32) NOT NULL | snapshot |
| `tax_category` | VARCHAR(20) NOT NULL | CHECK enum `TaxCategory`: `VAT`, `WITHHOLDING`, `MUNICIPAL`, `STAMP`, `OTHER` |
| `effect` | VARCHAR(10) NOT NULL | CHECK `ADD` \| `WITHHOLD` |
| `rate` | NUMERIC(7,4) NOT NULL | Rete ICA 0,414 no cabe en (14,2) |
| `base_amount` | NUMERIC(14,2) NOT NULL | CHECK ≥ 0 |
| `tax_amount` | NUMERIC(14,2) NOT NULL | CHECK ≥ 0; el signo lo da `effect` |
| `tax_definition_id` | UUID NULL | lógico, **sin FK** |
| timestamps | timestamptz NOT NULL DEFAULT `now()` | |

- `up()` aditivo: `CREATE TABLE` + CHECKs (`tax_category`, `effect`, montos ≥ 0) + `uq_stock_movement_taxes_movement_tax_code (stock_movement_id, tax_code)` + `idx_stock_movement_taxes_tenant_movement (tenant_id, stock_movement_id)`.
- `down()` reversible directo: `DROP INDEX` + `DROP TABLE` (sin backfill que revertir).
- Spec hermana `127_add_stock_movement_taxes.spec.ts` con el patrón de `124_add_supplier_quote_taxes.spec.ts` (up crea tabla/checks/FK cascade/sin FK a `tax_definitions`/unicidad/índice; down ordenado; no importa `@iwana/api`; no `synchronize`).
- Compilar `@iwana/db` (las migraciones corren contra `dist/`).

## 6. Contrato API

### `POST /inventory/counter-purchases` — campos actuales + :

```
taxes?: Array<{
  code: string;      // trim 2–40
  applies: boolean;
  rate?: number;     // coerce 0–100; omitido → snapshot.baseRate
}>
```

- Zod: nuevo `AddCounterPurchaseTaxSchema` (`code` trim 2–40, `applies` boolean, `rate` coerce 0–100 opcional); `CreateCounterPurchaseSchema` se extiende con `taxes` opcional + `superRefine` que rechaza códigos duplicados (patrón `AddSupplierQuoteSchema` líneas ~2180–2190).
- Swagger: `CreateCounterPurchaseDto` (+ `AddCounterPurchaseTaxDto` reutilizando el shape de `AddSupplierQuoteTaxDto`) y `LineDto`; summary del endpoint actualizado ("El servidor calcula tributos informativos…").
- **Respuesta extendida** (creación y replay): `{ movement, lines, taxes: SupplierQuoteTaxApiSnapshot[] (vía `toSupplierQuoteTaxApiSnapshot`), payableAmount: string }`. Sin `taxes` → `taxes: []`, `payableAmount = base.toFixed(2)`.
- OpenAPI: actualizar decoradores Swagger del POST y registrar el GET nuevo (no hay archivo OpenAPI commiteado; los DTOs swagger son la fuente).

### `GET /purchasing/tax-presets`

- Roles `ADMIN|NOC|SUPPORT`, permiso consistente con MOD12 (lectura `INVENTORY_PURCHASING_READ`, mismo que `GET requests/:id`).
- Servido por `PurchasingQueryService` (nuevo método `listTaxPresets()`) reutilizando `mapPurchaseTaxPreset` + `TaxCatalogReadPort.listByContext(TaxContext.PURCHASE)`.
- Shape: `PurchaseTaxPresetRecord[]` = `{ code, name, category, baseRate: number | null, treatment, context }` (idéntico al embebido en GET detail de solicitud).

## 7. UX (Portal)

Paridad visual con cotizaciones, con copy propio de compra de mostrador.

- **Sección** en `CounterPurchasePanel`: **"Tributos de esta compra (según factura)"** con `QuoteTaxFields` parametrizado (`title`/`hint` opcionales; defaults = textos actuales de cotización; cero impacto en `PurchaseRequestWorkbenchDrawer`/`RfqInvitationsPanel`).
  - Estado tipo `QuoteTaxState`, inicializado con **IVA 19 aplicado por defecto** (diferencia deliberada con cotizaciones, donde los 4 arrancan apagados: aquí hay factura en mano y el IVA suele venir liquidado).
  - Hint informativo congelado: *"Informativo: sirve para estimar el pago según la factura. No es un cálculo tributario ni un documento DIAN."*
- **Footer ampliado:** Subtotal (neto) → tributos ADD/WITHHOLD → **"Total estimado con tributos"** usando `computeQuoteTaxPreview` (con `shippingCost: 0`).
- **Label de líneas:** "Costo unitario (sin impuestos)".
- **Payload:** `taxes` vía `buildQuoteTaxesPayload`.
- **Presets:** `PurchaseWorkspace` los carga (`purchasingApi.getTaxPresets()`) al abrir el modo counter-purchase y los pasa por props a `CounterPurchasePanel` (100% props-driven); fallback a defaults locales (`resolveQuoteTaxDefaultRate`) si el GET falla o aún carga.
- **Vocabulario visible:** IVA, Retención en la fuente, Rete ICA, Rete IVA, Subtotal (neto), Total estimado con tributos, Costo unitario (sin impuestos). Prohibido en UI/tests/E2E: `IVA_19`, `TAX`, `WITHHOLDING`, `payableAmount`, `tax-presets` como texto visible.

## 8. Criterios de aceptación

| CA | Descripción |
| --- | --- |
| CA-26-01 | Sin `taxes`: respuesta y persistencia retrocompatibles (`taxes: []`, neto = base, costing intacto) |
| CA-26-02 | Con IVA 19 sobre base 100.00 → `taxAmount 19.00`; `payableAmount = base + 19.00`; snapshot persistido con `effect ADD` |
| CA-26-03 | RETE_IVA calcula sobre el monto de IVA; 0 si IVA no aplica |
| CA-26-04 | Código duplicado → 400 |
| CA-26-05 | Código fuera del catálogo PURCHASE\|BOTH o inactivo → 400 |
| CA-26-06 | `rate` fuera de 0–100 → 400 (Zod + motor) |
| CA-26-07 | Replay idempotente devuelve `taxes` + `payableAmount` del movimiento existente |
| CA-26-08 | Ingresos idénticos con tributos distintos no colisionan (hash incluye taxes) |
| CA-26-09 | Costing: `applyReceiptCostingWithManager` recibe base neta (sin tributos capitalizados) |
| CA-26-10 | `GET /purchasing/tax-presets` exige roles ADMIN\|NOC\|SUPPORT; shape `PurchaseTaxPresetRecord[]` |
| CA-26-11 | Panel muestra sección "Tributos de esta compra (según factura)", preview de totales, error de tasa, label "Costo unitario (sin impuestos)"; payload incluye `taxes` |
| CA-26-12 | Guardias boundary backend y portal en verde sin edición; UI jamás llama `/taxation/` |
| CA-26-13 | Migración 127 reversible (up/down); OpenAPI vía DTOs; sin PII; RBAC intacto |

## 9. Impacto

| Eje | Impacto |
| --- | --- |
| Tenant | Schema tenant; aislamiento por `tenant_id`; `SET LOCAL search_path` intacto |
| Seguridad | Mismos roles/permisos; snapshot fiscal no es PII; logs sin montos en texto libre innecesario |
| Escala | 0–4 filas por movimiento; índice por tenant+movimiento |
| Regulación | Captura informativa según factura. Tasas **requieren verificación con fuente oficial**. No es DIAN UBL ni factura electrónica |
| ADR nuevo | **No.** Extensión informativa de ADR-050 (update 2026-09-09); ADR-050 queda intacto en su exclusión de valorización contable/DIAN |

## 10. Protocolo

- G4: este spec (productor: AI-EM-ARCH; no autofirma — GO del responsable de producto).
- G5: Track A (DB+API) ∥ Track B (portal) contra este contrato congelado; Track C (docs) al cierre.
- G6/G7: pendientes al cierre (mismo estado que Fase 25; no se autofirma G7 del CTO).
- Carril UI: tokens existentes; DS-OWNER no interviene salvo regresión visual.
