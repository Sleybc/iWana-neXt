# ADR-043: Edicion atomica de sede y capacidades desde modal unificado

**Version:** 1.1  
**Estado:** Aprobado  
**Fecha:** 2026-05-23  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD00 Configuracion Control Plane  
**PRD relacionado:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`  
**HLD relacionado:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`  
**Spec relacionada:** `docs/specs/2026-05-23-mod00-organization-site-modal-unificado-design.md`  
**ADR antecedente:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`

---

## Contexto

MOD00 ya es owner de `OrganizationSite` y de sus capacidades por sede. El estado actual de implementacion separa la experiencia en dos operaciones:

1. `POST` o `PATCH /organization/sites` para datos base de la sede;
2. un contrato historico separado `PUT /organization/sites/:siteId/capabilities` para servicios activos.

Ese patron fue suficiente para Fase 01, pero hoy genera tres costos:

- saturacion visual en `OrganizationSettingsClient`;
- doble guardado para una sola intencion de usuario;
- riesgo de persistencia parcial y auditoria fragmentada.

La decision requerida no cambia ownership ni boundaries externos, pero si cambia el patron de integracion entre portal y API para la edicion de sedes.

---

## Decision

Se adopta como direccion arquitectonica el patron de **edicion atomica de sede y capacidades**.

Esto implica:

1. el portal edita sede y servicios en un solo modal;
2. `CreateOrganizationSiteDto` y `UpdateOrganizationSiteDto` aceptan `capabilities?: OrganizationSiteCapability[]`;
3. `OrganizationService.create()` y `OrganizationService.update()` persisten capacidades dentro de la misma transaccion cuando la propiedad esta presente;
4. el endpoint legacy `PUT /organization/sites/:siteId/capabilities` se retira una vez migrado el portal al payload unificado y validados sus consumidores conocidos;
5. la auditoria principal de create/update debe reflejar el snapshot consolidado de la sede, incluyendo sus capacidades.

---

## Reglas de boundary

1. MOD00 sigue siendo owner de sedes y capacidades.
2. No se crea ningun contrato cross-module nuevo.
3. No se modifica la estrategia tenant-aware ni el uso de `runInTenantSchema()`.
4. No se reemplaza `@Roles(UserRole.*)` ni el permiso granular existente para mutaciones de sedes.

---

## Consecuencias

### Positivas

- una sola accion del usuario genera una sola persistencia principal;
- menor friccion en portal;
- menor riesgo de exito parcial;
- auditoria mas coherente con la intencion de negocio;
- simplificacion visible de `/dashboard/settings/organization`.

### Costos y tradeoffs

- requiere extender DTOs y clientes tipados;
- obliga a ajustar tests HTTP, unitarios y E2E;
- obliga a retirar contratos y mocks legacy una vez completada la migracion de consumidores conocidos.

### Riesgos aceptados

- necesidad de definir con precision la semantica de `capabilities` omitido vs `capabilities: []` en `PATCH`.

---

## Alternativas consideradas

### A1. Mantener el panel lateral y el endpoint separado

Descartada. Conserva la deuda UX y el doble guardado.

### A2. Guardado secuencial desde el mismo modal

Descartada. Sigue permitiendo persistencia parcial y no resuelve atomicidad.

### A3. Modal unificado con payload unico y transaccion unica

Elegida. Es la opcion mas consistente con la intencion del usuario y con el modelo tenant-aware actual.

---

## Impacto de implementacion

- `apps/api/src/modules/organization/dto/organization-site.dto.ts`
- `apps/api/src/modules/organization/organization.controller.ts`
- `apps/api/src/modules/organization/organization.service.ts`
- `apps/portal/src/lib/api-client.ts`
- `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`
- specs HTTP, unitarios de portal y E2E de settings.

---

## Estado de aprobacion

Este ADR queda **Aprobado e implementado**. No requiere cambio de stack ni escalacion por conflicto de ownership, y su cierre incluye el retiro efectivo del endpoint legacy de capacidades tras validar el flujo unificado del portal.

> Nota de vocabulario (ADR-056, 2026-07-19): la cabecera decia "Aceptado", lexico fuera del vocabulario canonico del protocolo §7.4 (Aprobado / En revision / Propuesto / Superado), lo que hacia indeterminable si confería autoridad. Normalizado a **Aprobado** sin cambio de contenido ni de fecha.
