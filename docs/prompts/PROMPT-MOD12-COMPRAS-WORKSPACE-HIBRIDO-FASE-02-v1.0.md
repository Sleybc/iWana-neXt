# PROMPT - MOD12 Compras Workspace Hibrido Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-25  
**Modo activo:** Ejecucion  
**Generado por:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Ejecutor:** Sr. Dev Fullstack  
**Archivo destino:** `docs/prompts/PROMPT-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md`

---

## 1. Objetivo exacto

Evolucionar el submodulo de Compras de MOD12 hacia un workspace hibrido con solicitudes por lineas, politicas por tipo + monto, proveedor desde Parties, cotizacion preparada para adjudicacion por linea y recepciones parciales trazables.

## 2. Artefactos de entrada obligatorios

- `AGENTS.md`
- `docs/roles/Perfil_IA_EM_Architect_Unificado_v1.md`
- `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`
- `docs/specs/2026-06-25-mod12-compras-workspace-hibrido-design.md`
- `docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`
- `docs/hlds/HLD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`
- `docs/plans/2026-06-25-mod12-compras-workspace-hibrido-fase-02.md`
- `docs/informes/INFORME-MOD12-INVENTARIO-SCM-DEFINICION-v1.0.md`
- `.github/instructions/api.instructions.md`
- `.github/instructions/database.instructions.md`
- `.github/instructions/frontend.instructions.md`
- `.github/instructions/portal.instructions.md`
- `.github/instructions/testing.instructions.md`

## 3. Alcance exacto

### Si entra

- Workspace hibrido de compras.
- Solicitudes con lineas.
- Tipos de solicitud.
- Politica de aprobacion por tipo + monto.
- Excepciones justificadas.
- Selector de proveedor y ficha resumida desde MOD08 Parties.
- Adjudicacion preparada para resolucion por linea.
- Recepciones parciales con faltantes o danados.

### No entra

- Portal proveedor.
- Scoring avanzado.
- Contratos marco.
- Nuevo bounded context de compras.
- Integracion ERP real.
- Catalogo comercial como origen principal de lineas.

## 4. Restricciones no negociables

1. Mantener Compras dentro de MOD12.
2. No duplicar maestro de proveedor dentro de MOD12.
3. No crear FKs cross-module.
4. No usar `partyRefId` como texto visible en UI.
5. No mover stock por fuera de `GoodsReceiptService` y `StockLedgerService`.
6. No tratar estados de recepcion como decorativos.
7. No romper compatibilidad de los endpoints existentes sin actualizar cliente, tests y OpenAPI.

## 5. Entregables tecnicos obligatorios

### Backend

- Nuevos enums de compras.
- Nuevas entidades `purchase_request_lines` y `purchase_request_line_awards`.
- Migracion tenant `049_refine_inventory_purchasing_workspace.ts`.
- DTOs refinados.
- Politica `PurchasingPolicyService`.
- Query service de detalle y workspace.
- Puerto `SupplierPartyPort`.
- Endpoints de detalle, adjudicacion y resumen de proveedor.

### Frontend

- KPI summary.
- Tabla operativa con filtros.
- Drawer de trabajo de solicitud.
- Composer de solicitud con lineas mixtas.
- Ficha resumida del proveedor.
- Gating de acciones por estado.

### Tests

- Unit + integration backend de lineas, politica, awards y recepcion parcial.
- Tests frontend de workspace y drawer.
- E2E de reposicion, urgencia, proyecto y recepcion parcial.

## 6. Criterios de aceptacion

- CA-CMP-01: una solicitud puede crearse con una o mas lineas.
- CA-CMP-02: las lineas pueden venir de item, sugerencia o texto libre.
- CA-CMP-03: la aprobacion depende de tipo + monto.
- CA-CMP-04: una urgencia puede usar excepcion auditada.
- CA-CMP-05: el proveedor se selecciona desde Parties y muestra ficha resumida.
- CA-CMP-06: una solicitud puede derivar en una o varias OCs.
- CA-CMP-07: la recepcion parcial no sobrestima stock.
- CA-CMP-08: faltantes y danados quedan trazados.
- CA-CMP-09: la UI muestra KPIs, tabla, filtros y drawer operativos.

## 7. Criterio de stop/go

### Detenerse si

- se requiere nuevo BC,
- se necesita copiar datos maestros de proveedor,
- la recepcion parcial no puede mantenerse consistente con el ledger,
- la solucion intenta mezclar catalogo comercial con item master fisico sin contrato formal.

### Documentar en

- `docs/informes/INFORME-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md`
- `docs/quality/CHECKLIST-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md`
