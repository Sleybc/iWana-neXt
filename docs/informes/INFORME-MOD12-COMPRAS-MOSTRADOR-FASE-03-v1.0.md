# Informe - MOD12 Compra de mostrador (ingreso directo) Fase 03

**Version:** 1.0  
**Fecha:** 2026-07-11  
**Estado:** Ejecutado  
**Modo activo:** Ejecucion  
**Responsable:** AI-SR-FULL  
**Aprobado por:** CTO  
**ADR:** docs/adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md  
**Prompt:** docs/prompts/PROMPT-MOD12-COMPRA-MOSTRADOR-FASE-03-v1.0.md  
**Plan:** docs/plans/2026-07-11-mod12-compras-mostrador-fase-03.md

---

## 1. Resumen de implementacion

Se incorporo el ingreso directo de inventario por compra de mostrador dentro de MOD12, sin solicitud ni orden de compra, conforme a ADR-050.

### Shared / Database

- Enum `StockMovementOrigin.COUNTER_PURCHASE`
- Migracion tenant `058_add_counter_purchase_origin.ts` (idempotente, `down()` con no-op si hay filas usando el origen)

### Backend

- `CounterPurchaseService.record()` reutiliza `StockLedgerService.recordMovementWithManager` y `SerializedAssetService`
- DTO Zod `CreateCounterPurchaseSchema` + endpoint `POST /inventory/counter-purchases` (roles ADMIN/NOC/SUPPORT)
- Idempotencia por `idempotencyKey` explicita o derivada (`proveedor + factura + fecha + destino + lineas`), con chequeo previo a crear lotes o activos

### Frontend (portal)

- Panel `CounterPurchasePanel` integrado en `PurchaseWorkspace` como sub-vista "Ingreso directo"
- Cliente `inventoryApi.createCounterPurchase`
- Proveedor resuelto por nombre via `SupplierPicker`; no se expone `partyRefId` en UI
- Feedback de exito con numero de movimiento generado

## 2. Comandos ejecutados y resultados

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/shared build` | OK |
| `pnpm --filter @iwana/db build` | OK |
| `pnpm db:migrate:all` | OK; public sin pendientes, tenant `tenant_iwana` migrado |
| `pnpm --filter @iwana/db typecheck` | OK |
| `pnpm --filter @iwana/api typecheck` | OK |
| `pnpm --filter @iwana/portal typecheck` | OK |
| `pnpm --filter @iwana/api lint` | OK |
| `pnpm --filter @iwana/portal lint` | OK |
| `npx jest counter-purchase.service.spec.ts counter-purchase.http.integration.spec.ts` | 8 tests OK |
| `npx jest inventory.controller.http.spec.ts inventory.module.spec.ts` | 29 tests OK |

## 3. Criterios de aceptacion (DoD)

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| Origen `COUNTER_PURCHASE` + migracion reversible documentada | Cubierto | enum shared + migracion 058 |
| Ingreso sin PR/OC/GR acoplado | Cubierto | `CounterPurchaseService` independiente de `GoodsReceiptService` |
| Ledger unico para stock | Cubierto | `recordMovementWithManager` con cantidades positivas |
| Activos serializados a AVAILABLE | Cubierto | test unit serializado + transiciones RECEIVED |
| Idempotencia | Cubierto | chequeo previo al ledger + test unit que evita lotes/activos en reintento |
| OpenAPI / DTO | Cubierto | `CreateCounterPurchaseDto` + `@ApiOperation` en controller |
| Panel portal en espanol | Cubierto | `CounterPurchasePanel` + boton en toolbar Compras |
| Cobertura core >= 80% en servicio | Cubierto | 5 casos unit + 2 HTTP |

## 4. Deuda y fuera de alcance (explicito)

- Tope de monto por compra de mostrador: fuera de alcance (mejora futura)
- Valorizacion contable / DIAN / costo promedio: fuera de alcance
- RFQ Nivel 1/2: requiere ADR propio
- E2E Playwright dedicado al ingreso directo: pendiente opcional (mocks del spec SCM no extendidos en esta entrega)

## 5. Bloqueantes

Ninguno.

---

## 6. Apéndice UI — Firma iWana / create-mode (2026-07-16)

Alineación visual del panel de ingreso directo al contrato create-mode (carril rápido DS-OWNER):

- Contrato: [`docs/specs/2026-07-16-mod12-ingreso-directo-ui-contract.md`](../specs/2026-07-16-mod12-ingreso-directo-ui-contract.md)
- Shell `PurchaseCreateModeShell` + header configurable, secciones, `DatePicker`, `PurchaseProductSearch`, tabla `CounterPurchaseLinesTable` (`portalDataTable*`)
- Validación visible, CTA «Registrar otro ingreso», confirmación al volver con cambios
- Tests: `CounterPurchasePanel.spec.tsx` (4 casos)
