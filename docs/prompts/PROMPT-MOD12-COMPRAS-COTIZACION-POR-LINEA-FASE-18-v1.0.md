# PROMPT DE EJECUCIÓN — MOD12 Compras · Cotización por línea — Fase 18

**Versión:** 1.0
**Gate:** G4 emitido por AI-EM-ARCH — habilita etapa 5
**Ejecutores:** AI-SR-FULL (backend) + AI-FE-PLATFORM (frontend)
**Spec:** [2026-07-17-mod12-compras-cotizacion-por-linea-fase18-design.md](../specs/2026-07-17-mod12-compras-cotizacion-por-linea-fase18-design.md)
**ADR:** [ADR-053](../adrs/ADR-053-Supplier-Quote-Lines.md)
**Precedencia:** `AGENTS.md` → CTO/ADRs → PRD MOD12 → este prompt.
**Skills:** `database-migration`, `nestjs-expert`, `openapi-spec-generation`, `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `testing-patterns`, `docs-architect`.

---

## 0. Objetivo

Capturar ofertas con precio unitario por línea de solicitud; `amount` derivado; UI en RFQ y «Nueva oferta»; desglose en comparación; unitCost de ayuda en award. **Sin** prefill OC.

## 1. Restricciones (STOP)

1. No cambiar máquina de estados RFQ/PR.
2. No prefill `unitCost` en OC.
3. No tokens/componentes nuevos en `@iwana/ui`; reutilizar tabla/inputs (patrón mostrador).
4. Texto español sentence case. Sin PII.
5. Migración reversible numerada `069`.

## 2. Backend

| Artefacto | Cambio |
| --- | --- |
| `packages/database/.../069_create_supplier_quote_lines.ts` | CREATE TABLE + índices + unique; `down` DROP |
| `supplier-quote-line.entity.ts` + exports + `inventory.module` forFeature | Entidad |
| `runner.ts` | Registrar migración 069 |
| `dto/index.ts` | `lines[]` en `AddSupplierQuoteSchema`; amount opcional con refine |
| `purchasing.service.ts` | Validar líneas PR, persistir lines, amount = suma |
| `purchasing-query.service.ts` | Detail: `quotes` con `lines[]` |
| OpenAPI / tests | Controllers DTOs + unit/integration |

## 3. Frontend

| Artefacto | Cambio |
| --- | --- |
| `SupplierQuoteLinesEditor.tsx` (+ spec) | Tabla qty readonly + unitCost + subtotal + total |
| `RfqInvitationsPanel.tsx` | Sustituir monto único por editor; enviar `lines` |
| `PurchaseRequestWorkbenchDrawer.tsx` | «Nueva oferta» + pasar `requestLines` al panel RFQ |
| `api-client.ts` | tipos `lines` |
| `QuoteComparisonPanel.tsx` | Desglose |
| `AwardLinesPanel.tsx` | Mostrar unitCost de quote-line |

## 4. Verificación

```bash
pnpm --filter @iwana/db build
cd apps/api && npx jest src/modules/inventory/tests/purchasing.service.spec.ts src/modules/inventory/tests/purchasing.flow.integration.spec.ts --no-coverage
pnpm --filter @iwana/portal exec jest src/components/inventory/SupplierQuoteLinesEditor.spec.tsx src/components/inventory/RfqInvitationsPanel.spec.tsx src/components/inventory/QuoteComparisonPanel.spec.tsx --no-coverage
pnpm --filter @iwana/api exec tsc --noEmit
pnpm --filter @iwana/portal exec tsc --noEmit
```

## 5. Informe

`docs/informes/INFORME-MOD12-COMPRAS-COTIZACION-POR-LINEA-FASE-18-v1.0.md` con CA-18-01..07 y evidencia de suites.
