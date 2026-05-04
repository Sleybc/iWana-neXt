# 2026-05-04 — Portal UI Fase 02 correctivos

**Tipo:** SPEC correctivo  
**Estado:** En revision  
**Fecha:** 2026-05-04  
**Modulo:** Portal empresarial (`apps/portal`)

## 1. Contexto

Este correctivo extiende la ejecucion de la Fase 02 de refinamiento UI del portal para cerrar hallazgos abiertos sobre consistencia visual, adopcion incompleta de primitives, evidencia visual insuficiente y cierre E2E no suficientemente robusto.

Artefactos base:

- [`PLAN-TRANSVERSAL-PORTAL-REFINAMIENTO-UI-FASE-02-v1.0.md`](../../plans/PLAN-TRANSVERSAL-PORTAL-REFINAMIENTO-UI-FASE-02-v1.0.md)
- [`PROMPT-TRANSVERSAL-PORTAL-REFINAMIENTO-UI-FASE-02-v1.0.md`](../../prompts/PROMPT-TRANSVERSAL-PORTAL-REFINAMIENTO-UI-FASE-02-v1.0.md)
- [`2026-05-04-portal-ui-refinamiento-fase-02-design.md`](./2026-05-04-portal-ui-refinamiento-fase-02-design.md)
- [`INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md`](../../informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md)

## 2. Problema a corregir

Persisten remanentes visuales heredados dentro del alcance del plan en Comercial, Settings, Users, Profile y CRM, especialmente combinaciones de:

- `rounded-[24px]` / `rounded-[28px]`
- `shadow-iwana-*`
- `linear-gradient(...)`

Adicionalmente:

1. `PortalSectionHeader` fue creada pero no adoptada de forma real.
2. El informe vivo declara limpieza que no coincide con el estado del codigo.
3. CA-PUI-10 no tiene evidencia before/after real versionada por ruta y breakpoint.
4. El cierre E2E debe endurecerse para evitar considerar limpio un baseline que depende de una corrida aislada.

## 3. Objetivos

1. Cerrar CA-PUI-03 y CA-PUI-08 con una barrida completa dentro del alcance del plan.
2. Adoptar primitives locales donde aporten una capa sistemica real y no solo reemplazos cosmeticos.
3. Cerrar CA-PUI-10 con evidencia before/after desktop/mobile versionada en el repositorio.
4. Corregir el informe vivo para que refleje el estado real del codigo y de la validacion.
5. Confirmar el cierre E2E local del portal con corrida completa estable usando Chrome local.

## 4. Alcance

### Incluido

- Componentes y pantallas del portal en:
  - `components/commercial/**`
  - `components/settings/**`
  - `components/users/**`
  - `components/profile/**`
  - `components/crm/**`
- Ajustes adyacentes estrictamente necesarios para mantener coherencia de las pantallas anteriores.
- `PortalSectionHeader`, `PortalPanel`, `PortalAlert`, `PortalEmptyState` e `interactiveFocusClassName`.
- Suites E2E del portal afectadas por los hallazgos actuales.
- Evidencias versionadas bajo `docs/informes/evidencias/portal-ui-fase-02/`.
- Informe vivo de MOD02.

### Excluido

- Cambios de contratos API, auth, tenancy, RBAC o arquitectura backend.
- Rediseño de areas fuera del alcance del plan original.
- Migracion de primitives a `@iwana/ui` en esta fase.

## 5. Alternativas consideradas

### Opcion A — Barrida completa con adopcion real de primitives

Se corrigen todos los remanentes del scope acordado, agrupando por familias visuales y usando las primitives locales donde encajen semantica y estructuralmente.

**Ventajas:** cierra deuda sistemica, alinea informe con realidad, reduce recaidas.  
**Costo:** mas cambios coordinados y mayor validacion visual.  
**Decision:** **aprobada**.

### Opcion B — Reemplazos esteticos minimos por archivo

Se corrigen solo los archivos citados o cada remanente de forma aislada, sin consolidar headers/alerts/panels.

**Ventajas:** menor impacto inmediato.  
**Desventajas:** mantiene drift estructural y deja primitives infrautilizadas.  
**Decision:** descartada.

### Opcion C — Evidencia e informe primero, UI despues

Se documenta la deuda antes de remediarla.

**Ventajas:** rapido para auditoria parcial.  
**Desventajas:** no cierra los criterios funcionales del plan.  
**Decision:** descartada.

## 6. Diseno de remediacion

### 6.1 Regla de limpieza visual

Dentro del scope acordado no deben quedar superficies principales o estados operativos que sigan dependiendo de combinaciones heredadas de radios grandes, sombras legacy y gradientes cuando ya existe una primitive local equivalente.

La remediacion se hara por familias:

1. **Panels/surfaces** -> `PortalPanel`
2. **Section headers repetidos** -> `PortalSectionHeader`
3. **Alerts, estados de exito/error/danger** -> `PortalAlert`
4. **Estados vacios** -> `PortalEmptyState`
5. **Foco visible consistente** -> `interactiveFocusClassName`

### 6.2 Criterio de adopcion de `PortalSectionHeader`

`PortalSectionHeader` se adopta en puntos donde hoy existe una estructura repetida de:

- eyebrow opcional
- titulo principal
- descripcion secundaria
- acciones alineadas

No se fuerza en layouts donde el header tenga semantica muy distinta, pero debe quedar al menos incorporada en las superficies clave del scope para dejar de ser una primitive huerfana.

### 6.3 Comportamiento seguro

Los correctivos UI no deben alterar:

- consumo de APIs self-service
- reglas de tenancy
- permisos por rol
- formularios mas alla de sincronizacion visual, accesible o endurecimiento de interaccion

### 6.4 Cierre del flake E2E

El hallazgo de Users caso 4 se tratara como un problema real de estabilidad, no como ruido. La correccion puede vivir en:

- sincronizacion/interaccion del test, si el producto ya es correcto
- producto, si existe carrera de sesion, filtro o estado accesible

El cierre se acepta solo con corrida completa local del portal limpia.

## 7. Estrategia de evidencia visual

Se generara evidencia **before/after real** para:

- `/auth/login`
- `/dashboard`
- `/dashboard/commercial`
- `/dashboard/crm`
- `/dashboard/settings`
- `/dashboard/users`

Para cada ruta se guardaran capturas:

- desktop
- mobile

El estado **before** se reconstruira desde una referencia anterior del portal en un arbol temporal de trabajo para no contaminar el worktree principal. El estado **after** se capturara desde el codigo corregido.

Estructura objetivo:

`docs/informes/evidencias/portal-ui-fase-02/<ruta>/<before|after>-<desktop|mobile>.*`

El informe vivo debe referenciar rutas concretas a estos artefactos.

## 8. Validacion

Se considera cerrado cuando se cumpla todo lo siguiente:

1. Barrida visual del scope completada sin remanentes incompatibles con CA-PUI-03/08 dentro del alcance acordado.
2. `PortalSectionHeader` adoptada al menos en los puntos clave previstos por la remediacion.
3. Evidencia before/after desktop/mobile versionada para las 6 rutas definidas.
4. Informe vivo actualizado sin claims inconsistentes.
5. Validacion tecnica limpia:
   - `pnpm --filter @iwana/portal test`
   - `pnpm --filter @iwana/portal typecheck`
   - `pnpm --filter @iwana/portal lint`
   - `pnpm exec playwright test --config e2e/playwright.portal.local.config.ts`

## 9. Riesgos y mitigacion

| Riesgo | Mitigacion |
|---|---|
| Barrida demasiado amplia fuera del plan | Limitar cambios a las familias y carpetas acordadas; declarar cualquier ajuste adyacente |
| Capturas before alteran el worktree actual | Usar referencia temporal separada |
| E2E vuelva a pasar solo de forma aislada | Usar corrida completa como baseline de cierre |
| Informe vuelva a sobredeclarar | Basar toda conclusion en busquedas y evidencia versionada |

## 10. Resultado esperado

Al finalizar, el portal debe quedar consistente con la capa de primitives definida para la Fase 02, con evidencia visual auditable y cierre E2E local verificable, sin depender de afirmaciones manuales ni de estados parciales del refactor.
