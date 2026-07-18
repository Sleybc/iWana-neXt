# ADR-053: Cotización de proveedor por línea de solicitud (Supplier Quote Lines)

**Version:** 1.0
**Estado:** Aprobado (diseño de fase; implementación Fase 18)
**Aprobado por:** AI-EM-ARCH (sesión operativa; CTO para GO producción)
**Fecha:** 2026-07-17
**Autor:** AI-EM-ARCH
**Modulo:** MOD12 Inventario / SCM (submodulo Compras)
**PRD relacionado:** docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md
**ADR antecedente:** docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md
**Spec / prompt:** docs/specs/2026-07-17-mod12-compras-cotizacion-por-linea-fase18-design.md · docs/prompts/PROMPT-MOD12-COMPRAS-COTIZACION-POR-LINEA-FASE-18-v1.0.md

---

## Contexto

ADR-051 modeló `SupplierQuote` por **monto total**. La captura UI (Fase 17) y la comparación siguen ese contrato: con N productos en la solicitud solo se registra un lump sum, sin precio unitario por ítem. La adjudicación es por línea de PR pero no hereda precio; el `unitCost` de la OC se captura aparte.

El negocio necesita registrar la respuesta del proveedor **por producto** (p. ej. 10 líneas) para comparar y adjudicar con evidencia de precio.

## Decisión

1. Se introduce la entidad/tabla **`supplier_quote_lines`** dentro del bounded context de Inventario/Compras:
   - `supplier_quote_id` (FK CASCADE a `supplier_quotes`)
   - `purchase_request_line_id` (uuid de la línea de solicitud; sin FK cross-módulo innecesario)
   - `quantity` (snapshot = `quantityRequested` de la línea PR al registrar)
   - `unit_cost`, `line_amount` (`quantity × unit_cost`)
   - Único `(supplier_quote_id, purchase_request_line_id)`
2. El campo `supplier_quotes.amount` **permanece** y pasa a ser **derivado** = suma de `line_amount` cuando hay líneas. La política de aprobación y `estimatedAmount` no cambian de semántica (siguen sumando cabeceras).
3. Contrato `POST .../quotes`:
   - Si la PR tiene ≥1 línea: `lines[]` obligatorio (≥1 entrada; cotización parcial permitida).
   - Si la PR no tiene líneas: path legacy con `amount` obligatorio (sin `lines`).
4. Quotes legacy sin filas en `supplier_quote_lines` siguen válidas (solo total en UI).
5. Comparación y award muestran desglose / `unitCost` por línea cuando exista. **No** se prellena `unitCost` de OC en esta decisión (fase posterior).

## Consecuencias

### Positivas

- Cierra el callejón de “un solo monto” con N productos.
- Base para matriz de comparación por ítem sin rehacer RFQ.
- Retrocompatible con quotes existentes y con políticas que leen `amount`.

### Negativas / costos

- Migración tenant + cambios DTO/OpenAPI/UI.
- Tests de validación (línea ajena, unitCost, parcial).
- Award/OC aún no heredan precio automáticamente (deuda consciente).

## Alternativas descartadas

- Solo UX mostrando líneas en solo lectura + monto total: no resuelve precio por producto.
- Reemplazar `amount` por solo líneas: rompe política y clientes legacy.
- Precio en `purchase_request_line_awards`: mezcla adjudicación con cotización.

## Relación con ADR-051

ADR-051 §comparación por total queda **supersedido parcialmente**: el modelo de captura deja de ser solo total. La máquina de estados RFQ/invitaciones **no cambia**.

## Addendum — Gastos de envío (Fase 19, 2026-07-17)

Se añade a la cabecera `supplier_quotes` el campo **`shipping_cost`** (`NUMERIC(14,2) NOT NULL DEFAULT 0`):

- `0` = envío gratis.
- `amount` sigue siendo solo productos (líneas o legacy).
- **Total landed** = `amount + shipping_cost` (misma moneda).
- La comparación UI y el `estimatedAmount` de aprobación usan el total landed (suma de landed de todas las ofertas).
- No se modela flete por línea de producto.

Spec/prompt: Fase 19 gastos de envío.
