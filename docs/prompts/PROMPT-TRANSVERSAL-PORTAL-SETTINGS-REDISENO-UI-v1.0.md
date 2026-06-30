# PROMPT — Ejecución rediseño visual de settings portal

**Versión:** 1.0  
**Estado:** Listo para ejecución  
**Fecha:** 2026-05-07  
**Generado por:** Engineering Manager + Senior UI Systems Designer  
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)  
**Convención documental:** `PROMPT-TRANSVERSAL-PORTAL-SETTINGS-REDISENO-UI-v1.0.md`

## Módulo

- Nombre: Configuración empresarial del portal tenant-aware
- Código: TRANSVERSAL-PORTAL-SETTINGS-REDISENO-UI
- Fase: Rediseño visual integral de `/dashboard/settings`
- Versión: 1.0
- Fecha: 2026-05-07
- Generado por: Engineering Manager
- Nombre de archivo destino: `PROMPT-TRANSVERSAL-PORTAL-SETTINGS-REDISENO-UI-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** la pantalla `apps/portal:/dashboard/settings` debe evolucionar de una vista funcional pero plana a un centro de control claro, premium, escaneable y escalable, manteniendo contratos API, permisos y arquitectura intactos.
- **Lo que sí entra:**
  - reforzar el bloque superior como resumen ejecutivo del módulo;
  - mantener tabs principales (`General`, `Operación`, `Seguridad`, `Marca`);
  - introducir navegación secundaria explícita dentro de `Marca` para `Identidad visual`, `Planes`, `Productos` y `Cobertura`;
  - reorganizar `BrandingForm` como sistema de identidad visual más claro y menos monolítico;
  - aislar managers densos bajo su subdominio correspondiente;
  - mejorar densidad, jerarquía, spacing, responsive y foco visible del módulo;
  - actualizar pruebas focalizadas y documentación viva.
- **Lo que no entra:**
  - cambios de endpoints, DTOs, contratos API o boundaries;
  - cambios de roles, permisos o multi-tenancy;
  - rediseño funcional de catálogo, productos o cobertura más allá de su reorganización visual;
  - incorporación de librerías nuevas o cambios globales de stack;
  - rediseño general del shell del portal fuera de lo necesario para settings.

## 2. Artefactos de entrada obligatorios

- Plantilla base: [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
- Spec de diseño: [2026-05-07-portal-settings-redesign-design.md](../specs/2026-05-07-portal-settings-redesign-design.md)
- Plan de implementación: [PLAN-TRANSVERSAL-PORTAL-SETTINGS-REDISENO-UI-v1.0.md](../plans/PLAN-TRANSVERSAL-PORTAL-SETTINGS-REDISENO-UI-v1.0.md)
- Perfil Senior UI: [Perfil_IA_Senior_UI_Systems_Designer_v1.md](../roles/Perfil_IA_Senior_UI_Systems_Designer_v1.md)
- Stack base: [Stack_Tecnologico.md](../prds/Stack_Tecnologico.md)
- Informe vivo actualizado: [INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md](../informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md)
- Referencias de implementación actuales:
  - [apps/portal/src/components/settings/SettingsClient.tsx](../../apps/portal/src/components/settings/SettingsClient.tsx)
  - [apps/portal/src/components/settings/SettingsOverviewPanel.tsx](../../apps/portal/src/components/settings/SettingsOverviewPanel.tsx)
  - [apps/portal/src/components/settings/BrandingForm.tsx](../../apps/portal/src/components/settings/BrandingForm.tsx)
  - [apps/portal/src/components/settings/PlanCatalogManager.tsx](../../apps/portal/src/components/settings/PlanCatalogManager.tsx)
  - [apps/portal/src/components/settings/AdditionalProductsManager.tsx](../../apps/portal/src/components/settings/AdditionalProductsManager.tsx)
  - [apps/portal/src/components/settings/AdditionalServicesManager.tsx](../../apps/portal/src/components/settings/AdditionalServicesManager.tsx)
  - [apps/portal/src/components/settings/CoverageCheckSection.tsx](../../apps/portal/src/components/settings/CoverageCheckSection.tsx)
- Artefactos faltantes detectados: no hay HLD específico para este correctivo visual; la fase se ejecuta como rediseño transversal gobernado por el spec y plan de esta entrega.

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer completo el spec y el plan antes de modificar código.
2. Implementar la fase como refinamiento visual estructural, no como experimento libre de UI.
3. Crear la navegación secundaria de `Marca` y separar explícitamente los subdominios `Identidad visual`, `Planes`, `Productos` y `Cobertura`.
4. Refactorizar `SettingsClient.tsx` para que orqueste tabs principales y subtabs de `Marca` sin mezclar superficies densas en un mismo scroll.
5. Crear las piezas visuales locales mínimas necesarias para sostener la nueva jerarquía:
   - `SettingsSubTabs.tsx`
   - `SettingsSectionPanel.tsx`
   - `settings-branding-navigation.ts`
6. Evolucionar `SettingsOverviewPanel.tsx` para que opere como resumen ejecutivo y no como panel decorativo.
7. Reorganizar `BrandingForm.tsx` en bloques visuales con intención clara: activos visuales, naming, metadata y preview.
8. Aislar managers densos por subdominio, sin cambiar su lógica de negocio ni contratos.
9. Endurecer responsive y accesibilidad del módulo: foco visible, tabs/subtabs keyboard-friendly y lectura clara en desktop, tablet y mobile.
10. Actualizar tests focalizados y el informe vivo con evidencia de ejecución.

## 4. Restricciones no negociables

- Usar `pnpm`, nunca `npm` ni `yarn`.
- No cambiar endpoints, DTOs, roles, permisos ni contratos API.
- No agregar librerías de UI ni alterar el stack aprobado.
- No introducir `tailwind.config.js`.
- No usar datos sensibles, credenciales, tokens ni PII en código, docs o pruebas.
- Todo copy visible debe estar en español y en sentence case.
- No exponer enums técnicos en UI final si pueden mapearse a lenguaje de negocio.
- Mantener WCAG 2.2 AA como baseline visual.

## 5. Entregables técnicos obligatorios

- Nueva subnavegación del dominio `Marca`.
- Refactor de `SettingsClient.tsx` con control de subdominio activo.
- Refuerzo del resumen ejecutivo en `SettingsOverviewPanel.tsx`.
- Refactor visual de `BrandingForm.tsx`.
- Aislamiento visual de:
  - `PlanCatalogManager.tsx`
  - `AdditionalProductsManager.tsx`
  - `AdditionalServicesManager.tsx`
  - `CoverageCheckSection.tsx`
- Tests focalizados actualizados.

## 6. Entregables documentales obligatorios

- Actualización del informe vivo [INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md](../informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md)
- Registro de archivos modificados
- Comandos ejecutados y resultados
- Evidencia before/after si la ejecución la produce
- Deuda visual residual documentada si algo queda fuera del alcance

## 7. Criterios de aceptación

- CA-SET-UI-01: el módulo permite identificar rápidamente áreas de configuración y áreas que requieren atención.
- CA-SET-UI-02: la pestaña `Marca` deja de mezclar branding, catálogo, productos y cobertura en una sola superficie continua.
- CA-SET-UI-03: el resumen superior se percibe como panel ejecutivo y no como hero decorativo.
- CA-SET-UI-04: formularios y managers muestran jerarquía, spacing y acciones más consistentes.
- CA-SET-UI-05: la solución mejora desktop sin degradar tablet y mobile.
- CA-SET-UI-06: tabs y subtabs cumplen foco visible, contraste y navegación por teclado.
- CA-SET-UI-07: pruebas focalizadas, typecheck y lint del portal quedan en verde.

## 8. Criterio de stop/go

- **Detenerse inmediatamente si:**
  - el refactor visual exige cambiar contratos API o lógica de permisos;
  - el alcance visual deriva a reescritura funcional de managers;
  - la subnavegación propuesta rompe accesibilidad o navegabilidad en mobile;
  - aparece necesidad de mover cambios transversales a `@iwana/ui` fuera del alcance acordado.
- **Documentar causa en:** [INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md](../informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md)
- **Escalar a:** EM-ARCH
- **Recomendación esperada:** resolver con refactors locales y enfoque incremental antes de ampliar el alcance.

## 9. Criterio de salida de la fase

- Frontend validado:
  - `pnpm --filter @iwana/portal test -- src/components/settings/SettingsClient.spec.tsx src/components/settings/BrandingForm.spec.tsx src/components/settings/PlanCatalogManager.spec.tsx src/components/settings/AdditionalProductsManager.spec.tsx src/components/settings/AdditionalServicesManager.spec.tsx`
  - `pnpm --filter @iwana/portal typecheck`
  - `pnpm --filter @iwana/portal lint`
- Validación manual mínima:
  - revisión desktop `1440x900` en `/dashboard/settings`
  - revisión mobile `390x844` en `/dashboard/settings`
  - verificación por teclado de tabs, subtabs y acciones principales
- Documentación archivada:
  - informe vivo actualizado con resultado final y deuda residual si aplica