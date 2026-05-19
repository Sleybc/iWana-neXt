# PROMPT - MOD00 Configuracion Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-19  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** 02 - Integracion WFM con Organizacion/Sedes  
**Modo activo:** Mixto  
**Generado por:** AI-EM-ARCH  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md

---

## 1. Objetivo exacto de la fase

Integrar WFM con las sedes organizacionales creadas en Fase 01, preservando compatibilidad con `WfmOperatingSite` y evitando lecturas directas entre bounded contexts.

### Lo que si entra

- Adapter WFM -> `OrganizationSiteReadPort`.
- Mapping reversible entre sede WFM legacy y `OrganizationSite`.
- Reubicacion de Operacion de campo en settings.
- Tests backend, portal y Playwright focalizados.

### Lo que no entra

- Eliminar `WfmOperatingSite`.
- Reescribir Work Orders o agenda.
- Implementar Inventory, Billing, HR o NMS.

## 2. Artefactos de entrada obligatorios

- ADR MOD00: docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- PRD MOD00: docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- HLD MOD00: docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- Plan Fase 02: docs/superpowers/plans/2026-05-19-mod00-configuracion-fase-02-wfm-integration.md
- Checklist Fase 02: docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-02-v1.0.md
- ADR WFM: docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- Spec WFM: docs/superpowers/specs/2026-05-15-mod09-wfm-operating-hours-design.md

## 3. Instrucciones para Sr. Dev Fullstack

1. Confirmar que Fase 01 esta cerrada o disponible en la rama.
2. Implementar adapter y pruebas antes de tocar UI.
3. Crear mapping reversible o justificar alternativa en informe.
4. Mantener WFM owner de agenda, Work Orders y ejecucion.
5. Actualizar portal settings con Operacion de campo.
6. Cerrar checklist y actualizar informe MOD00.

## 4. Restricciones no negociables

- No leer tablas de Organizacion desde WFM directamente.
- No eliminar referencias legacy de agendas o Work Orders.
- No hardcodear tenant ni schema.
- Usar `@Roles(UserRole.*)` con enums.
- No simular Inventory/Billing/HR.

## 5. Entregables tecnicos obligatorios

- Adapter WFM a `OrganizationSiteReadPort`.
- Migracion o mapping reversible.
- Ruta portal `/dashboard/settings/field-operations`.
- Tests WFM de compatibilidad.
- Playwright de Operacion de campo.

## 6. Entregables documentales obligatorios

- Informe MOD00 actualizado.
- Checklist Fase 02 cerrado.
- Stop/go documentado si aparece riesgo de perdida historica.

## 7. Criterios de aceptacion

- CA-CFG2-01: WFM lista sedes `TECH_DISPATCH` por puerto aprobado.
- CA-CFG2-02: Work Orders historicas conservan referencia legible.
- CA-CFG2-03: Un `ADMIN` configura Operacion de campo desde settings.
- CA-CFG2-04: No hay lectura SQL directa WFM -> Organization.
- CA-CFG2-05: Migracion/mapping tiene rollback.

## 8. Criterio de stop/go

Detenerse si el cambio puede dejar agendas o Work Orders sin referencia. Documentar en informe MOD00 y escalar con `[ESCALACION AL CTO]`.

## 9. Criterio de salida de la fase

- Backend WFM validado.
- Portal validado.
- Mapping reversible validado.
- Playwright focalizado ejecutado o bloqueo documentado.
- Informe actualizado.
