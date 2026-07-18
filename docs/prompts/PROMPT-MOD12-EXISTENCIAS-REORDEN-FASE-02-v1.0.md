# PROMPT - MOD12 Existencias — Reorden y valor básico — Fase 02

> **⚠️ BORRADOR — NO EJECUTAR.** Este prompt no está emitido. Criterio de entrada (ADR-016 + PRD sección 8): cierre de Fase 1 con informe aprobado, contrato de Fase 2 congelado por AI-EM-ARCH y sin deuda crítica abierta. AI-EM-ARCH lo versionará a estado "Emitido" cuando se cumplan.

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- PRD: `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` (sección 7, contrato borrador de Fase 2)

## Modulo

- Nombre: Inventario / SCM — submódulo Existencias (stock)
- Codigo: MOD12
- Fase: 02 (Reorden y valor básico)
- Version: 1.0 (borrador)
- Fecha: 2026-07-18
- Generado por: AI-EM-ARCH
- Destinatario: Sr. Dev Fullstack (AI-SR-FULL + AI-FE-PLATFORM)

---

## 1. Objetivo exacto de la fase (borrador)

- **Resultado esperado:** el tenant identifica ítems bajo punto de reorden y genera desde Existencias una solicitud de compra prellenada en el flujo de purchasing existente; el dashboard de inventario muestra indicadores básicos de valor.
- **Lo que sí entra (borrador):**
  - `GET /inventory/replenishment/suggestions`: ítems con disponible bajo `reorderPoint`; cantidad sugerida = `targetStock − disponible` (mínimo `minimumOrderQty`), proveedor preferido (`preferredSupplierRefId`), `leadTimeDays`.
  - `POST /inventory/replenishment/purchase-requests`: crea una `PurchaseRequest` en borrador desde las sugerencias seleccionadas, reutilizando el servicio de purchasing del propio módulo (sin acceso directo a tablas).
  - UI: sección "Reposición sugerida" en la pestaña Existencias (vista Por producto) con selección múltiple y acción "Generar solicitud de compra"; enlace al workspace de Compras con la solicitud creada.
  - Extensión de `GET /inventory/dashboard` con valor estimado de inventario (existencia × último costo conocido por movimiento).
- **Lo que no entra:** compra automática sin intervención humana; conteos, reservas, costeo promedio (Fases 3-4); cambios al flujo de aprobación de compras.

## 2. Artefactos de entrada obligatorios (a congelar al emitir)

- PRD `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` (contrato de Fase 2 congelado — hoy en borrador).
- Informe de cierre de Fase 1: `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-v1.0.md`.
- Estado real del flujo de `PurchaseRequest` al momento de emisión (verificar contra el código; Compras evoluciona en paralelo).

## 3-9. Secciones pendientes de emisión

Las instrucciones detalladas (archivos, DTOs, componentes, tests), restricciones, criterios de aceptación y stop/go se completarán al emitir el prompt, con verificación previa del código vigente (regla anti-alucinación §7 del protocolo: sin fuentes citables no hay especificación).

Decisiones ya tomadas que este prompt heredará:

- Sin acceso directo a tablas de compras desde la lógica de existencias: la creación de solicitudes pasa por el servicio de purchasing del módulo.
- La sugerencia de reposición es una consulta derivada (sin nueva entidad persistida) salvo que la definición de fase demuestre lo contrario; cualquier DDL requiere gate.
- Roles: consulta ADMIN/NOC/SUPPORT; generación de solicitud según los roles vigentes del flujo de compras.
