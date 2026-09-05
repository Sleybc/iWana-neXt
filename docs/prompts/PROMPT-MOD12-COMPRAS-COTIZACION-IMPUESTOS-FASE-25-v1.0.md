# PROMPT DE EJECUCIÓN — MOD12 Compras · Decimales e impuestos en cotización — Fase 25

**Versión:** 1.0
**Estado:** Listo para G5 tras GO de producto
**Fecha:** 2026-09-04
**Gate:** G4 — AI-EM-ARCH (productor; no autofirma)
**Ejecutores:** AI-DATA-ENG → AI-SR-FULL ∥ AI-FE-PLATFORM → AI-SR-QA
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](./TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) *(en revisión; destino de archivo respaldado por AGENTS.md → Documentation Rules)*
**Archivo destino:** `docs/prompts/PROMPT-MOD12-COMPRAS-COTIZACION-IMPUESTOS-FASE-25-v1.0.md`

---

## Módulo

- Nombre: Inventario / SCM — Compras (purchasing)
- Código: MOD12
- Fase: 25
- Version: 1.0
- Generado por: AI-EM-ARCH (Orquestador)

---

## Contratos congelados (§3.5 perfil)

- **Contrato de API:** [spec Fase 25 §6](../specs/2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos-design.md)
- **Contrato de componente:** mismos primitivos existentes (`Input`, checkbox nativo como `QuoteShippingFields`, `PortalAlert`). Sin contrato DS nuevo. Carril FE-PLATFORM.
- Un cambio a esos contratos se versiona y se notifica; no se parchea en silencio.

---

## 1. Objetivo exacto de la fase

- Resultado esperado: el operador registra una cotización (RFQ invitada o nueva) con centavos en totales y con IVA / retención en la fuente / Rete ICA / Rete IVA opcionales; compara por **neto a pagar**.
- Lo que sí entra: migración `124`, snapshot `supplier_quote_taxes`, `payable_amount`, preset `RETE_IVA`, cálculo servidor, UI de tributos, comparación, OpenAPI, tests, informe.
- Lo que no entra: ver spec §3 (perfil proveedor, DIAN, PATCH quote, cambiar umbral de aprobación, gravar flete, tokens nuevos).

## 2. Artefactos de entrada obligatorios

- Spec: `docs/specs/2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos-design.md`
- Plan: `docs/plans/2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos.md`
- ADR-053 (Aprobado) + ADR-029 (Aprobado, D4)
- ADR-082 *(propuesto — no ejecutar)*
- PRD-MOD12-COMPRAS-CIERRE-FLUJO §2 (valorización DIAN sigue fuera)
- Superficie: `apps/portal/src/components/inventory/RfqInvitationsPanel.tsx`, `PurchaseRequestWorkbenchDrawer.tsx`, `SupplierQuoteLinesEditor.tsx`, `QuoteComparisonPanel.tsx`
- API: `apps/api/src/modules/inventory/services/purchasing.service.ts`, `dto/index.ts`
- Puerto: `apps/api/src/modules/taxation/ports/tax-catalog-read.port.ts` (exportado por `TaxationModule`)
- Artefactos faltantes: ninguno para arrancar G5. Tasas **requieren verificación con fuente oficial**.

## 3. Instrucciones por agente

### AI-DATA-ENG

1. Migración tenant `124` reversible según spec §5.
2. Entidad `SupplierQuoteTax` + columna `payableAmount` en `SupplierQuote`.
3. Seed idempotente `RETE_IVA`. Sin FK a `tax_definitions`.

### AI-SR-FULL

1. Preset shared + enum `TaxQuoteEffect`.
2. Motor puro `quote-tax-calc` + tests CA-25-04/05/06.
3. Extender POST quotes y GET detail. Importar `TaxationModule` solo por `TaxCatalogReadPort`.
4. **No** cambiar `estimatedAmount`.
5. OpenAPI purchasing.

### AI-FE-PLATFORM

1. `formatInventoryMoney` (2 decimales) solo en superficies de cotización.
2. `QuoteTaxFields` + wire RFQ y Nueva cotización.
3. Comparación por `payableAmount`. Vocabulario canónico (spec §7).
4. No llamar HTTP Taxation. No rediseñar el drawer.

### AI-SR-QA

1. Trazar CA-25-01..14 a tests.
2. Informe de fase. Vocabulario en specs.

## 4. Restricciones no negociables

- Modulith: Inventory no lee tablas de Taxation.
- Multi-tenant: `tenant_id` + `SET LOCAL search_path`.
- Sin `any`, sin PII en logs, sin `synchronize: true`.
- pnpm exclusively.
- Texto visible en español, sentence case.
- No inventar regulación.

## 5. Entregables técnicos

- Código backend + frontend
- Migración 124 reversible
- Tests unit/HTTP/component
- OpenAPI actualizado

## 6. Entregables documentales

- Informe: `docs/informes/INFORME-MOD12-COMPRAS-COTIZACION-IMPUESTOS-FASE-25-v1.0.md`
- No duplicar esta spec. Si el cálculo cambia, versionar spec y re-sync de tracks.

## 7. Criterios de aceptación

Los CA-25-01 a CA-25-14 de la spec §8. Resumen: decimales en UI de cotizar; 4 tributos opcionales; servidor calcula; Rete IVA depende de IVA; envío fuera de base; aprobación intacta; 409 sin PATCH; presets en GET detail.

## 8. Criterio de stop/go

Detenerse inmediatamente si:

- Se propone FK física a `tax_definitions` o import de entidad Taxation en Inventory.
- Se cambia `estimatedAmount` para incluir IVA.
- Se abre `SupplierTaxProfile` o facturación DIAN.
- Un track necesita cambiar el contrato §6: volver a AI-EM-ARCH (re-sync).

GO de fase cuando: migración down verificada, tests del plan verdes, OpenAPI alineado, CA cubiertos, informe emitido.

## 9. Desempates ya cerrados

No reabrir: (1) los 4 tributos entran con `effect` explícito; (2) comparar por neto, aprobar por `amount + shipping`.
