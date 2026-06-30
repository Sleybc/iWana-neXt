# MOD09 — Agenda manual y persistencia del calendario en Despacho

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development
> o executing-plans para ejecutar este plan task-by-task. Los pasos usan
> checkbox (`- [ ]`) para tracking.

**Goal:** Permitir al operador agendar una `VisitRequest` manualmente
eligiendo tecnico + fecha + hora desde el drawer de despacho, y mantener
el calendario semanal visible al cerrar el drawer cuando existan
recomendaciones calculadas.

**Architecture:** Cambio 100% frontend. El backend ya soporta agendamiento
manual via `POST /api/v1/wfm/visit-requests/:id/schedule` con DTO
`scheduledStartAt + scheduledEndAt + assignedUserId` (verificado en
`apps/api/src/modules/wfm/services/visit-requests.service.ts:509-574`).
No hay cambios de API, modelo de datos, migraciones ni boundaries.
El cambio queda en `apps/portal/src/components/scheduling/`.

**Tech Stack:** Next.js App Router, React, TypeScript estricto, Tailwind v4,
Zod (validaciones via backend), Jest + Testing Library, Playwright,
pnpm, Turborepo.

---

## File structure map

### Modify

- `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
  - Handler `onClose` del panel de despacho (lineas 1108-1114).
  - Render del `WeeklyTechnicianMatrix` (lineas 1020-1029) para no exigir
    `activeMode === 'matrix'` cuando hay `recommendations` y solicitud seleccionada.
  - Extraccion opcional de helper `scheduleVisitRequestWithFollowUp(...)` para
    compartir la cadena de post-confirmacion entre el dialog actual y el nuevo
    handler de agenda manual.
  - Nuevo handler `onConfirmManualSchedule` pasado al
    `VisitRequestRecommendationPanel`.
- `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx`
  - Nueva prop `onConfirmManualSchedule` opcional.
  - Nuevo estado local para el mini-form (tecnico, fecha, hora, duracion).
  - Nuevo bloque toggleable "Agendar manualmente" en Paso 1.
  - Reuso de `useOperatingWindow`, `requestTimeOptions` y `PortalAlert`.
- `apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx`
  - Aserciones para persistencia de `activeMode='matrix'` al cerrar drawer
    con recomendaciones.
  - Aserciones para volver a `activeMode='inbox'` al cerrar sin recomendaciones.
- `e2e/tests/portal-wfm-scheduling.spec.ts`
  - Caso nuevo: agendar manualmente sin ejecutar "Calcular recomendaciones".

### Create

- `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx`
  (si no existe) o ampliar con casos para el mini-form manual.
- `docs/specs/SPEC-WFM-PENDING-VISITS-AGENDA-MANUAL-v1.0.md`
- `docs/plans/2026-06-06-mod09-pending-visits-agenda-manual.md` (este archivo)
- `docs/informes/INFORME-WFM-PENDING-VISITS-AGENDA-MANUAL-v1.0.md` (al cierre)

### No tocar

- Backend, DTOs, migraciones, seeds.
- `ScheduleEventForm.tsx`, `ScheduleEventDrawer.tsx`.
- `SPEC-WFM-PENDING-VISITS-DESPACHO-VISUAL-v1.0.md`,
  `SPEC-WFM-PENDING-VISITS-ACTO-OPERATIVO-v1.0.md`.

---

## Task 1: Persistir el calendario al cerrar el drawer

**Bloque:** UI/UX — bajo riesgo, aislado.

### Step 1: Leer y entender el handler actual

- [ ] Leer `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx:1108-1114`
  y entender el contrato del `onClose` del `VisitRequestRecommendationPanel`.
- [ ] Leer las lineas 1020-1029 (render del `WeeklyTechnicianMatrix`) y
  confirmar la condicion `activeMode === 'matrix'` que sera suavizada.
- [ ] Leer `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx`
  para entender `onClose?: () => void` (linea 55) y los puntos donde se invoca.

### Step 2: Tests rojo

- [ ] En `PendingVisitRequestsView.spec.tsx`, agregar un test:
  - "cierra el drawer con recomendaciones y mantiene `activeMode='matrix'`".
  - Renderizar con una solicitud seleccionada, simular el calculo de
    recomendaciones, disparar el `onClose` del panel.
  - Asertar que la matriz sigue visible (`WeeklyTechnicianMatrix` en el DOM)
    y que `activeMode` interno es `matrix` (verificable por query o por
    spy en `setActiveMode`).
- [ ] Agregar segundo test:
  - "cierra el drawer sin recomendaciones y vuelve a `activeMode='inbox'`".
  - Mismo setup sin haber calculado recomendaciones; el inbox debe seguir
    visible.

### Step 3: Implementar cambio

- [ ] En `PendingVisitRequestsView.tsx`, redefinir el `onClose` del
  `VisitRequestRecommendationPanel`:

  ```tsx
  onClose={() => {
    setIsDispatchPanelOpen(false);
    setRecommendationError(null);
    if (recommendations.length === 0) {
      setActiveMode('inbox');
    }
    // Si hay recomendaciones, activeMode permanece en 'matrix' y la
    // matriz sigue visible como contexto del operador.
  }}
  ```

- [ ] En el render del bloque principal, suavizar la condicion para que
  la matriz se muestre si `activeMode === 'matrix'` o si hay
  `recommendations` y la solicitud seleccionada sigue vigente:

  ```tsx
  {activeMode === 'inbox' && recommendations.length === 0 ? (
    <PendingVisitRequestInbox ... />
  ) : ... : (
    <WeeklyTechnicianMatrix ... />
  )}
  ```

- [ ] Verificar que el efecto de las lineas 697-702 (que resetea
  recomendaciones al cambiar `selectedVisitRequestId`) sigue intacto.

### Step 4: Tests verde

- [ ] Ejecutar
  `pnpm --filter @iwana/portal test -- PendingVisitRequestsView.spec.tsx`
  y confirmar que los dos tests nuevos pasan.
- [ ] Si algun test preexistente falla por el cambio de condicion, ajustar
  expectations sin debilitar la cobertura.
- [ ] Ejecutar `pnpm typecheck` y `pnpm lint` focalizado en el archivo modificado.

### Step 5: Verificacion manual

- [ ] Levantar el portal con `pnpm --filter @iwana/portal dev`.
- [ ] Abrir `http://localhost:3002/dashboard/scheduling/pending-visits`.
- [ ] Seleccionar una solicitud, pulsar "Calcular recomendaciones", cerrar
  el drawer con la X. Confirmar que la matriz permanece visible.
- [ ] Repetir sin pulsar "Calcular recomendaciones" y confirmar que el
  inbox es lo que queda visible.

---

## Task 2: Mini-form "Agendar manualmente" en Paso 1

**Bloque:** UI principal — tamano medio, aislado al drawer.

### Step 1: Disenar el sub-formulario

- [ ] Revisar primitives disponibles en `@iwana/ui`:
  `Button`, `Input`, `Select`, `DatePicker`, `Dialog` (ya usados).
  Confirmar si existe primitive `Disclosure` o equivalente para el toggle.
  Si no existe, usar `<details>` nativo con estilo consistente (mismo
  `rounded-2xl border` que el resto del drawer).
- [ ] Confirmar `requestTimeOptions` (linea 166 del panel) y
  `useOperatingWindow` (linea 159) son reusables sin cambios.

### Step 2: Tests rojo para el mini-form

- [ ] En `VisitRequestRecommendationPanel.spec.tsx` (crear si no existe),
  agregar tests:
  - "el toggle 'Agendar manualmente' expande y colapsa el sub-formulario".
  - "el CTA 'Confirmar agenda manual' envia el payload correcto al padre
    via `onConfirmManualSchedule`".
  - "validaciones UI muestran mensaje cuando falta tecnico".
  - "validaciones UI muestran mensaje cuando la hora cae fuera de la
    jornada operativa".
- [ ] Stubs minimos para `techniciansById` y `requestTimeOptions` (3-4
  tecnicos, 4 opciones de horario).

### Step 3: Implementar el sub-formulario

- [ ] En `VisitRequestRecommendationPanel.tsx`, agregar al interface de
  props:

  ```ts
  onConfirmManualSchedule?: (payload: {
    assignedUserId: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
  }) => Promise<void>;
  ```

- [ ] Agregar estado local:

  ```ts
  const [isManualExpanded, setIsManualExpanded] = useState(false);
  const [manualTechnicianId, setManualTechnicianId] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualDurationMinutes, setManualDurationMinutes] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  ```

- [ ] Sincronizar `manualDurationMinutes` con `durationMinutes` por defecto
  via `useEffect` cuando cambia la solicitud seleccionada.
- [ ] Renderizar el bloque toggleable despues de los selects de Duracion
  y Horizonte, antes del boton "Calcular recomendaciones". Estructura:

  ```tsx
  <div className="rounded-2xl border border-gray-200 p-3 dark:border-dark-border">
    <button
      type="button"
      aria-expanded={isManualExpanded}
      aria-controls="visit-request-manual-panel"
      onClick={() => setIsManualExpanded((v) => !v)}
      className="..."
    >
      <span>Prefiero agendar manualmente</span>
      <ChevronDown className={...} aria-hidden="true" />
    </button>
    {isManualExpanded && (
      <div id="visit-request-manual-panel" className="mt-3 space-y-3 border-t border-gray-100 pt-3 dark:border-dark-border">
        {/* Select tecnico */}
        <Select
          id="visit-request-manual-technician"
          label="Tecnico"
          value={manualTechnicianId}
          options={Array.from(techniciansById.values()).map((t) => ({
            value: t.id,
            label: getTechnicianDisplayName(t),
          }))}
          onChange={(e) => setManualTechnicianId(e.target.value)}
        />
        {/* DatePicker + Select hora */}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <DatePicker
            id="visit-request-manual-date"
            label="Fecha"
            value={toDateFromLocalDateValue(manualDate)}
            onChange={(date) => setManualDate(date ? formatLocalDate(date) : '')}
          />
          <Select
            id="visit-request-manual-time"
            label="Hora de inicio"
            value={manualStartTime}
            options={requestTimeOptions}
            onChange={(e) => setManualStartTime(e.target.value)}
          />
        </div>
        {/* Duracion reutilizada */}
        <Select
          id="visit-request-manual-duration"
          label="Duracion"
          value={manualDurationMinutes}
          options={durationOptions}
          onChange={(e) => setManualDurationMinutes(e.target.value)}
        />
        {/* Hora de fin calculada */}
        {manualStartTime && manualDurationMinutes && (
          <p className="text-xs text-gray-500">
            Termina a las {formatComputedEndTime(manualStartTime, manualDurationMinutes)}
          </p>
        )}
        {/* Reusar PortalAlert de ventana operativa cuando aplique */}
        {manualError && (
          <PortalAlert variant="error" title="No se puede agendar" description={manualError} />
        )}
        {/* CTA */}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="primary"
            loading={isLoadingRecommendations /* reusar el flag para evitar un state extra */}
            disabled={!manualTechnicianId || !manualDate || !manualStartTime || !manualDurationMinutes}
            onClick={async () => {
              try {
                setManualError(null);
                const start = toIsoFromLocalDateAndTime(manualDate, manualStartTime);
                if (!start) throw new Error('Fecha u hora invalida.');
                const end = addMinutesIso(start, Number(manualDurationMinutes));
                if (!onConfirmManualSchedule) {
                  throw new Error('No hay handler de agenda manual configurado.');
                }
                await onConfirmManualSchedule({
                  assignedUserId: manualTechnicianId,
                  scheduledStartAt: start,
                  scheduledEndAt: end,
                });
              } catch (err) {
                setManualError(err instanceof Error ? err.message : 'Error inesperado.');
              }
            }}
          >
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            Confirmar agenda manual
          </Button>
        </div>
      </div>
    )}
  </div>
  ```

- [ ] Crear helper interno `addMinutesIso(iso, minutes)` en
  `schedule-event-time.ts` (o inline si es trivial).

### Step 4: Wire en el padre

- [ ] En `PendingVisitRequestsView.tsx`, pasar la nueva prop
  `onConfirmManualSchedule` al `VisitRequestRecommendationPanel`.
- [ ] Implementar el handler reutilizando la cadena de post-confirmacion.
  Opcion recomendada: extraer un helper:

  ```ts
  async function scheduleVisitRequestWithFollowUp(args: {
    visitRequest: WfmVisitRequest;
    assignedUserId: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    createWorkOrder: boolean;
    workOrderNotes: string;
  }): Promise<WfmVisitRequest> { ... }
  ```

  Y reusarlo desde el `onConfirm` del `ScheduleVisitRequestConfirmDialog`
  (lineas 1136-1215) y desde el nuevo handler de agenda manual.
- [ ] El nuevo handler NO debe abrir el `ScheduleVisitRequestConfirmDialog`
  (eso era diseno explicito: el dialog es para confirmar una recomendacion).
  Despues del schedule manual, cerrar el drawer y refrescar
  matriz + inbox.

### Step 5: Tests verde

- [ ] Ejecutar
  `pnpm --filter @iwana/portal test -- VisitRequestRecommendationPanel.spec.tsx`
  y confirmar que los tests del Step 2 pasan.
- [ ] Ejecutar
  `pnpm --filter @iwana/portal test -- PendingVisitRequestsView.spec.tsx`
  para confirmar que los tests del Task 1 siguen verdes.
- [ ] Ejecutar `pnpm typecheck` y `pnpm lint` focal.

### Step 6: Verificacion manual

- [ ] En el portal local, abrir el drawer de una solicitud con contexto completo.
- [ ] Expandir "Prefiero agendar manualmente".
- [ ] Seleccionar tecnico + fecha + hora + duracion.
- [ ] Pulsar "Confirmar agenda manual" y verificar:
  - La franja queda agendada (refresca matriz y bandeja).
  - El drawer se cierra.
  - No se muestra `ScheduleVisitRequestConfirmDialog`.
- [ ] Repetir con `workType='INSTALLATION'` y una fecha sin ventana operativa.
  Verificar que el `PortalAlert` de ventana operativa se muestra y bloquea el CTA.

---

## Task 3: Validacion focal, E2E y cierre documental

**Bloque:** Cobertura y evidencia.

### Step 1: Anadir caso E2E

- [ ] Abrir `e2e/tests/portal-wfm-scheduling.spec.ts`.
- [ ] Agregar test que:
  1. Hace login con un usuario autorizado.
  2. Navega a `/dashboard/scheduling/pending-visits`.
  3. Selecciona una solicitud con contexto completo.
  4. En el drawer, expande "Prefiero agendar manualmente".
  5. Selecciona tecnico, fecha, hora y duracion.
  6. Pulsa "Confirmar agenda manual".
  7. Verifica que la franja aparece en la matriz.
  8. Verifica que la solicitud pasa a `SCHEDULED` en la bandeja.
- [ ] Usar selectores por rol y texto semantico, no por clase CSS.
- [ ] Reusar los helpers de autenticacion y datos de prueba ya existentes
  en el spec.

### Step 2: Validacion completa

- [ ] Ejecutar:
  `pnpm --filter @iwana/portal test -- PendingVisitRequestsView.spec.tsx`
  `pnpm --filter @iwana/portal test -- VisitRequestRecommendationPanel.spec.tsx`
  `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-wfm-scheduling.spec.ts`
  `pnpm lint`
  `pnpm typecheck`
- [ ] Capturar evidencia visual: screenshots de la matriz preservada y del
  mini-form manual. Guardar en `docs/informes/evidencias/`.

### Step 3: Crear informe de fase

- [ ] Crear `docs/informes/INFORME-WFM-PENDING-VISITS-AGENDA-MANUAL-v1.0.md`
  con la siguiente estructura minima (basada en
  `docs/informes/TEMPLATE-INFORME-FASE-v1.0.md`):
  - Resumen ejecutivo.
  - Entregables implementados (Task 1, Task 2, Task 3 con resumen).
  - Evidencia funcional (resultados de tests, comando, salida).
  - Evidencia de calidad (lint, typecheck, cobertura).
  - Evidencia visual (rutas a screenshots en `docs/informes/evidencias/`).
  - Cambios documentales (esta spec, este plan, este informe).
  - Riesgos residuales.
  - Decision de salida.

### Step 4: Cierre de spec y plan

- [ ] Actualizar `docs/specs/SPEC-WFM-PENDING-VISITS-AGENDA-MANUAL-v1.0.md`:
  marcar estado como `Ejecutado` y agregar la fecha de cierre.
- [ ] Marcar este plan como ejecutado (estado al pie del archivo o commit
  final).

---

## Criterios de aceptacion para PR

- [ ] Task 1 verde: cerrar drawer con recomendaciones mantiene la matriz visible.
- [ ] Task 2 verde: el operador puede agendar manualmente tecnico + fecha + hora
  sin ejecutar "Calcular recomendaciones".
- [ ] Task 3 verde: tests unit + e2e en verde, lint y typecheck en verde.
- [ ] Cero PII en logs, payloads o fixtures.
- [ ] Cero secretos en codigo o tests.
- [ ] Sin cambios backend, sin migraciones, sin nuevos endpoints.
- [ ] Sin cambios en specs visuales previos
  (`SPEC-WFM-PENDING-VISITS-DESPACHO-VISUAL-v1.0.md`,
  `SPEC-WFM-PENDING-VISITS-ACTO-OPERATIVO-v1.0.md`).
- [ ] Informe de fase con evidencia visual y funcional.
- [ ] PR con dos commits minimo: (1) persistencia, (2) mini-form manual +
  e2e + informe.

## Stop / Go

- **GO** si todos los criterios de aceptacion se cumplen y la evidencia esta
  consolidada.
- **STOP** si aparece la necesidad de:
  - Crear un nuevo endpoint o modificar DTOs.
  - Cambiar el modelo de datos o agregar una migracion.
  - Tocar `SPEC-WFM-PENDING-VISITS-DESPACHO-VISUAL-v1.0.md` o
    `SPEC-WFM-PENDING-VISITS-ACTO-OPERATIVO-v1.0.md`.
  - Reutilizar `ScheduleEventForm` (queda descartado por seccion 2.2 del SPEC).
  En cualquiera de esos casos, abrir un ADR corto y escalacion al CTO.

## Referencias

1. `AGENTS.md`
2. `docs/roles/Perfil_IA_EM_Architect_Unificado_v1.md`
3. `docs/specs/SPEC-WFM-PENDING-VISITS-AGENDA-MANUAL-v1.0.md`
4. `docs/specs/SPEC-WFM-PENDING-VISITS-DESPACHO-VISUAL-v1.0.md`
5. `docs/specs/SPEC-WFM-PENDING-VISITS-ACTO-OPERATIVO-v1.0.md`
6. `docs/informes/INFORME-WFM-PENDING-VISITS-DESPACHO-VISUAL-v1.0.md`
7. `docs/informes/TEMPLATE-INFORME-FASE-v1.0.md`
8. `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
9. `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx`
10. `apps/portal/src/components/scheduling/WeeklyTechnicianMatrix.tsx`
11. `apps/api/src/modules/wfm/services/visit-requests.service.ts`
12. `apps/api/src/modules/wfm/dto/schedule-visit-request.dto.ts`
