# Scheduling Agenda High-Density Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `Agenda / Control de agenda` para que `Día` y `Lista` sean las vistas núcleo operativas, `Semana` sea una vista de capacidad semanal, `Mes` sea una vista de carga mensual, y el módulo responda mejor cuando el día visible tenga `20+` tareas.

**Architecture:** La implementación se concentra en `apps/portal/src/components/scheduling`, con `SchedulingClient` como orquestador del umbral de densidad y del default por perfil, `SchedulingToolbar` como superficie de jerarquía y recomendaciones, `ScheduleCalendar` como renderizador de `Día`, `Semana` y `Mes`, y `ScheduleList` como vista principal de volumen alto. No se eliminan vistas ni se renombra `SchedulingView`; se cambia el contrato mental, la composición visual y el comportamiento contextual.

**Tech Stack:** React, Next.js App Router, TypeScript estricto, Tailwind v4, `@iwana/ui`, Jest, Playwright.

---

### Task 1: Formalizar la heurística de densidad y los defaults de vista

**Files:**
- Modify: `apps/portal/src/components/scheduling/scheduling-ui.ts`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Test: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`

- [ ] **Step 1: Crear helpers de estrategia de vista en `scheduling-ui.ts`**

Agregar constantes y helpers explícitos para no dispersar reglas en componentes:

```ts
// apps/portal/src/components/scheduling/scheduling-ui.ts

export const HIGH_DENSITY_DAY_THRESHOLD = 20;

export function isHighDensityScheduleDay(taskCount: number): boolean {
  return taskCount >= HIGH_DENSITY_DAY_THRESHOLD;
}

export function getDefaultSchedulingViewForRole(role?: string | null): SchedulingView {
  switch (role) {
    case UserRole.ADMIN:
    case UserRole.NOC:
    case UserRole.SUPPORT:
    case UserRole.SALES:
      return 'day';
    default:
      return 'day';
  }
}
```

Notas de implementación:

1. No inventar todavía un perfil “supervisión” nuevo si no existe un rol real que lo soporte.
2. Dejar el helper preparado para extenderse cuando producto defina un rol o permiso de supervisión.

- [ ] **Step 2: Usar el default por rol en `SchedulingClient.tsx`**

Reemplazar el `buildDefaultSchedulingFilters()` ciego por una inicialización dependiente del rol cuando la sesión esté disponible.

Objetivo:

1. Mantener fallback a `day`.
2. No hacer auto-switch posterior por densidad.
3. No romper la vista elegida manualmente por el usuario.

Implementación esperada:

```ts
// idea esperada en SchedulingClient.tsx
const roleDefaultView = getDefaultSchedulingViewForRole(user?.role);
```

Luego:

1. Hidratar `filters.view` solo cuando aún no haya una elección explícita previa.
2. No sobrescribir `filters.view` en refrescos de datos.

- [ ] **Step 3: Calcular el estado de alta densidad en `SchedulingClient.tsx`**

Calcular el conteo del día visible y derivar:

```ts
const visibleDayTaskCount = calendarDays[0]?.events.length ?? 0;
const isHighDensityDay = isAgendaSurface && filters.view === 'day' && isHighDensityScheduleDay(visibleDayTaskCount);
```

Reglas:

1. El trigger oficial es `20+` tareas en el día visible.
2. Solo es relevante para la superficie `agenda`.
3. El estado debe alimentar toolbar, copy contextual y énfasis visual.

- [ ] **Step 4: Cubrir unit tests del orquestador**

Agregar o ajustar tests en `SchedulingClient.spec.tsx` para:

1. fallback inicial a `day`
2. activación de `isHighDensityDay` desde 20 eventos
3. no cambiar `filters.view` automáticamente cuando el usuario ya eligió otra vista

Run:

```bash
pnpm --filter @iwana/portal test -- SchedulingClient.spec.tsx
```

Expected:

```text
PASS apps/portal/src/components/scheduling/SchedulingClient.spec.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/scheduling/scheduling-ui.ts apps/portal/src/components/scheduling/SchedulingClient.tsx apps/portal/src/components/scheduling/SchedulingClient.spec.tsx
git commit -m "feat(scheduling): add high-density day heuristic and role-based default view"
```

---

### Task 2: Rejerarquizar el selector y el copy de la vista activa

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingToolbar.tsx`
- Test: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`

- [ ] **Step 1: Separar visualmente vistas operativas y analíticas**

Mantener los labels `Día`, `Semana`, `Mes`, `Lista`, pero hacer explícita la jerarquía:

1. `Día` y `Lista` con mayor peso visual
2. `Semana` y `Mes` con tono secundario

Implementación sugerida:

1. Mantener el mismo set de botones.
2. Introducir una agrupación visual ligera dentro del toolbar.
3. No ocultar `Semana` ni `Mes`.

Ejemplo de intención:

```tsx
// Bloque operativo: Día + Lista
// Bloque analítico: Semana + Mes
```

- [ ] **Step 2: Añadir copy contextual por vista**

Reemplazar o enriquecer el texto descriptivo de la vista activa para que el usuario entienda su promesa:

1. `Día`: “Despacha y ajusta la jornada visible.”
2. `Lista`: “Revisa todo el volumen del rango activo.”
3. `Semana`: “Lee capacidad, presión y huecos de la semana.”
4. `Mes`: “Lee carga y días críticos del mes.”

Esto puede vivir:

1. en `SchedulingToolbar.tsx` si el mensaje depende solo de `filters.view`
2. o en `SchedulingClient.tsx` si se necesita combinar con `isHighDensityDay`

- [ ] **Step 3: Mostrar recomendación contextual en alta densidad**

Cuando `isHighDensityDay === true` y la vista activa sea `day`, mostrar un mensaje no intrusivo:

```text
Para revisar todas las tareas del día, usa Lista. Vuelve a Día para despachar.
```

Reglas:

1. No modal.
2. No auto-switch.
3. Debe desaparecer si el día baja del umbral o cambia el rango.

- [ ] **Step 4: Probar la jerarquía y la recomendación**

Ajustar specs para validar:

1. los cuatro botones siguen visibles
2. `Día` y `Lista` tienen tratamiento de prioridad
3. aparece la recomendación contextual al cruzar 20 tareas en día

Run:

```bash
pnpm --filter @iwana/portal test -- SchedulingClient.spec.tsx
```

Expected:

```text
PASS apps/portal/src/components/scheduling/SchedulingClient.spec.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/scheduling/SchedulingToolbar.tsx apps/portal/src/components/scheduling/SchedulingClient.spec.tsx
git commit -m "feat(scheduling): prioritize day and list views in agenda toolbar"
```

---

### Task 3: Redefinir `Semana` como vista de capacidad semanal

**Files:**
- Modify: `apps/portal/src/components/scheduling/ScheduleCalendar.tsx`
- Test: `apps/portal/src/components/scheduling/ScheduleCalendar.spec.tsx`

- [ ] **Step 1: Cambiar el objetivo visual de `WeekAgenda`**

La vista semanal no debe seguir listando “3 eventos y +N”.

Objetivo nuevo:

1. destacar carga del día
2. mostrar señales de presión
3. permitir drill-down a `Día`

Eliminar o degradar el patrón actual:

```tsx
const nextEvents = day.events.slice(0, 3);
```

Sustituir por indicadores agregados, por ejemplo:

1. total de eventos
2. señal de saturación
3. señal de hueco disponible
4. CTA `Abrir día`

- [ ] **Step 2: Introducir métricas simples de capacidad**

Sin inventar backend nuevo, derivar en frontend con lo disponible:

1. `eventCount`
2. `isHighLoad` usando el conteo del día
3. `hasFreeCapacity` cuando el día tenga baja carga relativa

Para esta fase no hace falta inventar fórmula compleja de ocupación por técnico; basta con que `Semana` deje de fingir ser mini agenda.

- [ ] **Step 3: Redefinir el copy interno de `Semana`**

Actualizar textos como:

1. `Día libre`
2. `Carga ligera`
3. `Carga controlada`
4. `Carga alta`

para que se lean como capacidad semanal y no como lista recortada de tareas.

- [ ] **Step 4: Mantener navegación clara a detalle**

Cada card o celda semanal debe ofrecer una salida explícita a `Día`, reutilizando `onOpenDay` o el mecanismo equivalente.

Regla:

1. `Semana` no despacha fino.
2. `Semana` deriva a `Día` cuando hay que operar.

- [ ] **Step 5: Ajustar tests de la vista semanal**

Actualizar `ScheduleCalendar.spec.tsx` para dejar de esperar mini-listado de eventos y pasar a validar:

1. render de señal de capacidad
2. render de `Abrir día`
3. ausencia de dependencia en `slice(0, 3)` como valor principal

Run:

```bash
pnpm --filter @iwana/portal test -- ScheduleCalendar.spec.tsx
```

Expected:

```text
PASS apps/portal/src/components/scheduling/ScheduleCalendar.spec.tsx
```

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/scheduling/ScheduleCalendar.tsx apps/portal/src/components/scheduling/ScheduleCalendar.spec.tsx
git commit -m "refactor(scheduling): turn weekly view into capacity board"
```

---

### Task 4: Redefinir `Mes` como mapa de carga mensual

**Files:**
- Modify: `apps/portal/src/components/scheduling/ScheduleCalendar.tsx`
- Test: `apps/portal/src/components/scheduling/ScheduleCalendar.spec.tsx`

- [ ] **Step 1: Quitar protagonismo al mini-listado de eventos**

La vista mensual hoy muestra hasta 3 eventos y luego `+N eventos más`.

Objetivo nuevo:

1. el valor principal del día es su carga
2. los chips de eventos dejan de ser la señal dominante

No es obligatorio borrar todos los chips, pero sí hacer que el día se lea primero por estado agregado y no por recorte de eventos.

- [ ] **Step 2: Reforzar estados macro del día**

Usar y consolidar helpers existentes como:

1. `getMonthDayCountVariant`
2. `getMonthDaySurfaceClassName`
3. `getMonthDayOperationalLabel`

pero recalibrando copy y composición para que se lean como mapa de carga mensual.

Ejemplo de intención:

1. badge con conteo
2. label de carga
3. CTA a `Abrir día`
4. chips de eventos solo como señal secundaria si se conservan

- [ ] **Step 3: Alinear el umbral visual con la nueva narrativa**

No usar “carga alta” desde 4 eventos como la narrativa principal si eso contradice el umbral de densidad fuerte del producto (`20+`) en el día visible.

Regla:

1. mantener umbrales locales para el mapa mensual si ayudan a distinguir días
2. no mezclar esos umbrales con el trigger oficial de alta densidad del módulo

- [ ] **Step 4: Actualizar pruebas de la vista mensual**

Los tests deben validar:

1. lectura de carga del día
2. CTA de drill-down
3. composición no dependiente del mini-listado como pieza principal

Run:

```bash
pnpm --filter @iwana/portal test -- ScheduleCalendar.spec.tsx
```

Expected:

```text
PASS apps/portal/src/components/scheduling/ScheduleCalendar.spec.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/scheduling/ScheduleCalendar.tsx apps/portal/src/components/scheduling/ScheduleCalendar.spec.tsx
git commit -m "refactor(scheduling): turn monthly view into workload map"
```

---

### Task 5: Reforzar `Lista` como vista de volumen alto

**Files:**
- Modify: `apps/portal/src/components/scheduling/ScheduleList.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Test: `apps/portal/src/components/scheduling/ScheduleList.spec.tsx`

- [ ] **Step 1: Ajustar el copy de `ScheduleList`**

Hacer explícito que `Lista` es la mejor vista para revisar todo el volumen del rango activo cuando la densidad sube.

Actualizar:

1. eyebrow
2. title
3. description

Ejemplo de intención:

```text
Vista lista
Todo el volumen del rango
Usa la tabla para revisar la jornada completa, ordenar prioridades y detectar excepciones.
```

- [ ] **Step 2: Conectar `Lista` con el estado de alta densidad**

Si `isHighDensityDay` está activo y el usuario cambia a `list`, mostrar una señal positiva, no una alarma:

```text
Estás viendo la superficie recomendada para jornadas de alto volumen.
```

Esto puede vivir en `SchedulingClient.tsx` como `PortalAlert` o bloque contextual ligero.

- [ ] **Step 3: Validar que `Lista` conserva todos los eventos**

No introducir paginado artificial ni recortes nuevos en esta fase.

El objetivo aquí no es reinventar la tabla, sino posicionarla correctamente como mejor salida de volumen.

- [ ] **Step 4: Ajustar tests de la vista lista**

Validar:

1. render de todos los eventos
2. nuevo copy de volumen alto
3. continuidad del CTA de detalle por evento

Run:

```bash
pnpm --filter @iwana/portal test -- ScheduleList.spec.tsx
```

Expected:

```text
PASS apps/portal/src/components/scheduling/ScheduleList.spec.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/scheduling/ScheduleList.tsx apps/portal/src/components/scheduling/SchedulingClient.tsx apps/portal/src/components/scheduling/ScheduleList.spec.tsx
git commit -m "feat(scheduling): position list view as primary surface for high-volume days"
```

---

### Task 6: Verificación de integración y documentación viva

**Files:**
- Modify: `e2e/tests/portal-wfm-scheduling.spec.ts`
- Modify: `docs/informes/INFORME-WFM-AGENDA-UNIVERSAL-DESPACHO-OPERATIVO-v1.0.md`

- [ ] **Step 1: Cubrir escenarios E2E mínimos**

Agregar o ajustar escenarios para:

1. default inicial en `Día`
2. jornada de `20+` tareas que muestra recomendación hacia `Lista`
3. cambio manual entre `Día`, `Lista`, `Semana`, `Mes` sin pérdida de contexto
4. navegación desde `Semana` o `Mes` a `Día`

Run:

```bash
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-wfm-scheduling.spec.ts
```

Expected:

```text
passed
```

- [ ] **Step 2: Actualizar el informe vivo**

Añadir una sección breve que deje trazado:

1. nueva jerarquía de vistas
2. trigger oficial de alta densidad (`20+`)
3. decisión de mantener las cuatro vistas
4. condición futura de observación para `Semana`

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/portal-wfm-scheduling.spec.ts docs/informes/INFORME-WFM-AGENDA-UNIVERSAL-DESPACHO-OPERATIVO-v1.0.md
git commit -m "docs(scheduling): record high-density view strategy and e2e coverage"
```

---

## Self-review checklist

- [ ] `Día` sigue siendo la vista núcleo de despacho
- [ ] `Lista` sube a núcleo operativo complementario
- [ ] `Semana` deja de ser mini agenda y pasa a capacidad semanal
- [ ] `Mes` deja de ser mini agenda y pasa a carga mensual
- [ ] El umbral oficial `20+` solo sugiere, no auto-cambia la vista
- [ ] No se eliminan vistas ni se renombra `SchedulingView`
- [ ] La lógica por perfil solo afecta el default inicial

