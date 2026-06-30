# Design — MOD00 configuracion fase 01 organizacion y acceso

**Version:** 1.0
**Estado:** Aprobado para ejecucion
**Fecha:** 2026-05-21
**Modo activo:** Mixto
**Origen:** Conversacion de ejecucion sobre `PROMPT-MOD00-CONFIGURACION-FASE-01-v1.0.md`
**ADR rector:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
**PRD rector:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**HLD relacionado:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**Plan relacionado:** `docs/plans/2026-05-19-mod00-configuracion-control-plane.md`

---

## 1. Objetivo

Implementar la Fase 01 de MOD00 como control plane federado tenant-aware con dos capacidades nuevas administradas desde Configuracion:

1. **Organizacion/Sedes** como dato maestro transversal del tenant.
2. **Usuarios y acceso** mediante perfiles configurables sobre `UserRole` base.

La fase entrega tablas tenant-aware, API REST, UI de portal y validaciones de seguridad sin romper boundaries con WFM, Users, Parties, Inventory, Billing, Commercial o Assurance.

---

## 2. Alcance aprobado

### Entra en Fase 01

- CRUD y consulta de sedes organizacionales.
- Capacidades por sede, horario institucional, responsables y asignaciones basicas.
- Catalogo `MOD00_ACCESS_V1` versionado.
- CRUD y asignacion de perfiles configurables con `baseRoleConstraint`.
- Secciones `Organizacion` y `Usuarios y acceso` dentro de `/dashboard/settings`.
- Puerto `OrganizationSiteReadPort` preparado para consumo futuro de WFM.
- Tests backend, frontend focalizado y Playwright del flujo ADMIN.
- Actualizacion del informe vivo de MOD00 al cierre.

### No entra en Fase 01

- Migracion completa de WFM fuera de `WfmOperatingSite`.
- Nuevos roles backend dinamicos.
- Implementacion real de Inventory, Billing, HR, NMS o recaudo.
- `PermissionsGuard` global para todos los endpoints del sistema.
- LDAP, AD, SAML u OIDC.

---

## 3. Boundaries y ownership

### 3.1 Ownership

- **MOD00 / Configuracion**: owner de `OrganizationSite`, `AccessProfile` y del catalogo de permisos de tenant para Fase 01.
- **Users/Auth**: owner de cuenta autenticada, `UserRole`, login, MFA y sesion.
- **Audit**: owner de la auditoria transversal; MOD00 solo integra las mutaciones.
- **WFM**: owner de agenda, ventanas de despacho, Work Orders y reglas de operacion de campo.
- **Parties**: owner de identidad de negocio y `PartyRole`.

### 3.2 Reglas de boundary

1. Configuracion no lee tablas internas de WFM, Inventory, Billing, Commercial, Assurance, Users o Parties por acceso directo.
2. WFM no lee tablas de Organizacion; consumira `OrganizationSiteReadPort`.
3. `AccessProfile` no reemplaza `UserRole`; lo complementa.
4. `PartyRole` y `AccessProfile` son conceptos distintos y no se mezclan.
5. Todas las tablas nuevas viven en schema tenant y se resuelven con `SET LOCAL search_path`.

---

## 4. Arquitectura de implementacion

### 4.1 Estructura propuesta

```text
packages/shared/
  src/enums/organization/
  src/enums/access-control/

packages/database/
  src/entities/organization-*.entity.ts
  src/entities/access-*.entity.ts
  src/migrations/tenant/037_create_configuration_control_plane.ts

apps/api/src/modules/
  organization/
    organization.module.ts
    organization.controller.ts
    dto/
    schemas/
    services/
    ports/organization-site-read.port.ts
  access-control/
    access-control.module.ts
    access-control.controller.ts
    dto/
    schemas/
    services/

apps/portal/src/
  app/dashboard/settings/organization/page.tsx
  app/dashboard/settings/access/page.tsx
  components/organization/
  components/access-control/
```

### 4.2 Decision de diseño

Se elige una implementacion con **modulos Nest separados** para `OrganizationModule` y `AccessControlModule`.

Motivos:

1. Encaja con el HLD actualizado.
2. Mantiene boundaries internos claros dentro de MOD00.
3. Reduce el riesgo de convertir `ConfigurationModule` en contenedor de logica mezclada.
4. Permite preparar el puerto de WFM sin adelantar la migracion funcional.

---

## 5. Modelo de datos

### 5.1 Organizacion

#### `organization_sites`

- `tenant_id`
- `name`
- `code`
- `site_type`
- `address`
- `municipality`
- `department`
- `country`
- `latitude`
- `longitude`
- `is_primary`
- `is_active`
- `created_at`
- `updated_at`
- `deleted_at`

Reglas:

- `code` unico por tenant entre registros activos.
- Maximo una sede primaria activa por tenant.
- Sin PII innecesaria.

#### `organization_site_capabilities`

- `tenant_id`
- `site_id`
- `capability`
- `is_enabled`

Capacidades iniciales:

- `CUSTOMER_SERVICE`
- `TECH_DISPATCH`
- `WAREHOUSE`
- `COLLECTION_POINT`
- `ADMIN_OFFICE`
- `NOC`
- `SALES_OFFICE`

#### `organization_site_business_hours`

- `tenant_id`
- `site_id`
- `weekday`
- `opens_at`
- `closes_at`
- `is_open`

Reglas:

- una fila activa por `tenant_id + site_id + weekday`;
- si `is_open = false`, el dia queda cerrado;
- si `is_open = true`, `opens_at < closes_at`.

#### `organization_site_assignments`

- `tenant_id`
- `site_id`
- `user_id`
- `assignment_type`
- `valid_from`
- `valid_to`
- `is_active`

#### `organization_site_responsibilities`

- `tenant_id`
- `site_id`
- `responsibility`
- `user_id`
- `valid_from`
- `valid_to`

Responsabilidades iniciales:

- `ADMINISTRATIVE`
- `INVENTORY`
- `COLLECTION`
- `FIELD_OPERATIONS`
- `CUSTOMER_SERVICE`

### 5.2 Access control

#### `access_permission_catalog`

- `permission_key`
- `module_key`
- `action`
- `description`
- `catalog_version`
- `availability`
- `is_system`
- `is_active`

Reglas:

- catalogo inicial `MOD00_ACCESS_V1`;
- `availability` solo puede ser `ASSIGNABLE` o `RESERVED`;
- permisos `RESERVED` no se pueden persistir en perfiles.

#### `access_profiles`

- `tenant_id`
- `name`
- `description`
- `base_role_constraint`
- `scope_site_id`
- `is_system`
- `is_active`
- `created_at`
- `updated_at`
- `deleted_at`

Reglas:

- nombre unico por tenant activo;
- en Fase 01 todo perfil tenant-created debe declarar `baseRoleConstraint`;
- `scope_site_id` es opcional y acota el perfil a una sede.

#### `access_profile_permissions`

- `tenant_id`
- `profile_id`
- `permission_key`

#### `user_access_profiles`

- `tenant_id`
- `user_id`
- `profile_id`
- `assigned_at`
- `expires_at`
- `is_active`

### 5.3 Indices y constraints minimos

- `organization_sites(tenant_id, code)` unico activo.
- `organization_site_capabilities(tenant_id, site_id, capability)` unico.
- `organization_site_business_hours(tenant_id, site_id, weekday)` unico.
- `access_profiles(tenant_id, name)` unico activo.
- `access_profile_permissions(tenant_id, profile_id, permission_key)` unico.
- `user_access_profiles(tenant_id, user_id, profile_id)` unico cuando `is_active = true`.

---

## 6. Catalogo de permisos y compatibilidad

### 6.1 Regla operacional

El backend valida compatibilidad en dos momentos:

1. al crear o editar un perfil contra su `baseRoleConstraint`;
2. al asignar un perfil a un usuario contra el `UserRole` real del usuario.

### 6.2 Reglas minimas de Fase 01

- `ADMIN` puede recibir perfiles administrativos de MOD00.
- `NOC`, `SUPPORT`, `ACCOUNTANT`, `HR` y `TECHNICIAN` solo reciben perfiles compatibles con su rol base.
- `SYSTEM_ADMIN` e `IWANA_SUPPORT` no participan en perfiles tenant.
- `SUBSCRIBER`, `PARTNER` e `INVESTOR` quedan fuera del alcance administrativo de MOD00 en Fase 01.
- Un permiso desconocido, `RESERVED` o incompatible produce rechazo explicito.

### 6.3 Forma del catalogo

`MOD00_ACCESS_V1` se modela como seed versionado compartido entre backend y portal mediante enums o constantes exportadas desde `@iwana/shared`.

La UI puede mostrar permisos `RESERVED`, pero siempre deshabilitados y marcados como ruta futura.

---

## 7. API y validacion

### 7.1 Organization API

- `GET /organization/sites`
- `POST /organization/sites`
- `PATCH /organization/sites/:id`
- `GET /organization/sites/:id`

Autorizacion:

- lectura: `ADMIN`, `NOC`, `SUPPORT`, `ACCOUNTANT`, `HR`;
- mutacion: `ADMIN`.

Validaciones relevantes:

- `name` entre 2 y 160 caracteres;
- `code` entre 2 y 40 caracteres, normalizado;
- `country` ISO de 2 letras;
- `latitude` entre `-90` y `90`;
- `longitude` entre `-180` y `180`.

### 7.2 Access control API

- `GET /access-control/permissions`
- `GET /access-control/profiles`
- `POST /access-control/profiles`
- `PATCH /access-control/profiles/:id`
- `PUT /access-control/users/:userId/profiles`

Autorizacion:

- lectura: `ADMIN`;
- mutacion: `ADMIN`.

Validaciones relevantes:

- rechazo de permisos fuera de `MOD00_ACCESS_V1`;
- rechazo de permisos `RESERVED`;
- rechazo de perfiles sin `baseRoleConstraint`;
- rechazo de asignaciones con rol base incompatible.

### 7.3 Multi-tenancy y errores

- Nunca se recibe `tenantId` por body o query para persistencia.
- `TenantContext.getOrThrow()` resuelve tenant actual.
- Cada operacion usa helpers aprobados de `search_path`.
- Errores funcionales esperados:
  - `400` por payload invalido o permiso incompatible;
  - `403` por rol base insuficiente;
  - `404` por recurso inexistente;
  - `409` por unicidad activa violada.

---

## 8. UI de portal

### 8.1 Navegacion

`/dashboard/settings` mantiene la entrada principal y expone:

- `Organizacion`
- `Usuarios y acceso`
- `Seguridad`
- `Marca`
- `Operacion de campo`
- `Facturacion`
- `Inventario`
- `Integraciones`

Las secciones futuras se muestran como roadmap sin funcionalidad simulada.

### 8.2 Seccion Organizacion

Entrega MVP:

- tabla de sedes;
- filtros basicos por estado y capacidad;
- dialogo crear/editar sede;
- edicion de capacidades;
- editor de horario institucional.

### 8.3 Seccion Usuarios y acceso

Entrega MVP:

- tabla de perfiles;
- detalle del `baseRoleConstraint`;
- matriz de permisos por modulo;
- asignacion de perfiles a usuarios.

### 8.4 Reglas UX

- textos visibles en espanol y sentence case;
- tablas con `align-middle`;
- enums mapeados a labels legibles;
- backend sigue siendo la autoridad final de permisos;
- si un permiso no es asignable, la UI lo muestra deshabilitado.

---

## 9. Auditoria, seguridad y boundary checks

1. Toda mutacion de sedes, horarios, responsables, perfiles y asignaciones debe auditarse.
2. `oldValue/newValue` no debe incluir secretos ni PII innecesaria.
3. No se crean roles dinamicos equivalentes a `UserRole`.
4. No se escribe informacion falsa de Inventory, Billing o HR para “completar” la UI.
5. WFM solo queda preparado para consumir sedes por puerto; no se toca ownership de Work Orders.

---

## 10. Testing

### 10.1 Backend

- unit tests para servicios de organizacion y access control;
- HTTP tests para:
  - crear sede con `ADMIN`;
  - listar sede con `NOC` o `SUPPORT`;
  - bloquear mutacion por rol insuficiente;
  - rechazar permisos incompatibles;
  - validar aislamiento tenant-aware.

### 10.2 Frontend

- Jest focalizado para labels, adaptadores y estados de componentes;
- validacion de render de tablas, disabled states y matriz de permisos.

### 10.3 E2E

Playwright debe cubrir el flujo ADMIN:

1. ingresar a settings;
2. crear sede;
3. configurar horario institucional;
4. crear perfil compatible;
5. asignar perfil a un usuario.

---

## 11. Criterios de salida de diseño

El diseño queda listo para implementacion si:

1. se mantiene dentro del prompt de Fase 01;
2. no contradice ADR-040, PRD ni HLD actualizados del 2026-05-21;
3. deja explicita la separacion entre `UserRole`, `AccessProfile` y `PartyRole`;
4. no introduce lectura directa de tablas de otros modulos;
5. deja documentado que WFM solo consumira el puerto preparado en una fase posterior.
