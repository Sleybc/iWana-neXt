# Plan Tecnico - MOD03 Configuracion Empresarial Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-03-23  
**Modo activo:** Mixto

## Trazabilidad

- PRD base: docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- HLD base: docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- Prompt Fase 02: docs/prompts/PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-02-v1.0.md
- Backlog Fase 01: docs/plans/PLAN-MOD03-CONFIGURACION-EMPRESA-BACKLOG-v1.0.md
- Informe relacionado: docs/informes/INFORME-MOD03-DEFINICION-v1.0.md

---

## Objetivo

Implementar Cobertura Comercial y Catalogo de Planes y Valores como extensiones tenant-managed dentro de TenantModule, exponiendo contratos read-only para consumo de MOD05 CRM.

---

## Prioridad P0 — Contratos y puertos de lectura

### BT-CE2-01 — Definir ICoverageReadPort

**Archivos objetivo**

- apps/api/src/modules/tenant/ports/coverage-read.port.ts

**Objetivo**

Definir la interfaz TypeScript que MOD05 consumira para consultas de factibilidad comercial.

**Criterios de cierre**

- Interfaz exportada con metodos: `checkCoverage(lat, lng)`, `listNodes(filters)`.
- Tipado estricto con coordenadas, resultado de factibilidad y tecnologia disponible.

### BT-CE2-02 — Definir IPlanCatalogReadPort

**Archivos objetivo**

- apps/api/src/modules/tenant/ports/plan-catalog-read.port.ts

**Objetivo**

Definir la interfaz TypeScript que MOD05 consumira para lectura del catalogo de planes.

**Criterios de cierre**

- Interfaz exportada con metodos: `listActivePlans()`, `getPlanById(id)`, `getSnapshot(planId)`.
- El snapshot incluye precio, velocidad y features congelados en el momento de consulta.

### BT-CE2-03 — Contrato REST de cobertura para factibilidad

**Archivos objetivo**

- apps/api/src/modules/tenant/tenant.controller.ts (o controller dedicado)

**Objetivo**

Exponer `GET /api/v1/tenants/me/coverage/check?lat=X&lng=Y` para consulta de factibilidad.

**Criterios de cierre**

- Endpoint protegido con JWT + RolesGuard.
- Responde con resultado de factibilidad, tecnologia disponible y distancia estimada.
- Validacion de coordenadas con Zod.

---

## Prioridad P1 — Persistencia y validaciones

### BT-CE2-04 — Entidad CoverageNode y migracion

**Archivos objetivo**

- packages/database/src/entities/coverage-node.entity.ts (o apps/api/src/modules/tenant/entities/)
- packages/database/src/migrations/tenant/

**Objetivo**

Crear entidad y migracion reversible para nodos de cobertura dentro del schema tenant.

**Criterios de cierre**

- Tabla `coverage_nodes` con: id, tenantId, name, type (zona/nodo/radio), parentId, technology, latitude, longitude, radius, status, timestamps, soft delete.
- Indices por tenantId+status y tenantId+type.
- Migracion con metodo `up()` y `down()` funcionales.

### BT-CE2-05 — Entidad ServicePlan y migracion

**Archivos objetivo**

- packages/database/src/entities/service-plan.entity.ts (o apps/api/src/modules/tenant/entities/)
- packages/database/src/migrations/tenant/

**Objetivo**

Crear entidad y migracion reversible para catalogo de planes de servicio.

**Criterios de cierre**

- Tabla `service_plans` con: id, tenantId, name, description, downloadSpeed, uploadSpeed, price, currency, billingCycle, status, features (JSONB), timestamps, soft delete.
- Indices por tenantId+status.
- Migracion reversible.

### BT-CE2-06 — CoverageService y PlanCatalogService

**Archivos objetivo**

- apps/api/src/modules/tenant/coverage.service.ts
- apps/api/src/modules/tenant/plan-catalog.service.ts

**Objetivo**

Implementar logica CRUD completa, factibilidad por coordenadas y snapshot de planes.

**Criterios de cierre**

- CoverageService: crear, listar, actualizar, eliminar nodos; consulta de factibilidad por lat/lng usando calculo de distancia.
- PlanCatalogService: crear, listar, actualizar, desactivar planes; generar snapshot inmutable para cotizaciones.
- Ambos servicios operan en schema del tenant via `runInTenantSchema`.
- Auditoria registrada en ambos.

---

## Prioridad P2 — Frontend portal

### BT-CE2-07 — Pagina de cobertura en portal

**Archivos objetivo**

- apps/portal/src/app/dashboard/settings/coverage/page.tsx
- apps/portal/src/components/settings/CoverageManager.tsx (o similar)

**Objetivo**

CRUD visual de nodos de cobertura, con tabla, formulario de alta/edicion y vista de jerarquia.

**Criterios de cierre**

- Listado de nodos con filtro por tipo y estado.
- Formulario para crear/editar nodo con campos del modelo.
- Eliminacion con confirmacion.
- Feedback de carga, error y exito.

### BT-CE2-08 — Pagina de planes en portal

**Archivos objetivo**

- apps/portal/src/app/dashboard/settings/plans/page.tsx
- apps/portal/src/components/settings/PlanCatalogManager.tsx (o similar)

**Objetivo**

CRUD visual del catalogo de planes de servicio.

**Criterios de cierre**

- Tabla de planes con estado activo/inactivo.
- Formulario para crear/editar plan con velocidades, precio, ciclo y features.
- Activar/desactivar planes sin eliminacion fisica.
- Feedback de carga, error y exito.

### BT-CE2-09 — Navegacion y enlaces en sidebar

**Archivos objetivo**

- apps/portal/src/components/Sidebar.tsx (o componente de navegacion)

**Objetivo**

Agregar subrutas de Cobertura y Planes bajo la seccion de Configuracion.

**Criterios de cierre**

- Enlaces visibles en sidebar bajo Configuracion.
- Resaltado activo al navegar a `/dashboard/settings/coverage` o `/dashboard/settings/plans`.

---

## Prioridad P3 — Testing, integracion y documentacion

### BT-CE2-10 — Pruebas unitarias de servicios

**Archivos objetivo**

- apps/api/src/modules/tenant/coverage.service.spec.ts
- apps/api/src/modules/tenant/plan-catalog.service.spec.ts

**Objetivo**

Cobertura >= 80% en logica CRUD, factibilidad y snapshot.

**Criterios de cierre**

- Tests de creacion, listado, actualizacion y eliminacion.
- Tests de factibilidad por coordenadas.
- Tests de snapshot inmutable de plan.

### BT-CE2-11 — Pruebas de integracion de endpoints

**Archivos objetivo**

- apps/api/src/modules/tenant/*.self.spec.ts o *.http.spec.ts

**Objetivo**

Validar contratos REST de cobertura y planes con Supertest.

**Criterios de cierre**

- Tests de cada endpoint con JWT valido e invalido.
- Tests de RBAC (solo ADMIN puede escribir).
- Tests de validacion Zod (payloads invalidos → 400).

### BT-CE2-12 — Adaptar stubs de CrmModule

**Archivos objetivo**

- apps/api/src/modules/crm/ports/ (adapters concretos reemplazan stubs)

**Objetivo**

Conectar CrmModule a los contratos reales de MOD03 en vez de stubs.

**Criterios de cierre**

- `TenantCoverageReadAdapter` usa el servicio real de CoverageService.
- `TenantPlanCatalogReadAdapter` usa el servicio real de PlanCatalogService.
- Los stubs anteriores quedan retirados o marcados como deprecated.
- Las pruebas de CRM siguen pasando con los adapters reales.

### BT-CE2-13 — Actualizacion de informe y documentacion

**Archivos objetivo**

- docs/informes/INFORME-MOD03-DEFINICION-v1.0.md

**Objetivo**

Documentar resultados de Fase 02 en el informe vivo.

**Criterios de cierre**

- Seccion de resultados Fase 02 agregada al informe.
- Evidencia de tests y build incluida.
- Riesgos y pendientes actualizados.

---

## Resumen de tareas por prioridad

| Prioridad | Tareas | Descripcion |
| --- | --- | --- |
| P0 | BT-CE2-01, BT-CE2-02, BT-CE2-03 | Contratos y puertos read-only |
| P1 | BT-CE2-04, BT-CE2-05, BT-CE2-06 | Persistencia, entidades y servicios |
| P2 | BT-CE2-07, BT-CE2-08, BT-CE2-09 | Frontend portal (cobertura + planes + nav) |
| P3 | BT-CE2-10, BT-CE2-11, BT-CE2-12, BT-CE2-13 | Testing, integracion CRM y docs |

---

_Documento emitido en Modo Mixto — AI-EM-ARCH_  
_Fecha: 2026-03-23_
