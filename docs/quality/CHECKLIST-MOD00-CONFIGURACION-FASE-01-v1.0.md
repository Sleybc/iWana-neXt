# CHECKLIST - MOD00 Configuracion Fase 01

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-19  
**Modo activo:** Mixto  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** 01 - Organizacion/Sedes y Usuarios/Acceso  
**ADR:** docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md  
**PRD:** docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**HLD:** docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**Plan:** docs/plans/2026-05-19-mod00-configuracion-control-plane.md  
**Prompt:** docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-01-v1.0.md

---

## 1. Stop/go inicial

- [ ] ADR-040 aprobado y vigente.
- [ ] PRD/HLD/plan/prompt leidos antes de tocar codigo.
- [ ] Alcance limitado a Fase 01.
- [ ] Sin implementacion de Inventory, Billing, HR, NMS o WFM migration completa.
- [ ] Sin roles backend dinamicos desde UI.

## 2. Database

- [ ] Entidades TypeORM tenant sin `schema` hardcodeado.
- [ ] Migracion tenant `up` crea tablas de Organizacion y Access Control.
- [ ] Migracion `down` revierte tablas, indices y tipos en orden seguro.
- [ ] Indices unicos activos creados para codigo de sede, nombre de perfil y relaciones.
- [ ] `tenant_id` presente en tablas tenant-locales.
- [ ] No se usa `tenant.settings` JSONB para sedes, perfiles, horarios ni permisos.
- [ ] Validado `pnpm --filter @iwana/db typecheck`.

## 3. Backend

- [ ] `OrganizationModule` registrado sin imports circulares.
- [ ] `AccessControlModule` registrado sin imports circulares.
- [ ] Controllers REST versionados y documentados para OpenAPI.
- [ ] DTOs/Zod validan payload externo.
- [ ] Servicios usan `TenantContext.getOrThrow()` y `runInTenantSchema()`.
- [ ] Mutaciones usan `@Roles(UserRole.ADMIN)` con enum, no strings.
- [ ] Lecturas de sedes permiten roles base aprobados.
- [ ] Access Profiles no reemplaza `UserRole`.
- [ ] Permisos desconocidos o incompatibles se rechazan en backend.
- [ ] Mutaciones sensibles auditan oldValue/newValue sin secretos ni PII innecesaria.
- [ ] WFM queda preparado por `OrganizationSiteReadPort`, sin leer tablas directo.
- [ ] Validado `pnpm --filter @iwana/api test -- organization access-control`.
- [ ] Validado `pnpm --filter @iwana/api typecheck`.

## 4. Frontend portal

- [ ] `/dashboard/settings` mantiene entrada estable.
- [ ] Existe seccion `Organizacion` con sedes, capacidades y horarios.
- [ ] Existe seccion `Usuarios y acceso` con perfiles y matriz de permisos.
- [ ] API client tipado para organization y access-control.
- [ ] Textos UI en espanol y sentence case.
- [ ] Enums mapeados a labels de negocio, no renderizados crudos.
- [ ] Tablas usan `align-middle` por defecto.
- [ ] UI deshabilita acciones incompatibles, pero backend conserva enforcement final.
- [ ] Estados de error de autorizacion son visibles, no estados vacios falsos.
- [ ] Validado `pnpm --filter @iwana/portal test -- organization access-control`.
- [ ] Validado `pnpm --filter @iwana/portal typecheck`.

## 5. E2E y evidencia

- [ ] Playwright cubre login ADMIN y creacion de sede.
- [ ] Playwright cubre configuracion de horario institucional.
- [ ] Playwright cubre creacion de perfil de acceso.
- [ ] Playwright cubre asignacion de perfil a usuario tecnico.
- [ ] Caso negativo cubre usuario no ADMIN sin mutacion permitida.
- [ ] Validado `pnpm test:e2e:portal --grep "Configuracion"` o documentado bloqueo no relacionado.

## 6. Cierre documental

- [ ] Informe MOD00 actualizado con comandos ejecutados y resultados.
- [ ] Desvios de alcance documentados con causa y decision.
- [ ] Si aparece conflicto de boundary, seguridad o stack, usar `[ESCALACION AL CTO]`.
- [ ] No quedan TODO/TBD abiertos dentro de artefactos aprobados de Fase 01.
