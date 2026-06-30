# PROMPT - MOD00 Configuracion Fase 04

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-19  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** 04 - Gobierno avanzado y permisos granulares  
**Modo activo:** Mixto  
**Generado por:** AI-EM-ARCH  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md

---

## 1. Objetivo exacto de la fase

Endurecer MOD00 con enforcement granular de permisos, anti-lockout administrativo y auditoria enriquecida de cambios sensibles.

### Lo que si entra

- `@Permissions()` y `PermissionsGuard` en endpoints aprobados.
- Servicio de permisos efectivos.
- Proteccion contra eliminar el ultimo acceso admin efectivo.
- Evidencia UI de permisos/cambios sensibles.
- Auditoria enriquecida sin secretos.

### Lo que no entra

- Reemplazar `UserRole`.
- Crear roles backend dinamicos.
- LDAP, SAML, OIDC o AD.
- Cache de permisos si no hay necesidad demostrada.

## 2. Artefactos de entrada obligatorios

- ADR MOD00: docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- ADR Auth: docs/adrs/ADR-019-JWT-RS256-Refresh-Rotation.md
- PRD MOD00: docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- HLD MOD00: docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- Plan Fase 04: docs/plans/2026-05-19-mod00-configuracion-fase-04-gobierno-avanzado.md
- Checklist Fase 04: docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-04-v1.0.md

## 3. Instrucciones para Sr. Dev Fullstack

1. Confirmar que Access Profiles de Fase 01 estan operativos.
2. Implementar tests de guard antes del decorator.
3. Mantener `RolesGuard` como base y agregar permisos como refinamiento.
4. Implementar anti-lockout antes de ampliar UI.
5. Auditar cada mutacion sensible.
6. Documentar si se decide usar cache.

## 4. Restricciones no negociables

- No debilitar `@Roles(UserRole.*)`.
- No permitir que tenant cree roles backend.
- No guardar secretos ni tokens en auditoria.
- No cachear permisos sin invalidacion documentada.

## 5. Entregables tecnicos obligatorios

- Decorator y guard de permisos.
- Servicio de permisos efectivos.
- Servicio de gobierno/anti-lockout.
- UI de permisos efectivos y evidencia de cambios.
- Tests backend, frontend y Playwright.

## 6. Entregables documentales obligatorios

- Informe MOD00 actualizado.
- Checklist Fase 04 cerrado.
- Decision de cache documentada si aplica.

## 7. Criterios de aceptacion

- CA-CFG4-01: Endpoint protegido exige rol base y permiso granular.
- CA-CFG4-02: Usuario sin permiso recibe 403 aunque tenga UI manipulada.
- CA-CFG4-03: No se puede eliminar el ultimo acceso admin efectivo.
- CA-CFG4-04: Auditoria registra oldValue/newValue seguro.
- CA-CFG4-05: UI muestra permisos efectivos sin enums crudos.

## 8. Criterio de stop/go

Detenerse si la solucion requiere reemplazar `UserRole`, guardar secretos en auditoria o crear IAM externo. Documentar y escalar con `[ESCALACION AL CTO]`.

## 9. Criterio de salida de la fase

- Guards validados.
- Anti-lockout validado.
- Auditoria validada.
- Portal validado.
- Informe actualizado.
