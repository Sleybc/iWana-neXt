# PRD - MOD00 Configuracion Control Plane

**Version:** 1.2
**Estado:** Aprobado  
**Fecha:** 2026-05-22
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD00 Configuracion Control Plane  
**ADR aprobado:** docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md  
**HLD relacionado:** docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**Antecedente historico:** docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md  
**PRDs relacionados:** docs/prds/PRD-MOD04-USUARIOS-INTERNOS-v1.1.md, docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md, docs/prds/PRD-MOD06-COMERCIAL-DEFINICION-v1.0.md

> Este PRD inaugura MOD00 como modulo rector de Configuracion Control Plane. No elimina MOD03 Configuracion Empresarial v1.1: lo conserva como antecedente historico y linea legacy de perfil/settings/cobertura inicial.

---

## 1. Contexto y problema

Configuracion Empresarial v1.1 resolvio datos base del tenant, settings operativos, cobertura comercial y planes historicos. Con la evolucion del producto, varias responsabilidades cambiaron de lugar:

- Commercial es ahora owner de catalogo y precios.
- WFM es owner de agenda y Work Orders.
- Parties es owner de terceros multi-rol.
- Users es owner de cuentas autenticadas con `UserRole` fijo.
- Inventory, Billing y RRHH entraran como modulos futuros.

El usuario necesita una experiencia simple: entrar a Configuracion y encontrar todo ordenado. Pero el sistema necesita evitar un modulo central que posea datos de todos los dominios.

Problemas actuales:

1. Las sedes WFM ya no representan solo bases de despacho; tambien pueden ser oficinas, bodegas, puntos de atencion, recaudo o NOC.
2. Cada modulo futuro podria crear su propia version de sede, responsable, horario o asignacion si no se define un maestro transversal.
3. Los roles fijos actuales no permiten perfiles configurables por tenant ni acceso granular por modulo.
4. La pantalla de settings puede volverse una lista densa de managers sin arquitectura de informacion.

Objetivo del PRD:

Definir MOD00 Configuracion como **control plane federado** del tenant, con Organizacion/Sedes como primera gran seccion y Usuarios/Acceso como pilar transversal, manteniendo ownership de datos operativos en sus modulos.

---

## 2. Alcance

### En scope

- Nueva arquitectura de Configuracion como centro administrativo del tenant.
- Seccion **Organizacion** con sedes/ubicaciones, capacidades, horarios institucionales, responsables y asignaciones de usuarios.
- Seccion **Usuarios y acceso** con usuarios, roles base, perfiles configurables y permisos por modulo.
- Catalogo inicial de permisos por modulo para Configuracion, Organizacion, Users, WFM, CRM, Commercial, Assurance, Inventory y Billing futuro.
- Migracion aditiva de WFM para consumir sedes organizacionales en una fase posterior.
- UI de portal organizada por secciones y subrutas, no una unica pantalla sobrecargada.
- Auditoria de cambios sensibles en sedes, horarios, responsables, perfiles y permisos.
- Contratos backend tenant-aware con validacion Zod y OpenAPI.

### Fuera de scope

- Implementacion completa de Inventory, Billing, RRHH o NMS.
- Reemplazo total inmediato de `UserRole` por permisos dinamicos.
- Eliminacion inmediata de `WfmOperatingSite`.
- Motor avanzado de aprobaciones para cambios de configuracion.
- Integracion LDAP, AD, SAML u OIDC.
- Recaudo real de caja, kardex de inventario o evaluacion formal de productividad.
- Crear roles backend dinamicos desde UI.

### Decision de boundary

- Configuracion administra la experiencia y los datos maestros transversales aprobados.
- Organizacion/Sedes es dato maestro transversal administrado desde Configuracion.
- Usuarios y acceso configura perfiles sobre roles base, pero Users/Auth siguen siendo owners de identidad, login y cuenta autenticada.
- WFM, Inventory, Billing, Commercial y Assurance no leen tablas de Configuracion directamente; consumen puertos o eventos.

---

## 3. Personas y casos de uso

| Persona                 | Rol base                         | Necesidad                                                                               |
| ----------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| Administrador empresa   | ADMIN                            | Configurar organizacion, sedes, usuarios, perfiles y acceso a modulos                   |
| Coordinador operaciones | NOC / SUPPORT                    | Consultar sedes, horarios y responsables; configurar reglas operativas si tiene permiso |
| Responsable inventario  | ADMIN / futuro INVENTORY_MANAGER | Ver bodegas/sedes y responsables de inventario                                          |
| Responsable recaudo     | ACCOUNTANT                       | Consultar o administrar sedes con capacidad de recaudo segun perfil                     |
| Tecnico                 | TECHNICIAN                       | Ver sus asignaciones, sede base y acceso operativo permitido                            |
| RRHH futuro             | HR                               | Relacionar empleados con sede, cargo, area y horarios laborales                         |

Casos de uso prioritarios:

1. El ADMIN crea una sede con capacidades de bodega y despacho tecnico.
2. El ADMIN define horario institucional de la sede.
3. El ADMIN asigna responsables: inventario, recaudo, operacion y administracion.
4. El ADMIN asigna usuarios a una sede.
5. El ADMIN crea un perfil `Tecnico instalador fibra` con permisos WFM especificos.
6. El ADMIN asigna el perfil a usuarios con rol base `TECHNICIAN`.
7. WFM consume sedes organizacionales para seleccionar sede de despacho.
8. Inventory futuro consume sedes con capacidad `WAREHOUSE`.
9. Billing futuro consume sedes con capacidad `COLLECTION_POINT`.

---

## 4. Requerimientos funcionales

### 4.1 Control plane de Configuracion

| ID        | Requerimiento                                                                                                                                         | Prioridad |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-CFG-01 | La ruta `/dashboard/settings` debe actuar como centro de configuracion con secciones visibles y navegables.                                           | MVP       |
| RF-CFG-02 | La navegacion debe separar Organizacion, Usuarios y acceso, Seguridad, Marca, Operacion de campo, Comercial, Facturacion, Inventario e Integraciones. | MVP       |
| RF-CFG-03 | Las secciones futuras pueden mostrarse como no disponibles si su modulo aun no existe, sin simular funcionalidad.                                     | MVP       |
| RF-CFG-04 | Cada seccion debe declarar el modulo owner de los datos que administra o consume.                                                                     | MVP       |

### 4.2 Organizacion y sedes

| ID        | Requerimiento                                                                                                                                            | Prioridad |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-ORG-01 | El tenant puede crear, editar, activar/desactivar y consultar sedes organizacionales.                                                                    | MVP       |
| RF-ORG-02 | Una sede debe tener nombre, codigo, tipo principal, direccion opcional, municipio, departamento, pais, coordenadas opcionales y estado.                  | MVP       |
| RF-ORG-03 | Una sede puede tener multiples capacidades: `CUSTOMER_SERVICE`, `TECH_DISPATCH`, `WAREHOUSE`, `COLLECTION_POINT`, `ADMIN_OFFICE`, `NOC`, `SALES_OFFICE`. | MVP       |
| RF-ORG-04 | El sistema debe permitir marcar una sede principal del tenant.                                                                                           | MVP       |
| RF-ORG-05 | El sistema debe definir horarios institucionales por sede y dia de semana.                                                                               | MVP       |
| RF-ORG-06 | El sistema debe permitir asignar responsables por tipo: administrativo, inventario, recaudo, operacion y atencion.                                       | MVP       |
| RF-ORG-07 | El sistema debe permitir asignar usuarios a sede con vigencia y rol operativo local.                                                                     | MVP       |
| RF-ORG-08 | Toda escritura sobre sedes, capacidades, horarios o responsables debe auditarse.                                                                         | MVP       |

### 4.3 Usuarios, perfiles y permisos

| ID        | Requerimiento                                                                                                                                                                    | Prioridad |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-ACC-01 | Configuracion debe mostrar roles base del sistema como solo lectura operacional.                                                                                                 | MVP       |
| RF-ACC-02 | El tenant puede crear perfiles configurables basados en permisos permitidos.                                                                                                     | MVP       |
| RF-ACC-03 | Un perfil debe tener nombre, descripcion, estado, permisos y alcance opcional por sede.                                                                                          | MVP       |
| RF-ACC-04 | Un usuario puede tener uno o mas perfiles dentro del tenant.                                                                                                                     | MVP       |
| RF-ACC-05 | Los permisos deben declararse por modulo con claves estables tipo `wfm.schedule.manage`.                                                                                         | MVP       |
| RF-ACC-06 | El backend debe impedir asignar permisos incompatibles con el rol base del usuario.                                                                                              | MVP       |
| RF-ACC-07 | Cambios de perfiles y asignaciones deben auditar oldValue/newValue.                                                                                                              | MVP       |
| RF-ACC-08 | La UI no debe permitir crear roles backend dinamicos equivalentes a `UserRole`.                                                                                                  | MVP       |
| RF-ACC-09 | El catalogo inicial de permisos debe versionarse como `MOD00_ACCESS_V1` y distinguir permisos asignables de permisos reservados.                                                 | MVP       |
| RF-ACC-10 | En Fase 01, todo perfil configurable tenant-created debe declarar `baseRoleConstraint`; el backend valida permisos contra ese rol y contra el rol real del usuario al asignarlo. | MVP       |

Aclaraciones operativas obligatorias del dominio de acceso:

- el gobierno operativo del tenant recae en usuarios con rol base `ADMIN`;
- el administrador del tenant debe poder crear usuarios internos, organizar perfiles configurables y asignar acceso a modulos usando permisos compatibles con el rol base;
- dar acceso a un modulo significa asignar perfiles y permisos del catalogo aprobado, no crear roles backend dinamicos ni depender del ocultamiento en UI para autorizar acciones.

Reglas de seguridad para Fase 01:

- Un permiso desconocido o no incluido en `MOD00_ACCESS_V1` se rechaza con error de validacion.
- Un permiso en estado `RESERVED` puede mostrarse como ruta futura, pero no puede asignarse a perfiles.
- Un perfil solo puede contener permisos compatibles con su `baseRoleConstraint`.
- Un usuario solo puede recibir perfiles cuyo `baseRoleConstraint` coincida con su `UserRole` base.
- Un perfil configurable no sustituye el rol base `ADMIN` en endpoints de gobierno del tenant.
- `SYSTEM_ADMIN` e `IWANA_SUPPORT` son roles de plataforma y no se asignan desde portal tenant.
- `SUBSCRIBER`, `PARTNER` e `INVESTOR` quedan fuera de perfiles administrativos MOD00 en Fase 01.

### 4.3.1 Addendum de refinamiento post-ejecucion 2026-05-22

Tras revisar la ejecucion de Fase 01-05 y validar la aclaracion de negocio, se fija la siguiente lectura operativa para Fullstack:

- `ADMIN` es el gobernador operativo del tenant para usuarios, perfiles y acceso modular.
- Los perfiles configurables refinan el acceso dentro del rol base compatible; no reemplazan RBAC base.
- La asignacion de acceso a usuarios debe considerarse una operacion distinta del CRUD del catalogo de perfiles en el siguiente hardening aprobado.
- El shell federado de settings debe exponer solo superficies operables para el usuario segun permisos efectivos o estado no operable explicito.
- El alcance por sede de perfiles (`scope_site_id`) debe aplicarse en la resolucion efectiva de permisos antes de considerar cerrada la capacidad.

### 4.4 Integracion con WFM

| ID            | Requerimiento                                                                                            | Prioridad |
| ------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| RF-WFM-CFG-01 | WFM debe poder listar sedes organizacionales activas con capacidad `TECH_DISPATCH`.                      | MVP       |
| RF-WFM-CFG-02 | La migracion desde `WfmOperatingSite` a `OrganizationSite` debe ser aditiva y reversible.                | MVP       |
| RF-WFM-CFG-03 | WFM conserva reglas de ventana de despacho, overrides y Work Orders.                                     | MVP       |
| RF-WFM-CFG-04 | La UI de Operacion de campo debe moverse progresivamente a una seccion dedicada dentro de Configuracion. | MVP       |

---

## 5. Requerimientos no funcionales

| Categoria      | Requerimiento                                                                        |
| -------------- | ------------------------------------------------------------------------------------ |
| Seguridad      | JWT, TenantMiddleware, RBAC base y permisos granulares validados en backend.         |
| Multi-tenancy  | Tablas tenant-aware resueltas por `SET LOCAL search_path`; sin tenant hardcodeado.   |
| Auditoria      | Retencion segun politica vigente; oldValue/newValue sin secretos ni PII innecesaria. |
| Performance    | Listados de sedes y perfiles < 200 ms p95 con 200 registros por tenant.              |
| Mantenibilidad | Configuracion no debe importar internals de modulos consumidores.                    |
| UX             | Pantallas densas pero escaneables, con subrutas y estados claros.                    |
| Accesibilidad  | Cumplimiento WCAG AA en formularios, tablas, tabs y modales.                         |
| Testing        | Unit + HTTP para backend, Jest frontend para helpers, Playwright para flujos ADMIN.  |

---

## 6. Modelo conceptual

### 6.1 Entidades de Organizacion

| Entidad                              | Responsabilidad                                       |
| ------------------------------------ | ----------------------------------------------------- |
| `organization_sites`                 | Dato maestro de sede o ubicacion operativa del tenant |
| `organization_site_capabilities`     | Capacidades habilitadas por sede                      |
| `organization_site_business_hours`   | Horario institucional por sede y dia                  |
| `organization_site_assignments`      | Vinculo usuario-sede con vigencia y funcion local     |
| `organization_site_responsibilities` | Responsable por tipo de responsabilidad               |

### 6.2 Entidades de Acceso

| Entidad                      | Responsabilidad                            |
| ---------------------------- | ------------------------------------------ |
| `access_permission_catalog`  | Catalogo versionado de permisos por modulo |
| `access_profiles`            | Perfil configurable por tenant             |
| `access_profile_permissions` | Permisos habilitados en cada perfil        |
| `user_access_profiles`       | Asignacion de perfiles a usuarios          |

### 6.3 Separacion de conceptos

| Concepto                     | Owner                        |
| ---------------------------- | ---------------------------- |
| Cuenta autenticada           | Users/Auth                   |
| Rol base del sistema         | Shared/Auth/Users            |
| Perfil configurable          | Configuracion/Access Control |
| Tercero empleado/contratista | Parties + RRHH futuro        |
| Sede organizacional          | Configuracion/Organizacion   |
| Ventana de despacho tecnico  | WFM                          |
| Inventario fisico            | Inventory futuro             |
| Recaudo/caja                 | Billing futuro               |

---

## 7. UX objetivo

Configuracion debe evolucionar de tabs simples hacia una estructura de centro administrativo:

```text
/dashboard/settings
  /organization
    /company
    /sites
    /sites/[siteId]
    /hours
    /responsibilities
  /access
    /users
    /profiles
    /permissions
  /security
  /branding
  /field-operations
  /commercial
  /billing
  /inventory
  /integrations
```

MVP recomendado:

1. Mantener `/dashboard/settings` como entrada.
2. Crear seccion `Organizacion` con sedes y horarios institucionales.
3. Crear seccion `Usuarios y acceso` con perfiles configurables iniciales.
4. Reubicar visualmente WFM como `Operacion de campo`, aunque siga consumiendo endpoints WFM.
5. Mostrar modulos futuros como tarjetas de ruta futura, sin formularios falsos.

---

## 8. Criterios de aceptacion

1. El ADR-040 y este PRD quedan aprobados sin conflictos con ADR-030 ni ADR-037.
2. El fullstack puede ejecutar Fase 01 sin decidir nuevamente boundaries.
3. Un ADMIN puede crear una sede, asignarle capacidades y horario institucional.
4. Un ADMIN puede crear un perfil de acceso y asignarlo a un usuario.
5. Un usuario sin permiso de gestion no puede mutar sedes ni perfiles aunque manipule el frontend.
6. WFM puede consultar sedes de despacho por puerto sin leer tablas directamente.
7. La UI de Configuracion distingue owner de datos y no mezcla inventario, recaudo o Work Orders dentro de sedes.
8. Toda mutacion relevante queda auditada.

---

## 9. Riesgos y mitigaciones

| Riesgo                                        | Impacto | Mitigacion                                                    |
| --------------------------------------------- | ------- | ------------------------------------------------------------- |
| Configuracion se vuelve modulo dios           | Alto    | ADR-040 fija control plane federado y ownership distribuido   |
| Permisos dinamicos debilitan seguridad        | Alto    | Mantener `UserRole` base y permisos como refinamiento backend |
| Duplicidad temporal de sedes WFM/Organizacion | Medio   | Migracion aditiva con mapping y compatibilidad por fases      |
| UI de settings demasiado densa                | Medio   | Subrutas y managers dedicados por seccion                     |
| Modulos futuros piden campos no previstos     | Medio   | Capacidades extensibles y puertos por modulo                  |

---

## 10. Handoff

### 10.1 Roadmap de fases

| Fase    | Objetivo            | Resultado esperado                                                                                                |
| ------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Fase 01 | Fundacion MOD00     | Organizacion/Sedes, perfiles de acceso, tablas tenant-aware, backend, portal y pruebas focalizadas                |
| Fase 02 | Integracion WFM     | WFM consume `OrganizationSiteReadPort`, mapea sedes legacy y evita nuevas sedes operativas duplicadas             |
| Fase 03 | Settings por modulo | Configuracion muestra secciones federadas para Commercial, WFM, Inventory y Billing sin poseer sus datos internos |
| Fase 04 | Gobierno avanzado   | Auditoria enriquecida, checklist de cambios sensibles, permisos granulares por pantalla y hardening operativo     |

Fase 01 es la unica autorizada para ejecucion inmediata. Las fases posteriores requieren validacion de alcance antes de tocar codigo.

Para aprobacion CTO:

- Revisar ADR-040.
- Validar que MOD00 puede introducir Organizacion/Sedes y Access Profiles como capacidades transversales administradas desde Configuracion.
- Confirmar que WFM migrara sedes de forma aditiva.

Para ejecucion fullstack:

- Usar HLD MOD00 v1.0 como arquitectura tecnica.
- Usar plan `docs/plans/2026-05-19-mod00-configuracion-control-plane.md`.
- Usar prompt `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-01-v1.0.md`.
- Usar checklist `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-01-v1.0.md` como gate de calidad.

Artefactos operativos por fase posterior:

| Fase    | Plan                                                                      | Prompt                                                    | Checklist                                                    |
| ------- | ------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| Fase 02 | `docs/plans/2026-05-19-mod00-configuracion-fase-02-wfm-integration.md`    | `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-02-v1.0.md` | `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-02-v1.0.md` |
| Fase 03 | `docs/plans/2026-05-19-mod00-configuracion-fase-03-settings-federados.md` | `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-03-v1.0.md` | `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-03-v1.0.md` |
| Fase 04 | `docs/plans/2026-05-19-mod00-configuracion-fase-04-gobierno-avanzado.md`  | `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-04-v1.0.md` | `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-04-v1.0.md` |
