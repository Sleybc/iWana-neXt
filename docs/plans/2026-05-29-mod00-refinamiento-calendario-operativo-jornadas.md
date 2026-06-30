# MOD00 refinamiento UI/UX de Calendario operativo y jornadas - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** refinar `/dashboard/settings/calendar` para que su jerarquia, copy, responsive y estados hagan evidente que capa del calendario se esta editando, sin cambiar ownership funcional entre Organization, WFM y RR. HH. futuro.

**Architecture:** el rediseño se mantiene dentro del boundary aprobado por ADR-040 y ADR-042. MOD00 sigue centralizando la experiencia visible del calendario; Organization conserva horario base, horarios por sede y excepciones empresariales; WFM conserva programacion de visitas y eventualidades operativas. El trabajo es frontend-first y no debe abrir cambios de API salvo que un bug existente lo obligue y quede escalado.

**Tech Stack:** Next.js App Router, React, Tailwind v4 CSS-first, `@iwana/ui`, Jest, Playwright, pnpm.

---

## Source Artifacts

- Perfil rector: `docs/roles/Perfil_IA_EM_Architect_Unificado_v1.md`
- ADR rector: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- ADR relacionado: `docs/adrs/ADR-042-Calendario-Operativo-Jornadas.md`
- PRD: `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- HLD: `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Spec base: `docs/specs/2026-05-23-mod00-calendario-operativo-jornadas-design.md`
- Spec de rediseño: `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md`
- Prompt de ejecución: `docs/prompts/PROMPT-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md`
- Checklist de salida: `docs/quality/CHECKLIST-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md`
- Informe vivo: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

## Scope

### Build in this refinement

- Reencuadre visual del header y del orden de lectura de `/dashboard/settings/calendar`.
- Jerarquia nueva para horario base, horarios por sede, cierres por fecha, WFM y cambios puntuales.
- Variante responsive del editor semanal reutilizable.
- Copy mas claro y consistente en labels, mensajes y estados visibles.
- Subordinacion visual de formularios secundarios en excepciones y eventualidades.
- Contexto explicito para la superficie WFM dentro del calendario.
- Tests focalizados de portal y E2E de la ruta calendario.
- Actualizacion documental de spec, informe y checklist de ejecucion.

### Do not build in this refinement

- Nuevos endpoints, DTOs, migraciones o ownership de datos.
- Nuevas reglas de resolucion calendaria.
- Reapertura del alcance funcional de Fase 06 cerrada.
- Nuevo modulo o nueva ruta fuera de `/dashboard/settings/calendar`.
- Cambios de permisos, tenancy o contratos de Access/Organization/WFM.

## File Structure

### Portal core

- Modify: `apps/portal/src/components/settings/CalendarSettingsClient.tsx`
  Purpose: reordenar la pagina, reforzar header y resumir estado operativo.
- Modify: `apps/portal/src/components/settings/BusinessHoursWeekEditor.tsx`
  Purpose: crear una variante desktop/mobile sin romper el contrato actual del editor.
- Modify: `apps/portal/src/components/settings/CalendarOrganizationHoursPanel.tsx`
  Purpose: dar mas peso al bloque base y mejorar feedback visual.
- Modify: `apps/portal/src/components/settings/CalendarSiteHoursPanel.tsx`
  Purpose: aclarar selector de sede, estado actual y accion principal.
- Modify: `apps/portal/src/components/settings/CalendarExceptionsPanel.tsx`
  Purpose: hacer mas escaneable el listado y subordinar el alta manual.
- Modify: `apps/portal/src/components/settings/CalendarWfmPanel.tsx`
  Purpose: contextualizar WFM dentro de la pantalla y no como bloque opaco.
- Modify: `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx`
  Purpose: solo ajustes visuales seguros o separacion presentacional local; no cambiar contratos.
- Modify: `apps/portal/src/components/settings/OperationalEventualitiesPanel.tsx`
  Purpose: clarificar formularios, feedback y estados de disponibilidad puntual.
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`
  Purpose: centralizar el copy aprobado por producto.
- Modify: `apps/portal/src/components/shared/portal-ui.tsx`
  Purpose: reforzar patrones compartidos si hace falta para alerts, section headers o empty states.

### Tests

- Modify: `apps/portal/src/components/settings/CalendarSettingsClient.spec.tsx`
  Purpose: validar nueva jerarquia y degradaciones.
- Modify: `apps/portal/src/components/settings/BusinessHoursWeekEditor.spec.tsx`
  Purpose: validar layout responsive y estabilidad del contrato.
- Modify: `apps/portal/src/components/settings/CalendarWfmPanel.spec.tsx`
  Purpose: validar framing de WFM sin cambiar permisos.
- Modify: `apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx`
  Purpose: cubrir los ajustes visuales permitidos sin romper flujo.
- Modify: `apps/portal/src/components/settings/OperationalEventualitiesPanel.spec.tsx`
  Purpose: validar colapso del formulario, feedback y estados.
- Modify: `e2e/tests/portal-settings-calendar.spec.ts`
  Purpose: probar jerarquia visual, responsive basico y ausencia de drift funcional.

### Docs

- Modify: `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md`
  Purpose: enlazar artefactos ejecutables de esta iteracion.
- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
  Purpose: registrar el handoff EM-Architect del refinamiento posterior a Fase 06.
- Create: `docs/quality/CHECKLIST-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md`
  Purpose: gates de salida para la iteracion.

## Task 1: Stop/go y congelamiento de alcance

- [ ] Leer `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md` completo antes de tocar codigo.
- [ ] Confirmar que el slice se mantiene como refinamiento visual/UX y no reabre ownership ni endpoints.
- [ ] Confirmar que cualquier cambio en `WfmOperatingHoursManager.tsx` sera solo presentacional; si aparece necesidad de tocar API, abrir bloqueo y separar slice.
- [ ] Registrar en la rama de trabajo que Fase 06 cerrada queda como antecedente historico y no se modifica su checklist ni su prompt.

**Stop/go:** detener si el rediseño exige backend nuevo, permisos nuevos, cambio de DTO o decision de boundary.

## Task 2: Reencuadrar el shell de calendario

**Files:**

- Modify: `apps/portal/src/components/settings/CalendarSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/CalendarSettingsClient.spec.tsx`
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`

- [ ] Reorganizar el orden visual de los bloques para que siga este flujo: horario base, horarios por sede, cierres por fecha, programacion de visitas, cambios puntuales.
- [ ] Reforzar `PageHeader` con subtitulo mas claro y un resumen breve de estado operativo usando informacion ya disponible en cliente.
- [ ] Mantener el boton `Actualizar`, pero evitar que compita visualmente con el contenido principal.
- [ ] Agregar o reforzar eyebrows y descripciones cortas por bloque desde `mod00-settings-labels.ts`, sin hardcodes nuevos en JSX.
- [ ] Actualizar `CalendarSettingsClient.spec.tsx` para verificar el nuevo orden de lectura y el texto visible esperado.

**Comandos de validacion:**

```bash
pnpm --filter @iwana/portal test -- CalendarSettingsClient
```

## Task 3: Crear una base responsive segura para el editor semanal

**Files:**

- Modify: `apps/portal/src/components/settings/BusinessHoursWeekEditor.tsx`
- Modify: `apps/portal/src/components/settings/BusinessHoursWeekEditor.spec.tsx`

- [ ] Mantener el contrato actual `days`, `canEdit` y `onChange`.
- [ ] Implementar una version desktop basada en tabla y una version mobile basada en filas o tarjetas por dia, sin depender de scroll horizontal como solucion principal.
- [ ] Conservar `data-testid` o reemplazarlos de forma controlada para no romper tests por accidente.
- [ ] Mantener el mismo comportamiento de `isOpen`, limpieza de horas y deshabilitacion de inputs.
- [ ] Agregar pruebas focalizadas para asegurar que el cambio de layout no rompe `onChange`, modo read-only ni horarios invalidos.

**Comandos de validacion:**

```bash
pnpm --filter @iwana/portal test -- BusinessHoursWeekEditor
```

## Task 4: Dar jerarquia clara a horario base y horarios por sede

**Files:**

- Modify: `apps/portal/src/components/settings/CalendarOrganizationHoursPanel.tsx`
- Modify: `apps/portal/src/components/settings/CalendarSiteHoursPanel.tsx`
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`

- [ ] Convertir el bloque de horario base en el ancla visual principal del modulo, con descripcion breve y feedback mas visible.
- [ ] Hacer mas evidente en el panel por sede cual sede se esta editando y si usa horario base o propio.
- [ ] Mantener una sola accion principal por bloque y relegar acciones secundarias como `Volver al horario base`.
- [ ] Reusar `PortalAlert` o patrones accesibles equivalentes para feedback, evitando mensajes crudos dispersos.
- [ ] Validar que no se altera el flujo actual de guardado ni los callbacks `onUpdated` existentes.

**Comandos de validacion:**

```bash
pnpm --filter @iwana/portal test -- CalendarSettingsClient BusinessHoursWeekEditor
```

## Task 5: Subordinar formularios secundarios y mejorar escaneo

**Files:**

- Modify: `apps/portal/src/components/settings/CalendarExceptionsPanel.tsx`
- Modify: `apps/portal/src/components/settings/OperationalEventualitiesPanel.tsx`
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`

- [ ] Hacer que los formularios de alta de excepciones y eventualidades no dominen el primer viewport cuando la tarea principal es consulta.
- [ ] Mantener el listado como superficie principal y usar estados colapsables o visualmente subordinados para el alta.
- [ ] Reescribir labels ambiguos hacia lenguaje de negocio mas directo, manteniendo coherencia con la spec de rediseño.
- [ ] Homogeneizar badges, estados y mensajes de feedback entre excepciones y eventualidades.
- [ ] Validar que no aparecen terminos de ausencias personales ni copy tecnico interno.

**Comandos de validacion:**

```bash
pnpm --filter @iwana/portal test -- OperationalEventualitiesPanel CalendarSettingsClient
```

## Task 6: Contextualizar WFM sin reabrir el boundary

**Files:**

- Modify: `apps/portal/src/components/settings/CalendarWfmPanel.tsx`
- Modify: `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx`
- Modify: `apps/portal/src/components/settings/CalendarWfmPanel.spec.tsx`
- Modify: `apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx`

- [ ] Hacer explicito desde el contenedor que este bloque aplica a programacion de visitas y no al horario general de atencion.
- [ ] Si `WfmOperatingHoursManager.tsx` necesita ajustes, limitarlos a presentacion, agrupacion local y mejora de lectura; no mover logica de negocio ni contratos.
- [ ] Si el manager muestra tres subbloques densos, separar visualmente semana operativa, cierres y formulario de alta sin partir el ownership tecnico.
- [ ] Si una mejora interna amenaza con cambiar API o semantica funcional, detenerse y documentar deuda residual en lugar de expandir alcance.

**Comandos de validacion:**

```bash
pnpm --filter @iwana/portal test -- CalendarWfmPanel WfmOperatingHoursManager
```

## Task 7: Validacion integrada y cierre documental

**Files:**

- Modify: `e2e/tests/portal-settings-calendar.spec.ts`
- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Modify: `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md`
- Modify: `docs/quality/CHECKLIST-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md`

- [ ] Ampliar `portal-settings-calendar.spec.ts` para cubrir lectura inicial, responsive minimo y la nueva jerarquia visible de la pantalla.
- [ ] Ejecutar typecheck y tests focalizados del portal antes de marcar la checklist.
- [ ] Actualizar el informe vivo con evidencia, decisiones, deuda residual y comandos ejecutados.
- [ ] Cerrar la checklist nueva solo con evidencia real; no reutilizar ni reabrir la de Fase 06.

**Comandos de validacion final:**

```bash
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal test -- CalendarSettingsClient BusinessHoursWeekEditor CalendarWfmPanel WfmOperatingHoursManager OperationalEventualitiesPanel
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts
```

## Self-review checklist

- [ ] El refinamiento mantiene intactos los boundaries de Organization y WFM.
- [ ] La pantalla comunica mejor las cinco capas del calendario sin cambiar funcionalidad base.
- [ ] El editor semanal deja de depender de una tabla rigida en mobile.
- [ ] Excepciones y eventualidades usan lenguaje visible amigable y operable.
- [ ] WFM queda contextualizado sin mezclarlo con horario base empresarial.
- [ ] Los artefactos nuevos enlazan spec, prompt, checklist e informe vivo.
