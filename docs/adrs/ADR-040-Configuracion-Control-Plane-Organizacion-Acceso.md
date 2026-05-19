# ADR-040: MOD00 Configuracion como control plane federado, Organizacion/Sedes y perfiles de acceso

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-19  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD00 Configuracion Control Plane v1.0  
**Aprobado por:** CTO Humano  
**PRD relacionado:** docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md

---

## Contexto

MOD03 Configuracion Empresarial v1.1 resolvio perfil empresarial, settings operativos, cobertura comercial y planes iniciales sobre contratos self-service del tenant. Tras aprobacion CTO, ese antecedente queda como linea historica: el control plane transversal nuevo se formaliza como **MOD00 Configuracion**. Desde entonces el sistema evoluciono:

- MOD06 Commercial fue extraido como bounded context propio para catalogo, precios, bundles, promociones y reglas comerciales.
- MOD09 WFM creo agenda, Work Orders y horarios operativos con `WfmOperatingSite` como sede inicial de despacho.
- MOD04 Users conserva usuarios internos con `UserRole` fijo y dejo permisos granulares diferidos.
- MOD08 Parties separo identidad de negocio, cuenta autenticada y roles de tercero.

La vision de producto exige que Configuracion sea el centro donde el administrador del tenant ordena sedes, responsables, horarios, usuarios, perfiles y acceso a modulos. Al mismo tiempo, el modulith debe evitar que Configuracion se convierta en un modulo dios que posea datos operativos de WFM, Inventory, Billing, Commercial o Assurance.

El concepto actual de sede WFM ya no alcanza: una sede puede ser oficina, bodega, base tecnica, punto de atencion, NOC, caja de recaudo o combinacion de capacidades. La misma sede sirve para asignar empleados, custodiar inventario, habilitar recaudo, atender clientes y despachar ordenes de trabajo.

La autorizacion actual con `UserRole` fijo tampoco alcanza para escenarios operativos reales: el tenant necesita perfiles configurables por modulo sin permitir que usuarios creen roles backend arbitrarios que debiliten seguridad.

---

## Decision

Se adopta **MOD00 Configuracion Control Plane v1.0** como **control plane federado del tenant**.

### D1. Configuracion centraliza la experiencia, no todo el ownership

Configuracion sera la puerta de entrada visual y administrativa para:

- Organizacion y sedes.
- Usuarios y acceso.
- Seguridad.
- Modulos activos.
- Configuraciones por dominio.

Sin embargo, cada bounded context conserva ownership de sus datos operativos:

- WFM conserva agenda, Work Orders, ejecucion de campo, tiempos, evidencias y reglas de despacho.
- Inventory conserva stock, seriales, MACs, bodegas, activos y movimientos.
- Billing conserva facturacion, recaudo, caja, cartera y aplicacion financiera.
- Commercial conserva catalogo, precios, bundles, promociones y compatibilidad.
- Assurance conserva tickets, SLA y colas de soporte.

### D2. Organizacion/Sedes nace como capacidad transversal administrada desde Configuracion

Se introduce el subdominio **Organizacion/Sedes** dentro del programa MOD00. Su responsabilidad es el dato maestro de sedes y ubicaciones operativas del tenant:

- oficina;
- bodega;
- punto de atencion;
- base tecnica;
- punto de recaudo;
- NOC;
- sede administrativa;
- sede mixta con multiples capacidades.

Las entidades de sede viven en el schema tenant y se exponen mediante contratos propios. Otros modulos consumen sedes por puertos tipados o eventos, no por acceso directo a tablas.

### D3. WFM deja de ser owner conceptual de sede corporativa

`WfmOperatingSite` queda como implementacion transitoria de MOD09 Fase 01. La direccion aprobada para v2 es:

- `OrganizationSite` es el dato maestro de sede.
- WFM referencia `organizationSiteId` para agenda y despacho.
- WFM conserva solo reglas especificas de operacion de campo: ventana de despacho, overrides de tecnico, restricciones de agenda y validacion de Work Orders.

La migracion debe ser aditiva. No se elimina `WfmOperatingSite` hasta que WFM pueda leer sedes organizacionales y mapear las existentes sin perdida.

### D4. Usuarios y acceso se modela con rol base + perfiles configurables

El `UserRole` actual permanece como rol base del sistema y sigue protegiendo endpoints criticos con `@Roles(UserRole.*)`.

Se agregan **perfiles de acceso configurables por tenant**:

- un perfil agrupa permisos granulares;
- un usuario puede tener uno o mas perfiles;
- los permisos se declaran por modulo en un catalogo controlado por codigo o seed versionado;
- el tenant puede crear perfiles sobre permisos permitidos, pero no crear roles backend arbitrarios.

Ejemplo:

| Usuario | Rol base | Perfil configurable |
| --- | --- | --- |
| Admin tenant | `ADMIN` | Administrador general |
| Tecnico | `TECHNICIAN` | Tecnico instalador fibra |
| Soporte | `SUPPORT` | Mesa de ayuda nivel 1 |
| Contador | `ACCOUNTANT` | Recaudo sede centro |
| NOC | `NOC` | Monitor NMS solo lectura |

### D5. Permisos granulares son complemento, no reemplazo inmediato del RBAC actual

La Fase 01 debe mantener compatibilidad con guards actuales:

- `JwtAuthGuard` autentica;
- `TenantMiddleware` resuelve tenant;
- `RolesGuard` aplica rol base;
- futuras policies/guards de permisos refinan acciones dentro del rol.

No se habilita un bypass donde ocultar botones en frontend equivalga a autorizacion. Toda accion sensible debe validarse en backend.

---

## Alternativas consideradas

### A1. Mantener sedes dentro de WFM

Descartada como direccion definitiva. Sirve para la Fase 01 de WFM, pero no cubre inventario, recaudo, atencion al cliente, empleados ni horarios institucionales.

### A2. Convertir Configuracion en owner de todos los datos configurables

Descartada. Simplifica la UI aparente, pero rompe boundaries y crea un modulo dios. Aumenta acoplamiento con WFM, Inventory, Billing, Commercial y Assurance.

### A3. Crear Organizacion/Sedes y Access Control como capacidades administradas desde Configuracion

Elegida. Mantiene una experiencia simple para el usuario y conserva ownership correcto por dominio.

---

## Consecuencias

### Positivas

- El tenant administra sedes una sola vez y los modulos las consumen de forma consistente.
- WFM, Inventory y Billing no duplican oficinas, bodegas ni puntos de recaudo.
- Los permisos pueden crecer de RBAC fijo hacia perfiles configurables sin debilitar seguridad.
- Configuracion se vuelve una consola ordenada y escalable, no una coleccion de formularios inconexos.
- El diseño prepara RRHH, Inventario y Facturacion sin obligar a implementarlos en la primera fase.

### Costos y tradeoffs

- Requiere migracion aditiva de `WfmOperatingSite` hacia `OrganizationSite`.
- Requiere nuevas tablas tenant-aware para sedes, capacidades, horarios institucionales, perfiles y permisos.
- Requiere definir catalogo de permisos por modulo y estrategia de cache/invalidation.
- Requiere documentar claramente que Configuracion administra la experiencia, pero no reemplaza los boundaries de dominio.

### Riesgos aceptados

- Coexistencia temporal de sedes WFM y sedes organizacionales.
- En Fase 01, los permisos granulares pueden empezar como lectura/gestion de perfiles sin reemplazar todos los guards existentes.
- Algunos modulos futuros consumiran sedes mediante puertos que inicialmente seran adapters simples.

---

## Reglas de implementacion

1. No usar `tenant.settings` JSONB para modelar sedes, horarios institucionales, perfiles o permisos.
2. No crear roles backend dinamicos equivalentes a `UserRole` desde la UI del tenant.
3. Mantener `@Roles(UserRole.*)` en endpoints criticos; los permisos granulares solo refinan autorizacion.
4. No acceder directamente a tablas de WFM, Inventory, Billing, Commercial, Users o Parties desde Configuracion salvo mediante puertos aprobados.
5. Todas las tablas nuevas deben ser tenant-aware y resolverse por `SET LOCAL search_path`.
6. Todas las escrituras de organizacion, sedes, perfiles y permisos deben auditarse.
7. No persistir PII innecesaria en sedes ni permisos.
8. La migracion de sedes WFM debe ser aditiva, reversible y sin perdida de agenda historica.

---

## Impacto documental

- Nuevo PRD: docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- Nuevo HLD: docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- Nuevo plan: docs/superpowers/plans/2026-05-19-mod00-configuracion-control-plane.md
- Nuevo prompt: docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-01-v1.0.md
- Addendum de compatibilidad en spec WFM: docs/superpowers/specs/2026-05-15-mod09-wfm-operating-hours-design.md
- Informe MOD00 creado: docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- Informe vivo MOD03 actualizado como antecedente historico: docs/informes/INFORME-MOD03-AUDITORIA-ESTADO-v1.0.md

---

## Criterio de aprobacion CTO

La aprobacion CTO de este ADR autoriza al equipo a iniciar MOD00 Configuracion Control Plane Fase 01 con:

1. control plane de Configuracion en portal;
2. Organizacion/Sedes como primer subdominio transversal;
3. Usuarios y acceso con perfiles configurables sobre `UserRole` base;
4. migracion aditiva posterior de WFM hacia sedes organizacionales.

---

## Referencias

- AGENTS.md
- docs/prds/Stack_Tecnologico.md
- docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md (antecedente historico)
- docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md (antecedente historico)
- docs/prds/PRD-MOD04-USUARIOS-INTERNOS-v1.1.md
- docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
- docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
- docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md
- docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- docs/superpowers/specs/2026-05-15-mod09-wfm-operating-hours-design.md
