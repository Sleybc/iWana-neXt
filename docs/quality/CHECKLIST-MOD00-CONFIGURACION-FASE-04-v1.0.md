# CHECKLIST - MOD00 Configuracion Fase 04

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-19  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** 04 - Gobierno avanzado y permisos granulares  
**Plan:** docs/plans/2026-05-19-mod00-configuracion-fase-04-gobierno-avanzado.md  
**Prompt:** docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-04-v1.0.md

---

## 1. Stop/go inicial

- [x] Fase 01 Access Profiles operativa.
- [x] ADR-019 y ADR-040 revisados.
- [x] `UserRole` se mantiene como base.
- [x] No se introduce IAM externo.

## 2. Backend

- [x] `@Permissions()` creado y probado.
- [x] `PermissionsGuard` corre despues de JWT/Tenant/Roles.
- [x] Servicio de permisos efectivos respeta perfiles activos y vigencias.
- [x] Anti-lockout impide remover ultimo admin efectivo.
- [x] 403 validado para usuario sin permiso granular.

## 3. Audit y datos

- [x] Auditoria registra actor, accion, target, oldValue/newValue.
- [x] Auditoria no contiene secretos, tokens ni PII innecesaria.
- [x] Migracion nueva solo si hay necesidad real.
- [x] Cache omitido o invalidacion documentada.

## 4. Frontend

- [x] UI muestra permisos efectivos con labels de negocio.
- [x] Cambios sensibles muestran evidencia o enlace real a auditoria.
- [x] No renderiza enums crudos.
- [x] Estados de error 403 son visibles.

## 5. E2E y cierre

- [x] Playwright cubre bloqueo por falta de permiso.
- [x] Playwright cubre anti-lockout.
- [x] Informe MOD00 actualizado.
- [x] Decision de cache documentada si aplica.
