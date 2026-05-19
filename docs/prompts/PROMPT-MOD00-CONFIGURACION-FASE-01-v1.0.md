# PROMPT - MOD00 Configuracion Control Plane Fase 01

**Version:** 1.0  
**Estado:** Aprobado para ejecucion  
**Fecha:** 2026-05-19  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** 01 - Organizacion/Sedes y Usuarios/Acceso  
**Modo activo:** Mixto  
**Generado por:** AI-EM-ARCH  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md

---

## 1. Objetivo exacto de la fase

Implementar la primera fase de MOD00 Configuracion Control Plane como control plane tenant-aware, incorporando:

- Organizacion/Sedes como dato maestro transversal del tenant.
- Usuarios y acceso con perfiles configurables sobre `UserRole` base.
- Portal settings reorganizado para exponer estas capacidades sin mezclar ownership de WFM, Inventory, Billing o Commercial.

Esta fase deja preparado el camino para integrar WFM en una fase posterior, pero no migra Work Orders ni elimina `WfmOperatingSite`.

### Lo que si entra

- Migraciones tenant-aware para sedes, capacidades, horarios, responsables, perfiles y permisos.
- Backend NestJS para `OrganizationModule` y `AccessControlModule` o submodulos equivalentes bajo `ConfigurationModule`.
- Contratos REST, DTOs, Zod y OpenAPI.
- Portal UI para Organizacion y Usuarios/Acceso.
- Tests unitarios, HTTP y Playwright focalizados.
- Informe de cierre actualizado.

### Lo que no entra

- Reemplazo completo de `UserRole` por permisos dinamicos.
- Eliminacion de `WfmOperatingSite`.
- Inventory, Billing, HR, NMS o recaudo real.
- LDAP, AD, SAML u OIDC.
- Motor de aprobaciones o versionado avanzado de cambios.

---

## 2. Artefactos de entrada obligatorios

- ADR aprobado: docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- PRD del modulo: docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- HLD del modulo: docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- Plan de implementacion: docs/superpowers/plans/2026-05-19-mod00-configuracion-control-plane.md
- PRD Users: docs/prds/PRD-MOD04-USUARIOS-INTERNOS-v1.1.md
- PRD WFM: docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
- HLD WFM: docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
- ADR WFM: docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- ADR Parties: docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md
- Stack: docs/prds/Stack_Tecnologico.md

### Artefactos de calidad complementarios

- Checklist de calidad: docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-01-v1.0.md

---

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer ADR-040, PRD MOD00 v1.0, HLD MOD00 v1.0 y plan completo antes de tocar codigo.
2. Confirmar que la ejecucion se mantiene dentro del alcance aprobado por ADR-040.
3. Implementar primero migraciones y entidades tenant-aware.
4. Implementar backend con tests antes de UI.
5. Implementar portal UI usando patrones existentes de settings, usuarios y WFM.
6. Mantener `UserRole` como rol base; no crear roles backend dinamicos.
7. Exponer perfiles configurables como capa adicional de permisos.
8. Registrar auditoria en toda mutacion sensible.
9. Actualizar informe vivo de MOD00 al cerrar.

---

## 4. Restricciones no negociables

- Usar pnpm, nunca npm ni yarn.
- No romper boundaries del modulith.
- No acceder a tablas de otro modulo directamente.
- No usar `tenant.settings` JSONB para sedes, horarios, perfiles o permisos.
- No hardcodear tenant ni schema.
- Usar `SET LOCAL search_path` por transaccion mediante helpers existentes.
- Usar `@Roles(UserRole.*)` con enums, nunca strings literales.
- No persistir PII innecesaria, secretos, tokens ni credenciales en docs, tests o logs.
- Validar entradas externas con Zod o DTOs aprobados.
- Mantener textos UI en espanol y sentence case.

---

## 5. Entregables tecnicos obligatorios

### Backend

- `OrganizationModule` o submodulo equivalente.
- `AccessControlModule` o submodulo equivalente.
- Controllers REST versionados.
- Services tenant-aware.
- Puertos tipados para consumo WFM futuro.
- Tests unitarios/HTTP.

### Database

- Entidades TypeORM nuevas.
- Migracion tenant reversible.
- Indices y constraints de unicidad activa.

### Frontend

- Seccion Organizacion en `/dashboard/settings`.
- Seccion Usuarios y acceso en `/dashboard/settings`.
- API client tipado.
- Componentes de tabla, dialogos, matriz de permisos y editor de horarios.

### Tests

- Backend unit/HTTP.
- Frontend Jest focalizado.
- Playwright portal para flujo ADMIN.

---

## 6. Entregables documentales obligatorios

- Actualizar `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` con resultados.
- Crear checklist en `docs/quality/` si durante la ejecucion se vuelve gate de fase.
- Actualizar PRD/HLD si el equipo cambia alcance o boundary aprobado.
- Documentar stop/go si aparece conflicto con ADR-040, ADR-030 o ADR-037.

---

## 7. Criterios de aceptacion

- CA-CFG2-01: `ADMIN` puede crear una sede con capacidades y horario institucional.
- CA-CFG2-02: `NOC` o `SUPPORT` puede consultar sedes sin mutarlas.
- CA-CFG2-03: `ADMIN` puede crear perfil configurable y asignarle permisos validos.
- CA-CFG2-04: El backend rechaza permisos desconocidos o incompatibles con rol base.
- CA-CFG2-05: Un usuario sin rol/permiso de gestion no puede mutar sedes ni perfiles por API.
- CA-CFG2-06: WFM queda preparado para consumir sedes por puerto sin leer tablas directamente.
- CA-CFG2-07: No hay datos de Inventory, Billing o HR implementados de forma falsa dentro de Configuracion.
- CA-CFG2-08: Todas las mutaciones sensibles quedan auditadas.
- CA-CFG2-09: Typecheck y tests focalizados pasan o documentan fallos no relacionados.

---

## 8. Criterio de stop/go

### Detenerse inmediatamente si

- El ADR-040 no esta aprobado y la ejecucion requiere cambios de boundary reales.
- La implementacion exige quitar o debilitar `@Roles(UserRole.*)`.
- Se detecta necesidad de leer tablas WFM, Inventory, Billing, Commercial o Users por fuera de puertos aprobados.
- Se pretende crear roles backend dinamicos desde la UI del tenant.
- La migracion propuesta no es reversible o puede dejar agendas WFM sin referencia.

### Documentar causa en

- `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

### Escalar a

- CTO Humano con etiqueta `[ESCALACION AL CTO]`.

---

## 9. Criterio de salida de la fase

- Backend validado con pruebas focalizadas.
- Frontend validado con pruebas focalizadas.
- Migracion reversible validada.
- Playwright portal cubre flujo principal ADMIN.
- Informe MOD00 actualizado.
- No quedan atajos de tenancy, seguridad o boundary.
