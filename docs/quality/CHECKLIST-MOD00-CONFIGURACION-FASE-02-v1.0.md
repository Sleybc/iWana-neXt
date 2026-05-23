# CHECKLIST - MOD00 Configuracion Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-19  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** 02 - Integracion WFM con Organizacion/Sedes  
**Plan:** docs/plans/2026-05-19-mod00-configuracion-fase-02-wfm-integration.md  
**Prompt:** docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-02-v1.0.md

---

## 1. Stop/go inicial

- [x] Fase 01 cerrada o disponible en la rama.
- [x] ADR-040 y ADR-037 revisados.
- [x] No se planea eliminar `WfmOperatingSite`.
- [x] Estrategia de mapping definida antes de migrar datos.

## 2. Backend

- [x] WFM consume `OrganizationSiteReadPort`.
- [x] No hay repositorios Organization importados directamente en WFM.
- [x] `operatingSiteId` legacy sigue funcionando.
- [x] `organizationSiteId` se acepta solo donde esta aprobado.
- [x] Tests de compatibilidad WFM pasan.

## 3. Database

- [x] Mapping reversible creado o alternativa documentada.
- [x] `down` migration no pierde referencias historicas.
- [x] Backfill documenta registros omitidos.
- [x] `pnpm --filter @iwana/db typecheck` validado.

## 4. Frontend

- [x] `/dashboard/settings/field-operations` existe.
- [x] Navegacion muestra `Operacion de campo`.
- [x] UI conserva settings WFM existentes.
- [x] No renderiza enums crudos.

## 5. E2E y cierre

- [x] Playwright cubre Operacion de campo.
- [x] Informe MOD00 actualizado.
- [x] Bloqueos historicos documentados si existen.
