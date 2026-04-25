# PROMPT - MOD03 Configuracion Empresarial Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-03-23  
**Modo activo:** Mixto

## Vinculos de trazabilidad

- Plantilla base: docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md
- PRD del modulo: docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- HLD del modulo: docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- Backlog tecnico Fase 02: docs/plans/PLAN-MOD03-CONFIGURACION-EMPRESA-FASE-02-v1.0.md
- Backlog tecnico Fase 01: docs/plans/PLAN-MOD03-CONFIGURACION-EMPRESA-BACKLOG-v1.0.md
- Prompt Fase 01: docs/prompts/PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-01-v1.0.md
- Informe relacionado: docs/informes/INFORME-MOD03-DEFINICION-v1.0.md
- Prompt arquitectonico origen: docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- Consumidor: docs/prompts/PROMPT-MOD05-CRM-FASE-02-v1.0.md (MOD05 consume contratos read-only)

## Modulo

- Nombre: Configuracion Empresarial — Cobertura Comercial y Planes y Valores
- Codigo: MOD03
- Fase: CONFIGURACION-EMPRESA-FASE-02
- Version: 1.0
- Fecha: 2026-03-23
- Generado por: AI-EM-ARCH
- Nombre de archivo destino: docs/prompts/PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-02-v1.0.md

---

## 1. Objetivo exacto de la fase

- Resultado esperado: implementar las subcapacidades de Cobertura Comercial y Catalogo de Planes y Valores como extensiones del modulo de Configuracion Empresarial, dentro de TenantModule, para que el tenant pueda gestionar su red de cobertura y sus planes de servicio desde apps/portal.
- Lo que si entra:
  - contratos read-only para consumo de MOD05 (CRM): `ICoverageReadPort`, `IPlanCatalogReadPort`,
  - persistencia tenant-owned en schema del tenant para nodos de cobertura y planes de servicio,
  - migraciones reversibles para las tablas nuevas,
  - endpoints REST self-service para CRUD de cobertura y planes,
  - pantallas en apps/portal bajo `/dashboard/settings/coverage` y `/dashboard/settings/plans`,
  - validaciones Zod en boundaries externos,
  - pruebas unitarias y de integracion del flujo principal,
  - actualizacion del informe vivo.
- Lo que no entra:
  - cambios en el flujo de autenticacion o tenancy,
  - modificaciones al dashboard de MOD02,
  - CRUD de usuarios internos (MOD04),
  - funcionalidad CRM directa (MOD05 consume, no modifica),
  - integraciones con Billing, Provisioning o Inventory,
  - cambios de stack, boundary entre apps/web y apps/portal.

## 2. Artefactos de entrada obligatorios

- PRD del modulo: docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- HLD del modulo: docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- ADRs aplicables: ADR-016, ADR-018, ADR-019, ADR-022, ADR-023
- Backlog Fase 02: docs/plans/PLAN-MOD03-CONFIGURACION-EMPRESA-FASE-02-v1.0.md
- Prompt Fase 01 (referencia): docs/prompts/PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-01-v1.0.md

## 3. Instrucciones para Sr. Dev Fullstack

1. Definir contratos TypeScript para `ICoverageReadPort` e `IPlanCatalogReadPort` en el boundary de TenantModule. Estos contratos seran consumidos por MOD05 CRM como lectura pura.
2. Crear entidad `CoverageNode` en el schema del tenant con campos: id, tenantId, name, type (zona/nodo/radio), parentId (nullable, jerarquia), technology, latitude, longitude, radius, status, createdAt, updatedAt, deletedAt.
3. Crear entidad `ServicePlan` en el schema del tenant con campos: id, tenantId, name, description, downloadSpeed, uploadSpeed, price, currency, billingCycle, status, features (JSONB), createdAt, updatedAt, deletedAt.
4. Generar migraciones reversibles para ambas tablas con indices por tenantId y status.
5. Implementar `CoverageService` con CRUD completo, validacion de jerarquia y consulta de factibilidad por coordenadas.
6. Implementar `PlanCatalogService` con CRUD completo, listado activo/inactivo y snapshot para cotizaciones.
7. Exponer endpoints REST self-service bajo `/api/v1/tenants/me/coverage` y `/api/v1/tenants/me/plans`.
8. Implementar adaptadores concretos de `ICoverageReadPort` e `IPlanCatalogReadPort` que reemplacen los stubs actuales en CrmModule.
9. Crear paginas en apps/portal: `/dashboard/settings/coverage` (CRUD cobertura con mapa/tabla) y `/dashboard/settings/plans` (CRUD planes con tabla/formulario).
10. Agregar enlaces de navegacion en el sidebar del portal bajo la seccion de Configuracion.
11. Validar payloads con Zod en todos los endpoints de escritura.
12. Registrar auditoria de cambios con AuditService.
13. Escribir pruebas unitarias para servicios y pruebas de integracion para endpoints.
14. Actualizar el informe vivo en docs/informes/INFORME-MOD03-DEFINICION-v1.0.md con los resultados.

## 4. Restricciones absolutas

- No se crea bounded context nuevo. Cobertura y Planes permanecen dentro de TenantModule.
- MOD05 solamente consume estos contratos via lectura; nunca escribe directamente sobre las tablas de MOD03.
- Las tablas nuevas viven en el schema del tenant, nunca en public.
- No se hardcodea tenantId ni schemaName; siempre resolver desde TenantContext.
- Sin PII real, secretos ni tokens en codigo, tests o docs.
- Sin `synchronize: true` en TypeORM.
- Migraciones deben ser reversibles.
- Mantener cobertura de tests >= 80% en servicios core de la fase.

## 5. Entregables

| Entregable | Ubicacion esperada |
| --- | --- |
| Contratos TypeScript read-only | `apps/api/src/modules/tenant/ports/` |
| Entidad CoverageNode | `packages/database/src/entities/coverage-node.entity.ts` o `apps/api/src/modules/tenant/entities/` |
| Entidad ServicePlan | `packages/database/src/entities/service-plan.entity.ts` o `apps/api/src/modules/tenant/entities/` |
| Migracion tenant cobertura + planes | `packages/database/src/migrations/tenant/` |
| CoverageService | `apps/api/src/modules/tenant/` |
| PlanCatalogService | `apps/api/src/modules/tenant/` |
| Endpoints REST | `apps/api/src/modules/tenant/tenant.controller.ts` o controller dedicado |
| Adaptadores concretos para CrmModule | `apps/api/src/modules/crm/ports/` (reemplazan stubs) |
| Pagina portal cobertura | `apps/portal/src/app/dashboard/settings/coverage/page.tsx` |
| Pagina portal planes | `apps/portal/src/app/dashboard/settings/plans/page.tsx` |
| Pruebas unitarias | `*.spec.ts` junto a servicios |
| Pruebas integracion | `*.http.spec.ts` o `*.self.spec.ts` |
| Informe actualizado | `docs/informes/INFORME-MOD03-DEFINICION-v1.0.md` |

## 6. Criterios de aceptacion

| ID | Criterio |
| --- | --- |
| CA-01 | `GET /tenants/me/coverage` retorna nodos de cobertura del tenant autenticado |
| CA-02 | `POST /tenants/me/coverage` crea nodo con validacion Zod y auditoria |
| CA-03 | `GET /tenants/me/coverage/check?lat=X&lng=Y` retorna factibilidad comercial |
| CA-04 | `GET /tenants/me/plans` retorna catalogo de planes activos |
| CA-05 | `POST /tenants/me/plans` y `PATCH /tenants/me/plans/:id` gestionan el catalogo |
| CA-06 | Los adaptadores concretos de `ICoverageReadPort` e `IPlanCatalogReadPort` funcionan en CrmModule |
| CA-07 | La UI de `/dashboard/settings/coverage` permite CRUD visual de cobertura |
| CA-08 | La UI de `/dashboard/settings/plans` permite CRUD visual de planes |

## 7. Criterios stop/go

- **GO:** Fase 01 de MOD03 cerrada con evidencia de settings funcional y contratos self-service operativos.
- **STOP:** Si la ejecucion excede el boundary de TenantModule, se requiere ADR y escalacion.
- **STOP:** Si se detecta conflicto de ownership entre MOD03 y otro modulo sobre cobertura o planes.
- **STOP:** Si las migraciones propuestas rompen compatibilidad con tenants existentes.

## 8. Exit criteria

- Todos los CA-01 a CA-08 verificados con evidencia tecnica.
- Tests >= 80% en servicios core de la fase.
- Build exitoso: `pnpm build` sin errores.
- Informe vivo actualizado.
- Sin vulnerabilidades criticas conocidas.

---

_Documento emitido en Modo Mixto — AI-EM-ARCH_  
_Fecha: 2026-03-23_
