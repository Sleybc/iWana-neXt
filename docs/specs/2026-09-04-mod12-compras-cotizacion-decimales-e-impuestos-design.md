# SPEC — MOD12 Compras · Decimales e impuestos en registro de cotización — Fase 25

**Versión:** 1.0
**Estado:** Diseño aprobado — G5 en ejecución (GO de producto 2026-09-04)
**Fecha:** 2026-09-04
**Módulo:** MOD12 Inventario / SCM — Compras / RFQ
**Autor:** AI-EM-ARCH (modos Product Architect + Architect + Orchestrator)
**Superficie:** `/dashboard/inventory?tab=purchasing` → Trabajar solicitud → Registrar cotización
**ADRs:** [ADR-053](../adrs/ADR-053-Supplier-Quote-Lines.md) (addendum) · [ADR-029](../adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md) (Aprobado) · [ADR-082](../adrs/ADR-082-Reglas-Federadas-Taxation-Settings.md) (propuesto), no se ejecuta
**Prompt:** [PROMPT Fase 25](../prompts/PROMPT-MOD12-COMPRAS-COTIZACION-IMPUESTOS-FASE-25-v1.0.md)
**Plan:** [plan](../plans/2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos.md)

---

## 1. Problema

Al registrar la cotización de un proveedor invitado (`RfqInvitationsPanel`) o en «Nueva cotización»:

1. El **costo unitario** acepta centavos (`step="0.01"`) y se persiste en `NUMERIC(14,2)`, pero el **subtotal** y el **total** se muestran como enteros (`formatInventoryCurrency` → `maximumFractionDigits: 0`).
2. No hay desglose de **IVA**, **retención en la fuente**, **Rete ICA** ni **Rete IVA**. El operador no puede comparar el **neto a pagar**. No todos aplican siempre.

Esto **no** es valorización contable ni documento DIAN (sigue fuera de alcance de [PRD-MOD12-COMPRAS-CIERRE-FLUJO](../prds/PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md) §2). Es captura operativa para comparar y estimar el pago.

## 2. Objetivo

1. Mostrar **dos decimales** en subtotales, base, envío, tributos y neto de esta superficie de cotización.
2. Permitir declarar, por cotización, cuáles de los cuatro tributos aplican, con tasa editable y cálculo determinista en servidor.
3. Comparar cotizaciones por **neto a pagar**.

## 3. Fuera de alcance

- Perfil fiscal de proveedor (`SupplierTaxProfile`), autorretenedor, gran contribuyente, municipio DANE.
- Tarifa IVA / UNSPSC / tipo fiscal en `inventory_items`.
- PATCH de cotización ya registrada (sigue unique por invitación).
- Gravamen del flete; impuesto por línea de producto.
- Cambiar `estimatedAmount` / umbrales de aprobación.
- Factura electrónica DIAN / asiento contable / Billing.
- Tokens nuevos en `@iwana/ui` o primitive Switch.
- Consumir `ITaxApplicationReadPort` (reglas de **ventas**).

## 4. Decisiones congeladas

### D1. Decimales (display, no schema)

El schema ya es `NUMERIC(*,2)`. El defecto es de formato.

- Nueva función `formatInventoryMoney` (2 decimales, `es-CO`, COP) **solo** en superficies de cotización: editor de líneas, resumen, envío, comparación, invitaciones RFQ, awards que muestren `unitCost`/`lineAmount` de oferta.
- `formatInventoryCurrency` (0 decimales) **no cambia** en dashboard / catálogo / existencias. COP entero sigue siendo el default operativo fuera de cotizar.

### D2. Precio unitario = base gravable (sin IVA)

El costo unitario que captura el operador es **sin IVA**. `amount` de la cabecera permanece = Σ `(quantity × unitCost)` (ADR-053). El envío **no** entra en ninguna base tributaria en esta fase.

### D3. Cuatro tributos opcionales, apagados por defecto

| Tributo visible | Código catálogo | Categoría | Efecto | Base de cálculo |
| --- | --- | --- | --- | --- |
| IVA | `IVA_19` (default; el operador puede otra tasa) | `VAT` | `ADD` | `amount` |
| Retención en la fuente | `RETE_FUENTE_SERVICIOS` | `WITHHOLDING` | `WITHHOLD` | `amount` |
| Rete ICA | `RETE_ICA` | `MUNICIPAL` | `WITHHOLD` | `amount` |
| Rete IVA | `RETE_IVA` (preset nuevo, placeholder) | `WITHHOLDING` | `WITHHOLD` | monto de IVA; **0 si IVA no aplica** |

El **efecto** (`ADD` \| `WITHHOLD`) es explícito en la fila persistida. No se infiere de la categoría (Rete ICA es municipal y aun así resta).

Tasas: default del catálogo (`TaxCatalogReadPort.listByContext(PURCHASE)`), override del operador. Rango 0–100 inclusive. `IVA_EXCLUIDO` (`baseRate` null) exige `rate` si se activa.

**Regulación:** las tasas sembradas (IVA 19 %, retefuente 4 %, Rete ICA Bogotá 0,414 %, Rete IVA 15 %) **requieren verificación con fuente oficial**. Esta fase no afirma cumplimiento DIAN.

### D4. Servidor es fuente de verdad

El cliente envía `{ code, applies, rate? }`. El servidor:

1. Resuelve el preset/definición activa vía `TaxCatalogReadPort` (sin entidades TypeORM de Taxation, sin FK física a `tax_definitions`).
2. Calcula `baseAmount` y `taxAmount` en **centavos enteros**, HALF_UP, 2 decimales **por fila**, después el neto.
3. Ignora cualquier monto tributario que mande el cliente.
4. Persiste snapshot (`code`, `name`, `category`, `rate`, `effect`, `baseAmount`, `taxAmount`, `taxDefinitionId` lógico nullable).

```
shippingInPayable = (shippingArrangement === ON_INVOICE) ? shippingCost : 0
payableAmount = amount + shippingInPayable + Σ(ADD) − Σ(WITHHOLD)
```

Tres condiciones de envío (`shippingArrangement`):

- **Es gratis** (`FREE`): `shippingCost = 0`; no entra al neto.
- **Lo cobra el proveedor** (`ON_INVOICE`, default): el flete entra al neto; no entra en bases de IVA ni retenciones.
- **Lo paga al transportador** (`PAY_CARRIER`): se persiste el monto para comparar; **no** entra al neto de este proveedor.

Un monto de envío vacío se toma como **cero** (válido). No bloquea el neto ni Guardar.

Cotizaciones legacy (sin filas fiscales): si el flete va en la cotización, `payableAmount = amount + shippingCost`; si es gratis o se paga al transportador, `payableAmount = amount`.

Comparar ofertas usa el **costo total de la oferta** = neto al proveedor + flete al transportador (si aplica).

### D5. Política de aprobación no cambia

`estimatedAmount` sigue siendo Σ `(amount + shippingCost)` ([ADR-053](../adrs/ADR-053-Supplier-Quote-Lines.md) D2, Fase 19). El IVA no debe empujar umbrales 500 k / 5 M en silencio.

La UI de **comparar / registrar** usa Neto a pagar. La UI de **aprobar** no relabela el estimado como neto.

### D6. Boundary

`InventoryModule` importa `TaxationModule` y consume **solo** `TaxCatalogReadPort`. Prohibido: entidad `TaxDefinition`, SQL a `tax_definitions`, `ITaxApplicationReadPort`.

Presets para el formulario: embeber `purchaseTaxPresets` en el GET del detalle de solicitud / RFQ. No usar `GET /taxation/definitions` (roles `ADMIN|ACCOUNTANT|SYSTEM_ADMIN`; el comprador no llega).

### D7. Preset `RETE_IVA`

Alta en `TAX_COLOMBIA_PRESETS` + INSERT idempotente en migración `124` para tenants ya provisionados:

- `code=RETE_IVA`, `category=WITHHOLDING`, `context=PURCHASE`, `origin=SYSTEM`, `baseRate=15`, `treatment=STANDARD`
- `notes`: placeholder 15 %; requiere verificación con fuente oficial

## 5. Modelo de datos

Migración tenant **`124`** (siguiente a `123`), aditiva y reversible.

### `supplier_quotes.payable_amount NUMERIC(14,2) NOT NULL`

Backfill: `amount + shipping_cost`. Índice `(tenant_id, purchase_request_id, payable_amount)`. `CHECK (payable_amount >= 0)`. Escrito en la misma transacción que las hijas. Sin trigger.

### Tabla `supplier_quote_taxes`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL | |
| `supplier_quote_id` | UUID NOT NULL | FK CASCADE |
| `tax_code` | VARCHAR(32) NOT NULL | snapshot |
| `tax_category` | VARCHAR(20) NOT NULL | CHECK del enum `TaxCategory` |
| `effect` | VARCHAR(10) NOT NULL | `ADD` \| `WITHHOLD` |
| `rate` | NUMERIC(7,4) NOT NULL | Rete ICA 0,414 no cabe en (14,2) |
| `base_amount` | NUMERIC(14,2) NOT NULL | ≥ 0 |
| `tax_amount` | NUMERIC(14,2) NOT NULL | ≥ 0; el signo lo da `effect` |
| `tax_definition_id` | UUID NULL | lógico, **sin FK** |
| timestamps | timestamptz | |

UNIQUE `(supplier_quote_id, tax_code)`. INDEX `(tenant_id, supplier_quote_id)`.

## 6. Contrato API

`POST /purchasing/requests/:id/quotes` — campos actuales + :

```
taxes?: Array<{
  code: string;      // 2–40
  applies: boolean;
  rate?: number;     // 0–100; omitido → snapshot.baseRate
}>
```

Solo se persisten filas con `applies: true`. Códigos fuera del catálogo PURCHASE|BOTH, inactivos o duplicados → 400.

**Respuesta** (POST y quotes del GET detail): campos actuales + `payableAmount: string` + `taxes: Array<{ code, name, category, effect, applies, rate, baseAmount, taxAmount }>`.

GET detail añade `purchaseTaxPresets: Array<{ code, name, category, baseRate, treatment, context }>`.

OpenAPI de purchasing actualizado.

## 7. UX

Paridad en formulario RFQ inline y «Nueva cotización».

**Entrada:** unitario (helper «sin IVA»), cómo se cubre el envío (tres opciones), cuatro interruptores apagados, tasa visible solo al encender.

**Layout:** en viewport amplio, envío + tributos a la izquierda y resumen sticky a la derecha (`QuoteEconomicsFields`). Tributos en grilla 2×2.

**Solo lectura:** subtotales, Base, montos de tributos activos, Envío, **Neto a pagar** (cifra hero; visible aunque el envío esté en blanco). Si el flete se paga al transportador, también **Total de la oferta**.

**Vocabulario visible:** IVA, Retención en la fuente, Rete ICA, Rete IVA, Base, Envío, Neto a pagar, Costo unitario, Es gratis, Lo cobra el proveedor, Lo paga al transportador. Prohibido en UI/tests/E2E: `IVA_19`, `TAX`, `WITHHOLDING`, `payableAmount`, `ON_INVOICE`, `PAY_CARRIER`.

Copy: *Estos valores sirven para comparar ofertas y estimar el pago. No son una factura electrónica.* Segundo helper: *Indica qué aplica en esta cotización. No se guarda como perfil del proveedor.*

Comparación: orden ascendente por neto; hero = Neto a pagar; desglose Base / tributos activos / Envío.

## 8. Criterios de aceptación

| CA | Descripción |
| --- | --- |
| CA-25-01 | Subtotal de línea y totales de cotización muestran 2 decimales en registro y comparación |
| CA-25-02 | Unitario se etiqueta como sin IVA |
| CA-25-03 | Los 4 tributos arrancan apagados; encender revela tasa con default de catálogo |
| CA-25-04 | IVA 19 % sobre `100.00` → `19.00`; ReteFte 4 % → `4.00`; Rete ICA 0,414 % → `0.41`; Rete IVA 15 % de IVA → `2.85`; neto = `100 + envío + 19 − 4 − 0.41 − 2.85` |
| CA-25-05 | Rete IVA = 0 si IVA no aplica |
| CA-25-06 | Envío no entra en bases; `amount` de productos intacto |
| CA-25-07 | Servidor ignora montos tributarios del cliente y recalcula |
| CA-25-08 | Legacy: `payableAmount = amount + shippingCost`, `taxes = []` |
| CA-25-09 | `estimatedAmount` de aprobación no incluye IVA ni retenciones |
| CA-25-10 | Comparación ordena por costo total de la oferta; copy de no-factura visible |
| CA-25-11 | GET detail expone presets PURCHASE; comprador no llama Taxation HTTP |
| CA-25-12 | Migración 124 reversible; OpenAPI; sin PII; RBAC `INVENTORY_PURCHASING_MANAGE` intacto |
| CA-25-13 | Unique de invitación: segundo POST → 409; PATCH sobre la misma cotización para corregir |
| CA-25-14 | Mismo bloque en RFQ inline y Nueva cotización |
| CA-25-15 | Neto visible con envío en blanco; tres condiciones de envío; flete al transportador no entra al neto |

## 9. Desempates de esta sesión

**[DESEMPATE] Alcance tributario.** SR-FULL propuso recortar a solo IVA (signo MUNICIPAL vs WITHHOLDING). DATA-ENG y PROD-UX validaron los 4. **Decisión:** los 4 entran; el signo lo da `effect`, no la categoría.

**[DESEMPATE] Neto vs umbral de aprobación.** PROD-UX pidió un solo total = neto. ADR-053 / Fase 19 / SR-FULL congelan `estimatedAmount = amount + shipping`. **Decisión:** comparar por neto; aprobar por base comercial. Relabelar el umbral como neto sería cambio de política (escalaría al CTO).

## 10. Impacto

| Eje | Impacto |
| --- | --- |
| Tenant | Schema tenant; aislamiento por `tenant_id`; `SET LOCAL search_path` intacto |
| Seguridad | Mismo permiso de compras; snapshot fiscal no es PII; logs sin montos en texto libre innecesario |
| Escala | 0–4 filas por cotización; índice por request + payable |
| Regulación | Estimación operativa. Tasas **requieren verificación con fuente oficial**. No es DIAN UBL |
| ADR nuevo | **No.** Consumo de ADR-029 D4 + addendum ADR-053 |

## 11. Protocolo

- G4: este spec + prompt Fase 25 (productor: AI-EM-ARCH; no autofirma — GO del responsable de producto)
- G5: AI-DATA-ENG (migración) → AI-SR-FULL (cálculo + API) ∥ AI-FE-PLATFORM (UI) contra contrato congelado
- G6: AI-SR-QA
- Carril UI: tokens existentes; DS-OWNER no interviene
