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

- [ ] Fase 01 Access Profiles operativa.
- [ ] ADR-019 y ADR-040 revisados.
- [ ] `UserRole` se mantiene como base.
- [ ] No se introduce IAM externo.

## 2. Backend

- [ ] `@Permissions()` creado y probado.
- [ ] `PermissionsGuard` corre despues de JWT/Tenant/Roles.
- [ ] Servicio de permisos efectivos respeta perfiles activos y vigencias.
- [ ] Anti-lockout impide remover ultimo admin efectivo.
- [ ] 403 validado para usuario sin permiso granular.

## 3. Audit y datos

- [ ] Auditoria registra actor, accion, target, oldValue/newValue.
- [ ] Auditoria no contiene secretos, tokens ni PII innecesaria.
- [ ] Migracion nueva solo si hay necesidad real.
- [ ] Cache omitido o invalidacion documentada.

## 4. Frontend

- [ ] UI muestra permisos efectivos con labels de negocio.
- [ ] Cambios sensibles muestran evidencia o enlace real a auditoria.
- [ ] No renderiza enums crudos.
- [ ] Estados de error 403 son visibles.

## 5. E2E y cierre

- [ ] Playwright cubre bloqueo por falta de permiso.
- [ ] Playwright cubre anti-lockout.
- [ ] Informe MOD00 actualizado.
- [ ] Decision de cache documentada si aplica.
