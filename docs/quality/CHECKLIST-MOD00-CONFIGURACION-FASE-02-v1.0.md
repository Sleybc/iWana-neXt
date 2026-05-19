# CHECKLIST - MOD00 Configuracion Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-19  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** 02 - Integracion WFM con Organizacion/Sedes  
**Plan:** docs/superpowers/plans/2026-05-19-mod00-configuracion-fase-02-wfm-integration.md  
**Prompt:** docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-02-v1.0.md

---

## 1. Stop/go inicial

- [ ] Fase 01 cerrada o disponible en la rama.
- [ ] ADR-040 y ADR-037 revisados.
- [ ] No se planea eliminar `WfmOperatingSite`.
- [ ] Estrategia de mapping definida antes de migrar datos.

## 2. Backend

- [ ] WFM consume `OrganizationSiteReadPort`.
- [ ] No hay repositorios Organization importados directamente en WFM.
- [ ] `operatingSiteId` legacy sigue funcionando.
- [ ] `organizationSiteId` se acepta solo donde esta aprobado.
- [ ] Tests de compatibilidad WFM pasan.

## 3. Database

- [ ] Mapping reversible creado o alternativa documentada.
- [ ] `down` migration no pierde referencias historicas.
- [ ] Backfill documenta registros omitidos.
- [ ] `pnpm --filter @iwana/db typecheck` validado.

## 4. Frontend

- [ ] `/dashboard/settings/field-operations` existe.
- [ ] Navegacion muestra `Operacion de campo`.
- [ ] UI conserva settings WFM existentes.
- [ ] No renderiza enums crudos.

## 5. E2E y cierre

- [ ] Playwright cubre Operacion de campo.
- [ ] Informe MOD00 actualizado.
- [ ] Bloqueos historicos documentados si existen.
