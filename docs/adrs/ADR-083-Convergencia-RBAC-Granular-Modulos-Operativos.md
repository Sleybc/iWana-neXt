# ADR-083: Convergencia RBAC granular — catalogo MOD00_ACCESS_V2 y cableado de modulos operativos

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-08-28
**Aprobado por:** CTO Humano (2026-08-28)
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Modulo:** MOD00 Configuracion Control Plane
**ADR base:** docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md (Aprobado)
**PRD relacionado:** docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md (v1.7)
**HLD relacionado:** docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md (v1.7)

---

## Contexto

ADR-040 (D4-D7) establecio el modelo de rol base `UserRole` + perfiles de acceso configurables con catalogo versionado `MOD00_ACCESS_V1`. La ejecucion a la fecha dejo este estado real:

1. **Doble sistema no convergido.** `PermissionsGuard` + `@Permissions()` operan en users, organization, tasks, configuration y access-control. Los modulos operativos construidos (CRM Suscriptores/Oportunidades, Assurance, Inventario/Compras, Comercial) siguen protegidos solo con listas `@Roles` planas duplicadas por endpoint.
2. **Claves operativas RESERVED.** Los 12 permisos de crm/commercial/assurance/inventory/billing de V1 estan `RESERVED` y no pueden asignarse a perfiles. El guard los rechaza (`PERMISSION_NOT_ASSIGNABLE_IN_PHASE`).
3. **Caso disparador imposible hoy.** "El tecnico de campo debe poder ver Suscriptores" requiere simultaneamente: permiso ASSIGNABLE, fila `TECHNICIAN` en la matriz de compatibilidad y `@Roles` que incluya `TECHNICIAN` en el controller. Ninguna de las tres condiciones existe. El PRD maestro (§13.3) y PRD-MOD05-CRM-SUBSCRIBERS (personas) si contemplan esa lectura.
4. **Baseline vacia para no-ADMIN.** `EffectivePermissionsService` otorga baseline estatica solo a ADMIN; los demas roles parten de permiso cero y solo ganan acceso por perfiles asignados. Cablear `@Permissions` en modulos operativos sin mas romperia el acceso vigente de NOC/SUPPORT/SALES/ACCOUNTANT/CONTRACTOR que hoy entra por `@Roles`.
5. **Naming desalineado.** La clave `crm.customers.*` fue nombrada para "expedientes CRM en fase futura"; el recurso real que el administrador ve en pantalla es "Suscriptores" (`/dashboard/crm/subscribers`), distinto de "Oportunidades" (`/dashboard/crm/expedientes`). La regla vigente del HLD-MOD00 §6.2 fija claves estables: no se renombran, se deprecian y crean nuevas.
6. **Modulo Billing inexistente.** No hay backend de billing; sus 4 claves RESERVED no tienen endpoints que proteger.
7. **Frontend desconectado del modelo.** El Sidebar del portal filtra por roles estaticos hardcodeados; solo el hub de Configuracion consume permisos efectivos. Un perfil que otorga acceso a un modulo no hace visible su menu.

Riesgo si no se decide: cada modulo nuevo duplica listas `@Roles` con drift, el admin del tenant no puede acotar accesos operativos reales, y el catalogo V1 acumula claves RESERVED cuyo significado ya no corresponde al producto.

---

## Decision

Se adopta la **convergencia RBAC granular** de los modulos operativos sobre la infraestructura MOD00 existente, bajo catalogo **`MOD00_ACCESS_V2`**, con las siguientes decisiones:

### D1. Catalogo MOD00_ACCESS_V2

- **Nuevas claves ASSIGNABLE** por recurso real: `crm.subscribers.read/manage`, `crm.expedientes.read/manage`, `inventory.purchasing.read/manage`.
- **Promocion RESERVED -> ASSIGNABLE** (nombre ya correcto): `commercial.catalog.read/manage`, `assurance.tickets.read/manage`, `inventory.stock.read/manage`.
- **Deprecacion** de `crm.customers.read/manage` (V1, nunca asignables; sin datos que migrar): filas de catalogo marcadas inactivas, claves conservadas en el enum por estabilidad.
- **`billing.*` permanece RESERVED** hasta que exista el modulo backend. No se promueven claves sin endpoints.

### D2. Patron de convergencia: doble guard

`RolesGuard` + `PermissionsGuard` operan juntos en los modulos cableados (patron ya productivo en users/tasks):

- `@Roles` es el **techo estructural** por categoria base: ningun permiso eleva a un rol por encima de lo que su categoria permite.
- `@Permissions` decide el **acceso efectivo** dentro de ese techo.
- **Regla de ampliacion de lectura:** un `@Roles` de endpoint de LECTURA puede ampliarse a una categoria base unicamente cuando el acceso queda controlado por un permiso granular ASSIGNABLE que exige perfil asignado. Los endpoints de escritura mantienen `@Roles` estricto como constraint adicional.

### D3. Matriz de compatibilidad V2 con tres ampliaciones deliberadas

1. `TECHNICIAN` + `crm.subscribers.read` — el caso piloto (PRD maestro §13.3; PRD-MOD05-CRM-SUBSCRIBERS personas: "Ver datos de contacto y direccion para instalacion").
2. `TECHNICIAN` + `inventory.stock.read` — PRD maestro §13.3 ("Inventory (lectura)").
3. `AUDITOR` + todos los `*.read` nuevos/promovidos — PRD maestro §13.3 ("Todos los modulos — solo lectura").

Ninguna ampliacion concede acceso automatico: exigen perfil asignado explicitamente por el ADMIN del tenant. La matriz completa y las plantillas estandar resultantes viven en el addendum §4.3.4 del PRD-MOD00 v1.7 (fuente normativa de detalle).

### D4. Plantillas estandar por categoria base y corte sin perdida

- Se siembran plantillas system **"Acceso estandar {Categoria}"** por cada rol con perfiles, replicando la union de lo que su `@Roles` permite hoy en los modulos cableados.
- En la migracion del corte, todo usuario activo no-ADMIN **sin perfiles activos** recibe automaticamente la plantilla estandar de su categoria. Criterio de negocio: **nadie pierde acceso que tenga vigente el dia del corte**.
- Mecanismo preferido: asignacion explicita en migracion tenant (auditable e inspeccionable en la UI). El mecanismo alternativo (fallback runtime: usuario sin perfiles hereda la matriz de su rol) queda documentado como opcion de reserva, no recomendada: desaparece silenciosamente al asignar cualquier perfil y dificulta razonar sobre accesos efectivos.
- El flujo de personalizacion del admin se conserva intacto: partir de una plantilla y modificar, o crear desde cero.

### D5. Cache de permisos efectivos

`EffectivePermissionsService` agrega cache Redis por `tenantId:userId` con TTL corto e invalidacion activa al mutar perfiles, permisos de perfil o asignaciones (los mismos puntos que hoy auditan). Cablear cinco superficies operativas multiplica las consultas por request; el cache pasa de deseable a requisito. La BD sigue siendo fuente de verdad.

### D6. Frontend derivado de permisos efectivos

La navegacion del portal (Sidebar) y los gates de pagina pasan de roles estaticos a permisos efectivos, siguiendo el patron `requiredPermissions` ya productivo en el hub de Configuracion. Prohibido ampliar permisos de backend desde la capa de presentacion (regla HLD-DE-06 del HLD-MOD02-DASHBOARD-EMPRESA v2.0).

### D7. Excepciones explicitas de este ciclo

- `subscriber-tax.controller` queda `@Roles`-only (sensibilidad fiscal; requiere decision de permiso propio en ciclo posterior).
- Los 2 endpoints de expedientes que hoy incluyen `TECHNICIAN` en `@Roles` (trabajo asignado) permanecen `@Roles`-only; la lectura acotada de expediente por tecnico que contempla PRD-MOD05 se atiende con scoping por asignacion en fase posterior, no con lectura global.
- Modulo media: fuera de alcance de este ciclo.

---

## Alternativas consideradas

### A1. Permisos efectivos como claims del JWT

Descartada para este ciclo. Elimina queries por request pero rompe la invalidacion inmediata al editar un perfil (requiere mecanismo de revocacion por version de permisos) y amplía superficie de seguridad sin necesidad presente. El cache Redis de D5 resuelve el costo de consulta sin tocar el token.

### A2. Baseline runtime por rol (matriz como grant automatico)

Descartada. Simplifica el corte pero el admin nunca puede retirar lo que la categoria trae de fabrica: la granularidad real queda limitada y el modelo "perfiles como unica via de grant para no-ADMIN" se degrada. Registrada como mecanismo de reserva de D4.

### A3. ABAC por filas/sede en este ciclo (ver solo lo suyo / solo su sede)

Descartada para ahora. Depende de que la convergencia basica exista primero. `scopeSiteId` ya persiste en `AccessProfile` y participa del enforcement; el scoping por asignacion queda como Fase 2.

---

## Consecuencias

### Positivas

- El admin del tenant controla accesos operativos reales por modulo (el caso "tecnico ve Suscriptores" pasa de imposible a configuracion).
- Se elimina el drift progresivo de listas `@Roles` duplicadas en modulos cableados: el permiso es la referencia y `@Roles` el techo.
- El corte no rompe operacion: plantillas estandar + asignacion automatica garantizan continuidad.
- El catalogo V2 alinea nombres de permiso con el vocabulario visible del producto.

### Costos y tradeoffs

- Migracion tenant numerada y reversible (catalogo V2 + plantillas estandar + asignaciones del corte) y re-seed autocurativo por tenant.
- Complejidad operativa transitoria: coexisten endpoints cableados y no cableados hasta converger los excluidos de D7.
- Cache Redis con invalidacion: nuevo componente de infraestructura en el camino critico de autorizacion (mitigado con TTL corto y fallback a BD).
- La pantalla `/dashboard/settings/access` crece en plantillas estandar visibles: requiere reordenamiento UX (spec de PROD-UX en Fase 3).

### Riesgos aceptados

- Ampliacion de `@Roles` de lectura a TECHNICIAN/AUDITOR: acotada a endpoints con permiso granular y sin efecto sin perfil asignado.
- Deprecacion de claves V1 `crm.customers.*`: sin impacto de datos (nunca fueron asignables).
- `baseRoleConstraint` invalida perfiles silenciosamente al cambiar la categoria de un usuario: riesgo preexistente; se documenta y la UI de usuarios debe advertirlo (Fase 3).

---

## Reglas de implementacion

1. Toda ampliacion de `@Roles` de lectura debe ir acompanada de `@Permissions(...)` con clave ASSIGNABLE V2 en el mismo endpoint; prohibido ampliar `@Roles` de escritura en este ciclo.
2. La matriz V2 y las plantillas estandar se definen en codigo versionado (`access-control.constants.ts`) y se siembran por tenant; la fuente normativa de detalle es el addendum §4.3.4 del PRD-MOD00 v1.7.
3. La migracion del corte es idempotente y reversible: down elimina asignaciones estandar creadas por la migracion y desactiva plantillas estandar y claves V2.
4. Invariantes de catalogo extendidos: claves usadas en `@Permissions` ⊆ catalogo activo; matriz ⊆ ASSIGNABLE; plantillas estandar ⊆ matriz de su categoria.
5. Toda mutacion de perfiles, permisos o asignaciones invalida el cache (D5) y audita `oldValue/newValue` como hoy.
6. No se retiran claves deprecadas del enum; se marcan `@deprecated` y sus filas de catalogo `isActive = false`.
7. Billing permanece RESERVED hasta ADR/PRD de su modulo.

---

## Impacto documental

- PRD-MOD00 v1.7: addendum §4.3.4 (matriz V2, plantillas estandar, RF-ACC-14..21).
- HLD-MOD00 v1.7: addendum §6.6 (enum, seed, cableado por controller, cache, corte, tests).
- Informe vivo MOD00 v1.75: registro de esta etapa.
- Specs UX de Fase 3 (nav por permisos y reordenamiento de plantillas): a emitir por AI-PROD-UX con contrato AI-DS-OWNER.

---

## Criterio de aprobacion CTO

**Aprobado por el CTO el 2026-08-28** (sin cambios de contenido respecto a la version propuesta). Las aprobaciones 1-5 quedan registradas. El G1 (review cruzado de factibilidad y viabilidad) continúa como control de ejecucion y no reabre la decision.

Este ADR toca superficie de autorizacion y amplia `@Roles` de lectura en endpoints operativos. Su aprobacion autoriza:

1. Catalogo MOD00_ACCESS_V2 (D1) con deprecacion de `crm.customers.*`.
2. El patron de doble guard con regla de ampliacion de lectura (D2).
3. Las tres ampliaciones deliberadas de matriz (D3).
4. Plantillas estandar con asignacion automatica en el corte (D4).
5. Cache Redis de permisos efectivos (D5).

Pendiente de G1 (review cruzado, no de CTO): confirmacion de factibilidad del mecanismo de asignacion masiva en migracion (D4) por AI-SR-FULL, y viabilidad UX del gating de navegacion (D6) por AI-PROD-UX.

---

## Referencias

- AGENTS.md
- docs/prds/Stack_Tecnologico.md
- docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- docs/adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md
- docs/adrs/ADR-045-Consolidacion-Politica-MFA-Global-en-Access.md
- docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md (v1.7)
- docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md (v1.7)
- docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md (§13.3)
- docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md
- docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md
