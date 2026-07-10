# MOD05 expediente CRM (Vista general, Gestión, Seguimiento) - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ejecutar el rediseño UX/UI del expediente CRM en las secciones Vista general, Gestión y Seguimiento para mejorar claridad operativa, consistencia visual y escaneabilidad sin cambiar contratos backend.

**Architecture:** el alcance es frontend-first en `apps/portal`, con refactor incremental de composición y patrones visuales en componentes del expediente. No se alteran endpoints, DTOs ni reglas de negocio del pipeline.

**Tech Stack:** Next.js App Router, React, TypeScript estricto, Tailwind v4, `@iwana/ui`, `portal-ui`, Jest/Testing Library, Playwright (focal).

---

## Source Artifacts

- Spec principal: `docs/specs/2026-06-03-mod05-expediente-vista-gestion-seguimiento-redesign-design.md`
- Perfil visual rector: `docs/roles/_historico/Perfil_IA_Senior_UI_Systems_Designer_v1.md`
- Guía identidad iWana: `docs/identity/Manual_Implementacion_Identidad_Iwana.md`
- Checklist transversal UI: `docs/quality/CHECKLIST-TRANSVERSAL-PORTAL-UI-REVIEW-v1.0.md`
- Informe vivo transversal: `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`

## Scope

### Build in this plan

- Reordenar la jerarquía de bloques en Vista general.
- Estandarizar headers de secciones y prioridad visual en Gestión.
- Mejorar legibilidad operativa de Seguimiento (acciones, timeline, contexto lateral).
- Consolidar estilos y patrones repetidos en primitives/utilidades compartidas cuando aplique.
- Asegurar responsive y accesibilidad AA en los bloques intervenidos.

### Do not build in this plan

- Cambios de endpoints API, DTOs, migraciones o permisos.
- Redefinir estados de negocio del pipeline.
- Rediseñar navegación global del portal.
- Introducir librerías nuevas fuera del stack aprobado.

## File Structure

### Core files

- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
  Purpose: aplicar nueva jerarquía de Vista general y ordenar acciones de pipeline.
- Modify: `apps/portal/src/components/crm/expedientes/ExpedienteHeader.tsx`
  Purpose: compactar cabecera operativa y reforzar señal de estado.
- Modify: `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx`
  Purpose: estandarizar encabezado por sección y prioridad visual.
- Modify: `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx`
  Purpose: reforzar lectura del timeline y paneles de acción rápida.
- Modify: `apps/portal/src/components/crm/expedientes/expediente-ui.ts`
  Purpose: centralizar metadatos visuales de estado/evento reutilizables.

### Supporting files (if needed)

- Modify: `apps/portal/src/components/shared/portal-ui.tsx`
  Purpose: promover utility/primitive si un patrón se repite en 2+ superficies.
- Modify: `apps/portal/src/lib/portal-status-badge-rules.ts`
  Purpose: mantener consistencia semántica de badges de estado operacional.

### Tests

- Modify: `apps/portal/src/app/dashboard/crm/expedientes/page.spec.tsx`
  Purpose: validar jerarquía y presencia de bloques en Vista general.
- Modify: `apps/portal/src/components/crm/expedientes/SeguimientoTab.spec.tsx`
  Purpose: validar acciones rápidas, filtros y tipificación visual de timeline.
- Modify: `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.spec.tsx`
  Purpose: validar estructura de secciones y prioridad visual por estado.
- Optional: `e2e/tests/portal-crm-expedientes.spec.ts`
  Purpose: validar flujo principal visual-operativo en runtime.

## Task 1: Stop/go y baseline de jerarquía

- [ ] Leer completo el spec: `docs/specs/2026-06-03-mod05-expediente-vista-gestion-seguimiento-redesign-design.md`.
- [ ] Confirmar alcance frontend-only con cero cambios API.
- [ ] Identificar bloques duplicados de información en Vista general para consolidación.
- [ ] Definir orden final de bloques y documentarlo en comentario técnico breve del PR.

**Stop/go:** detener si aparece necesidad de cambio contractual backend o de permisos.

## Task 2: Sprint 1 - Quick wins de alto impacto

**Files:**

- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- `apps/portal/src/components/crm/expedientes/ExpedienteHeader.tsx`
- `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx`
- `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx`

- [ ] Reordenar Vista general al flujo: estado/readiness -> acción recomendada -> progreso -> contexto -> acciones pipeline.
- [ ] Unificar bloque de pendientes para evitar mensajes redundantes.
- [ ] Estandarizar header de cada sección en Gestión (icono, descripción, avance).
- [ ] Introducir tipología visual estable por tipo de evento en Seguimiento.
- [ ] Ajustar densidad y espaciado para mejorar escaneo en desktop sin romper mobile.

**Validación mínima Sprint 1:**

```bash
pnpm --filter @iwana/portal exec tsc -p tsconfig.json --noEmit
pnpm --filter @iwana/portal test -- expediente
```

## Task 3: Sprint 2 - Consolidación estructural

**Files:**

- `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx`
- `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx`
- `apps/portal/src/components/crm/expedientes/expediente-ui.ts`

- [ ] Implementar prioridad visual de secciones (crítica, atención, completa).
- [ ] Reforzar bloque "Acción recomendada ahora" con conectividad a faltantes.
- [ ] Mejorar jerarquía de panel activo en Seguimiento (contacto/responsable/originador).
- [ ] Extraer metadatos visuales reutilizables de eventos a `expediente-ui.ts`.
- [ ] Reducir complejidad interna de timeline separando renderers por tipo de evento si aplica.

**Validación mínima Sprint 2:**

```bash
pnpm --filter @iwana/portal exec tsc -p tsconfig.json --noEmit
pnpm --filter @iwana/portal test -- SeguimientoTab ExpedienteSections
```

## Task 4: Sprint 3 opcional - Hardening y escalabilidad

**Files:**

- `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx`
- `apps/portal/src/components/shared/portal-ui.tsx` (si se promueve patrón)
- `e2e/tests/portal-crm-expedientes.spec.ts` (opcional)

- [ ] Consolidar patrón reusable de timeline operativo para otros módulos.
- [ ] Documentar guideline interna de layout del expediente en comments/utility compartida.
- [ ] Hardening responsive en 375/768/1024/1440.
- [ ] Añadir evidencia visual before/after para cierre.

## Task 5: Criterios de aceptación para PR

- [ ] Primer viewport comunica estado, próximos pasos y acción principal.
- [ ] Gestión tiene patrón visual uniforme en sus headers.
- [ ] Seguimiento mantiene lectura clara por tipo de evento.
- [ ] No hay solapamientos ni pérdida de CTA principal en breakpoints críticos.
- [ ] Contraste/foco cumplen baseline AA.
- [ ] Se reutilizan tokens y primitives de portal.
- [ ] `typecheck` y tests focalizados en verde.

## Task 6: Cierre documental y evidencias

**Files:**

- `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`
- `docs/quality/CHECKLIST-TRANSVERSAL-PORTAL-UI-REVIEW-v1.0.md`

- [ ] Registrar en informe vivo qué sprint fue ejecutado y con qué evidencia.
- [ ] Marcar checklist transversal UI aplicada al PR.
- [ ] Documentar riesgos diferidos y alcance pendiente para siguiente sprint.

## Final Validation Commands

```bash
pnpm --filter @iwana/portal exec tsc -p tsconfig.json --noEmit
pnpm --filter @iwana/portal test -- expediente SeguimientoTab ExpedienteSections
```

Opcional (si se tocó e2e):

```bash
pnpm test:e2e:portal --grep "CRM"
```

## Self-review checklist

- [ ] El cambio mejora jerarquía y escaneabilidad sin alterar negocio.
- [ ] La acción principal es evidente en Vista general.
- [ ] Gestión mantiene ritmo visual consistente por sección.
- [ ] Seguimiento mejora lectura sin perder trazabilidad.
- [ ] No se introducen estilos ad hoc si existe primitive/utilidad equivalente.
- [ ] Evidencia visual y técnica lista para revisión de PR.
