# PROMPT - MOD12 Inventario / SCM Fase 01

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-25  
**Modo activo:** Ejecucion  
**Generado por:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Ejecutor:** Sr. Dev Fullstack  
**Archivo destino:** docs/prompts/PROMPT-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md

---

## Modulo

- **Nombre:** Inventario / SCM
- **Codigo:** MOD12
- **Fase:** Fase 01 - Ciclo de vida completo de productos y activos fisicos
- **Version:** 1.0
- **Fecha:** 2026-06-25
- **Ejecutor previsto:** Sr. Dev Fullstack

---

## 1. Objetivo exacto de la fase

Implementar el MVP end-to-end de MOD12 Inventario / SCM con compras, recepcion, stock, seriales, bodegas, movimientos, salidas, comodato, vida util operativa, retornos y bajas, preservando los boundaries del modulith.

### Resultado esperado

Un usuario autorizado puede crear una solicitud de compra, registrar cotizaciones, aprobar y generar una OC, recibir mercancia contra OC, crear stock/seriales, transferir stock a tecnico, registrar salida por venta o consumo interno, instalar activo en comodato desde OT, retornar activo y darlo de baja con trazabilidad.

### Lo que si entra

- `InventoryScmModule` en `apps/api/src/modules/inventory`.
- Enums compartidos en `packages/shared/src/enums/inventory`.
- Entidades tenant-aware en `packages/database/src/entities`.
- Migracion tenant `047_create_inventory_scm_module.ts`.
- Endpoints REST `/api/v1/inventory` y `/api/v1/purchasing`.
- Validaciones Zod.
- RBAC con permisos de inventario y `UserRole.*`.
- Ledger inmutable de movimientos.
- Integracion MOD11 -> Inventario por puerto para movimientos de OT.
- UI portal `/dashboard/inventory`.
- Tests backend, frontend y contrato focalizados.

### Lo que no entra

- Depreciacion contable NIIF completa.
- Facturacion o cobro.
- Portal proveedor.
- Scoring avanzado de proveedores.
- Contratos marco de compras.
- IPAM, VLAN, QoS o Resource Management logico.
- App movil offline.
- ERP externo real.

## 2. Artefactos de entrada obligatorios

- ADR: docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
- PRD: docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md
- HLD: docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md
- Plan: docs/plans/2026-06-25-mod12-inventario-scm-fase-01.md
- Idea de origen: docs/ideas/cadenadesuministros.md
- Stack: docs/prds/Stack_Tecnologico.md
- Gobernanza: AGENTS.md, .github/copilot-instructions.md
- ADRs relacionados: docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md, docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md, docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md
- MOD11 relacionado: docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md, docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md
- Instrucciones por path: .github/instructions/api.instructions.md, .github/instructions/database.instructions.md, .github/instructions/frontend.instructions.md, .github/instructions/portal.instructions.md, .github/instructions/testing.instructions.md

### Artefactos faltantes detectados

- Ninguno. ADR-048, PRD, HLD, plan y checklist se encuentran aprobados.

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer ADR, PRD, HLD y plan antes de tocar codigo.
2. Confirmar estado de ADR-048; si no esta aprobado, detenerse y escalar antes de merge productivo.
3. Implementar primero enums, entidades y migracion reversible.
4. Implementar backend con TDD para compras, recepcion, ledger, seriales y transferencias.
5. Implementar puerto MOD11 -> Inventario antes de conectar UI avanzada.
6. Implementar frontend solo cuando contratos API esten estables.
7. Mantener MOD12 aislado de tablas de MOD11, MOD09, CRM, Parties, Comercial y Billing.
8. Usar referencias logicas para proveedor, suscriptor, contrato, OT, venta y centro de costo.
9. No duplicar PII sensible del cliente o proveedor.
10. Actualizar OpenAPI y documentar desviaciones en informe.

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro modulo directamente.
- No crear FKs cross-module.
- No hardcodear tenant ni schema.
- No usar `synchronize: true`.
- No usar credenciales, tokens ni datos reales.
- No omitir validacion Zod.
- No permitir saldos negativos.
- No editar movimientos del ledger; usar reversos o ajustes aprobados.
- No renderizar enums crudos en UI.
- No meter facturacion, cobro o depreciacion contable dentro de MOD12 Fase 01.

## 5. Entregables tecnicos obligatorios

### Backend

- `packages/shared/src/enums/inventory/*`
- `packages/database/src/entities/inventory-item.entity.ts`
- `packages/database/src/entities/stock-location.entity.ts`
- `packages/database/src/entities/stock-balance.entity.ts`
- `packages/database/src/entities/stock-lot.entity.ts`
- `packages/database/src/entities/serialized-asset.entity.ts`
- `packages/database/src/entities/stock-movement.entity.ts`
- `packages/database/src/entities/stock-movement-line.entity.ts`
- `packages/database/src/entities/purchase-request.entity.ts`
- `packages/database/src/entities/supplier-quote.entity.ts`
- `packages/database/src/entities/purchase-order.entity.ts`
- `packages/database/src/entities/purchase-order-line.entity.ts`
- `packages/database/src/entities/goods-receipt.entity.ts`
- `packages/database/src/entities/goods-receipt-line.entity.ts`
- `packages/database/src/entities/asset-lifecycle-event.entity.ts`
- `packages/database/src/entities/asset-loan-assignment.entity.ts`
- `packages/database/src/entities/inventory-write-off.entity.ts`
- `packages/database/src/migrations/tenant/047_create_inventory_scm_module.ts`
- `apps/api/src/modules/inventory/**`
- Registrar modulo en `apps/api/src/app.module.ts`.

### Frontend

- `apps/portal/src/app/dashboard/inventory/page.tsx`
- `apps/portal/src/components/inventory/**`
- Cliente API tipado en `apps/portal/src/lib/api-client.ts`
- Navegacion portal actualizada si corresponde.

### Tests

- Unit tests backend de compras, recepcion, ledger, balance, seriales, transferencias, comodato y bajas.
- Controller/integration tests de endpoints principales.
- Contract tests para puerto MOD11 -> Inventario, incluyendo instalacion en comodato y persistencia de `stockMovementId`.
- Tests frontend de dashboard, compras, recepcion, activos y transferencias.
- E2E focalizado del ciclo compra -> recepcion -> transferencia -> consulta de activo -> retorno.

## 6. Entregables documentales obligatorios

- Actualizar `docs/informes/INFORME-MOD12-INVENTARIO-SCM-DEFINICION-v1.0.md` si cambia alcance.
- Crear informe de fase `docs/informes/INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md`.
- Crear o actualizar checklist `docs/quality/CHECKLIST-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md`.
- Actualizar PRD/HLD/ADR solo si cambia una decision aprobada.
- Documentar stop/go si aparece bloqueo tecnico.

## 7. Criterios de aceptacion

- CA-INV-01: Un usuario autorizado crea solicitud de compra y registra cotizaciones.
- CA-INV-02: Una solicitud aprobada genera OC con consecutivo por tenant.
- CA-INV-03: Una recepcion contra OC crea lotes, saldos y seriales.
- CA-INV-04: Un serial/MAC no puede duplicarse por tenant.
- CA-INV-05: Una transferencia a tecnico actualiza ledger, balance y custodia.
- CA-INV-06: Una OT instala activo en comodato via puerto de Inventario, validado por contrato backend o integracion cross-module entre MOD11 y MOD12.
- CA-INV-07: MOD11 recibe `stockMovementId` y no descuenta stock directamente, validado por contrato backend o integracion cross-module y no por E2E propio de MOD12.
- CA-INV-08: Una venta directa registra salida con referencia comercial.
- CA-INV-09: Un consumo interno registra motivo y centro de costo logico.
- CA-INV-10: Un retorno permite clasificar activo.
- CA-INV-11: Una baja requiere motivo, actor y aprobacion.
- CA-INV-12: Dashboard muestra stock por bodega, tecnico, cliente, categoria y estado.
- CA-INV-13: OpenAPI refleja endpoints y contratos.
- CA-INV-14: Tests focalizados quedan en verde o con bloqueo documentado.

## 8. Criterio de stop/go

### Detenerse inmediatamente si

- ADR-048 no esta aprobado y no hay autorizacion explicita para ejecucion controlada.
- Se requiere leer tablas de MOD11, MOD09, CRM, Parties, Comercial o Billing.
- Se necesita guardar PII sensible en MOD12.
- La migracion requiere FKs cross-module.
- Se detecta saldo negativo o doble fuente de verdad.
- Se pretende implementar facturacion, cobro o depreciacion contable dentro de Fase 01.

### Documentar causa en

- `docs/informes/INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md`
- `docs/quality/CHECKLIST-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md`

### Escalar a

- EM-ARCH primero.
- CTO si afecta boundary, seguridad, multi-tenancy, numeracion o alcance contable.

## 9. Criterio de salida de la fase

- Backend validado.
- Frontend validado.
- Migracion reversible validada.
- OpenAPI actualizado.
- Informe y checklist creados.
- Sin deuda critica pendiente.
- ADR-048 aprobado o riesgo documentado con autorizacion.
