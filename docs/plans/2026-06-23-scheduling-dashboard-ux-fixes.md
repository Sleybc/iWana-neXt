# Scheduling Dashboard UX Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los 7 hallazgos de UX del dashboard de scheduling identificados en la auditoría de Junio 2026: eliminar acciones duplicadas, métricas triplicadas, falta de click en el rail de pendientes, filtro de técnico que no viaja a la agenda, naming engañoso en el drawer y falta de accesibilidad por teclado en la vista lista.

**Architecture:** Todos los cambios son de capa de presentación (componentes React en `apps/portal/src/components/scheduling/` y `SchedulingClient.tsx`). Ningún cambio afecta APIs, DTOs, contratos de módulo ni estado del servidor. Las tareas son independientes entre sí con excepción de T4 (que requiere T2 para evitar conflicto en el mismo archivo).

**Tech Stack:** Next.js App Router · React · TypeScript estricto · Tailwind CSS v4 · `@iwana/ui` · pnpm · Jest

---

## Contexto del módulo

- **`SchedulingClient.tsx`** (`apps/portal/src/components/scheduling/SchedulingClient.tsx`) — orquestador de 1588 líneas; gestiona todo el estado del módulo. Se monta con `surface="dashboard"` desde `apps/portal/src/app/dashboard/scheduling/page.tsx` y con `surface="agenda"` desde la ruta de agenda.
- **`SchedulingDashboard.tsx`** — componente del dashboard analítico; recibe props del client.
- **`PendingVisitRailCard.tsx`** — card arrastrable en el rail lateral de la vista día.
- **`ScheduleCalendar.tsx`** — calendario; propaga `onSelectPendingVisit` al rail pero la card no lo usa.
- **`ScheduleList.tsx`** — vista tabla; filas con `tabIndex={0}` sin handler de teclado.
- **`ScheduleEventDrawer.tsx`** — drawer de detalle de evento; prop `onOpenReschedule` con nombre engañoso.

---

## Task 1: PageHeader — eliminar botón redundante en dashboard

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx` (líneas ~854-870)

El bloque actual del PageHeader en surface="dashboard" tiene dos botones:
1. `<Button "Agendar tarea">` → `/dashboard/scheduling/agenda?open=create`
2. `<Button "Abrir agenda">` → `/dashboard/scheduling/agenda`

El primero navega a otra ruta para hacer lo mismo que el toolbar de la agenda. El dashboard es una pantalla de lectura; la creación ocurre en la agenda. Se reemplaza por una sola CTA de navegación.

- [ ] **Step 1: Localizar y reemplazar el bloque de acciones del PageHeader**

En `SchedulingClient.tsx`, localizar el bloque (aproximadamente líneas 854-870):

```tsx
{!isAgendaSurface && (
  <>
    <Button asChild type="button">
      <Link href="/dashboard/scheduling/agenda?open=create">Agendar tarea</Link>
    </Button>
    <Button asChild type="button" variant="secondary">
      <Link href="/dashboard/scheduling/agenda">Abrir agenda</Link>
    </Button>
  </>
)}
```

Reemplazar por:

```tsx
{!isAgendaSurface && (
  <Button asChild type="button" variant="secondary">
    <Link href="/dashboard/scheduling/agenda">Ir a agenda</Link>
  </Button>
)}
```

- [ ] **Step 2: Verificar que no quedan referencias a la URL con `?open=create` en el PageHeader**

Buscar en el archivo: `agenda?open=create` dentro del bloque `PageHeader`. Solo debe aparecer el link eliminado. El handler del toolbar (`onOpenCreate`) sigue siendo el único punto de creación en la superficie agenda — ese NO se toca.

- [ ] **Step 3: Lint y typecheck**

```bash
cd apps/portal && npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Esperado: sin errores en `SchedulingClient.tsx`.

---

## Task 2: SchedulingDashboard — eliminar SchedulingModuleOverview y extraAction redundante

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingDashboard.tsx`

`SchedulingModuleOverview` repite exactamente las mismas métricas (pendientes, tareas hoy, alertas, saturación) que `SchedulingSummaryStrip` con un segundo formato. Además, `PendingVisitRequestInbox` tiene un `extraActions` con un botón "Ir a agenda" que se vuelve redundante después de T1.

**Cambios en `SchedulingDashboard.tsx`:**
1. Eliminar función `getOpenWorkOrderCount` (solo usada en SchedulingModuleOverview)
2. Eliminar función `DashboardEntryCard` (solo usada en SchedulingModuleOverview)
3. Eliminar función `SchedulingModuleOverview`
4. Eliminar la línea `<SchedulingModuleOverview summary={summary} workOrders={workOrders} />` en el export
5. Eliminar el prop `extraActions` del `PendingVisitRequestInbox` (bloque con `<Link href="/dashboard/scheduling/agenda">`)
6. Limpiar imports huérfanos: `ArrowRight`, `CalendarDays`, `ClipboardList` y `Link` de `next/link` (verificar que `Link` no se use en otro lugar del archivo)

- [ ] **Step 1: Eliminar `getOpenWorkOrderCount`**

Localizar y eliminar (aprox. líneas 40-45):

```typescript
function getOpenWorkOrderCount(workOrders: WfmWorkOrder[]): number {
  return workOrders.filter(
    (workOrder) =>
      workOrder.status === WorkOrderStatus.OPEN || workOrder.status === WorkOrderStatus.ASSIGNED,
  ).length;
}
```

También eliminar `WorkOrderStatus` del import de `@iwana/shared` si es el único consumidor (verificar).

- [ ] **Step 2: Eliminar `DashboardEntryCard`**

Localizar y eliminar la función `DashboardEntryCard` (aprox. líneas 47-116). Es una función local; no está exportada.

- [ ] **Step 3: Eliminar `SchedulingModuleOverview`**

Localizar y eliminar la función `SchedulingModuleOverview` (aprox. líneas 119-195).

- [ ] **Step 4: Eliminar el uso de SchedulingModuleOverview en el export**

En la función `SchedulingDashboard` exportada (aprox. línea 305):

```tsx
<SchedulingModuleOverview summary={summary} workOrders={workOrders} />
```

Eliminar esa línea.

- [ ] **Step 5: Eliminar `workOrders` de props y del export**

En `SchedulingDashboardProps` (aprox. líneas 27-38):

```typescript
interface SchedulingDashboardProps {
  ...
  workOrders: WfmWorkOrder[];
  ...
}
```

Eliminar `workOrders: WfmWorkOrder[];` de la interfaz.

En la función `SchedulingDashboard`, eliminar `workOrders` de los parámetros desestructurados.

En `SchedulingClient.tsx` donde se monta `SchedulingDashboard`, eliminar `workOrders={workOrders}`.

- [ ] **Step 6: Eliminar el `extraActions` de PendingVisitRequestInbox**

En la función `SchedulingDashboard`, localizar (aprox. líneas 328-335):

```tsx
extraActions={
  <Button asChild type="button" variant="ghost">
    <Link href="/dashboard/scheduling/agenda">
      Ir a agenda
      <ArrowRight className="h-4 w-4" aria-hidden={true} />
    </Link>
  </Button>
}
```

Eliminar el prop `extraActions` por completo (dejar el componente `PendingVisitRequestInbox` sin ese prop).

- [ ] **Step 7: Limpiar imports huérfanos**

En la sección de imports de `SchedulingDashboard.tsx`:
- Eliminar `ArrowRight`, `CalendarDays`, `ClipboardList` del import de `lucide-react` (verificar que no quedan otros usos)
- Eliminar `Link` del import de `next/link` si no se usa en otro lugar del archivo
- Eliminar `WfmWorkOrder` del import de `@/lib/api-client` si solo era para workOrders (verificar que no haya otros usos)
- Eliminar `WorkOrderStatus` del import de `@iwana/shared` si getOpenWorkOrderCount era el único consumidor

- [ ] **Step 8: Lint y typecheck**

```bash
cd apps/portal && npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Esperado: sin errores nuevos en `SchedulingDashboard.tsx` ni en `SchedulingClient.tsx`.

---

## Task 3: PendingVisitRailCard — agregar click handler

**Files:**
- Modify: `apps/portal/src/components/scheduling/PendingVisitRailCard.tsx`
- Modify: `apps/portal/src/components/scheduling/ScheduleCalendar.tsx` (función `PendingVisitsRail`)
- Modify (spec): `apps/portal/src/components/scheduling/PendingVisitRailCard.spec.tsx`

La prop `onSelectPendingVisit` ya llega al `PendingVisitsRail` en `ScheduleCalendar.tsx` y se propaga a `PendingVisitRailCard`, pero la card no tiene handler de click ni la prop en su interfaz.

**Cambio en `PendingVisitRailCard.tsx`:**

- [ ] **Step 1: Agregar prop `onClick` a la interfaz**

Reemplazar:

```typescript
interface PendingVisitRailCardProps {
  visitRequest: WfmVisitRequest;
  isSelected?: boolean;
}
```

Por:

```typescript
interface PendingVisitRailCardProps {
  visitRequest: WfmVisitRequest;
  isSelected?: boolean;
  onClick?: () => void;
}
```

- [ ] **Step 2: Usar `onClick` en el componente y hacer el article interactivo**

La card actualmente es un `<article>` con `draggable`. Para soportar click + teclado sin perder el drag, se convierte en un elemento con rol interactivo. Reemplazar la apertura del `<article>` de:

```tsx
export function PendingVisitRailCard({
  visitRequest,
  isSelected = false,
}: PendingVisitRailCardProps) {
  ...
  return (
    <article
      draggable
      onDragStart={(event) => { ... }}
      aria-current={isSelected ? 'true' : undefined}
      className={`cursor-grab rounded-2xl border bg-white p-3 shadow-sm active:cursor-grabbing dark:bg-dark-surface-2 ${
        isSelected
          ? 'border-iwana-primary ring-2 ring-iwana-primary/20'
          : 'border-gray-200 dark:border-dark-border'
      }`}
    >
```

Por:

```tsx
export function PendingVisitRailCard({
  visitRequest,
  isSelected = false,
  onClick,
}: PendingVisitRailCardProps) {
  ...
  return (
    <article
      draggable
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onDragStart={(event) => {
        event.dataTransfer.setData(
          PENDING_VISIT_DRAG_MIME,
          serializePendingVisitDragPayload(buildDragPayload(visitRequest)),
        );
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onClick}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      aria-current={isSelected ? 'true' : undefined}
      className={`rounded-2xl border bg-white p-3 shadow-sm dark:bg-dark-surface-2 ${
        onClick ? 'cursor-pointer active:opacity-80' : 'cursor-grab active:cursor-grabbing'
      } ${
        isSelected
          ? 'border-iwana-primary ring-2 ring-iwana-primary/20'
          : 'border-gray-200 dark:border-dark-border'
      } ${
        onClick ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2' : ''
      }`}
    >
```

- [ ] **Step 3: Conectar `onClick` en `PendingVisitsRail` dentro de `ScheduleCalendar.tsx`**

Localizar en `ScheduleCalendar.tsx` la función `PendingVisitsRail` (aprox. línea 705). En el mapeo de cards (aprox. línea 750):

```tsx
{visibleVisits.map((visitRequest) => (
  <PendingVisitRailCard
    key={visitRequest.id}
    visitRequest={visitRequest}
    isSelected={visitRequest.id === selectedPendingVisitRequestId}
  />
))}
```

Reemplazar por:

```tsx
{visibleVisits.map((visitRequest) => (
  <PendingVisitRailCard
    key={visitRequest.id}
    visitRequest={visitRequest}
    isSelected={visitRequest.id === selectedPendingVisitRequestId}
    onClick={onSelectPendingVisit ? () => onSelectPendingVisit(visitRequest.id) : undefined}
  />
))}
```

- [ ] **Step 4: Actualizar el spec de PendingVisitRailCard**

Abrir `PendingVisitRailCard.spec.tsx` y agregar un test para click y teclado. Añadir después de los tests existentes:

```typescript
it('llama onClick al hacer click cuando se provee', async () => {
  const handleClick = jest.fn();
  render(<PendingVisitRailCard visitRequest={mockVisitRequest} onClick={handleClick} />);
  const card = screen.getByRole('button');
  await userEvent.click(card);
  expect(handleClick).toHaveBeenCalledTimes(1);
});

it('llama onClick al presionar Enter cuando se provee', async () => {
  const handleClick = jest.fn();
  render(<PendingVisitRailCard visitRequest={mockVisitRequest} onClick={handleClick} />);
  const card = screen.getByRole('button');
  card.focus();
  await userEvent.keyboard('{Enter}');
  expect(handleClick).toHaveBeenCalledTimes(1);
});

it('no tiene role button cuando no se provee onClick', () => {
  render(<PendingVisitRailCard visitRequest={mockVisitRequest} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
```

Asegurarse de que el archivo importe `userEvent` de `@testing-library/user-event` si no lo tiene.

- [ ] **Step 5: Ejecutar tests relevantes**

```bash
cd apps/portal && npx jest src/components/scheduling/PendingVisitRailCard.spec.tsx --no-coverage 2>&1 | tail -20
```

Esperado: todos los tests pasan.

- [ ] **Step 6: Lint y typecheck**

```bash
cd apps/portal && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "PendingVisitRailCard|ScheduleCalendar" | head -10
```

---

## Task 4: SchedulingCapacityPanel — filtro técnico vía query param + SchedulingClient lo lee en agenda

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingDashboard.tsx` (SchedulingCapacityPanel)
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx` (leer technicianId de searchParams)

Actualmente, click en un técnico del CapacityPanel solo actualiza `filters.technicianId` en el estado del dashboard. Al navegar a la agenda, ese filtro se pierde porque SchedulingClient en agenda tiene su propio estado independiente. La corrección: el botón de cada técnico navega a `/dashboard/scheduling/agenda?technicianId=<id>`, y SchedulingClient en la superficie "agenda" lee ese query param al montar.

**Cambio en `SchedulingDashboard.tsx`:**

- [ ] **Step 1: Cambiar el botón en SchedulingCapacityPanel para navegar con query param**

En la función `SchedulingCapacityPanel`, la interfaz recibe `onFilterTechnician`. Se añade también `router` (ya importado por `useRouter` en el componente padre). La forma más limpia es cambiar el `button` a un link de navegación.

Localizar en `SchedulingCapacityPanel` (aprox. líneas 236-255) el botón:

```tsx
<button
  key={item.assignedUserId}
  type="button"
  onClick={() => onFilterTechnician(item.assignedUserId)}
  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-iwana-primary/30 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:bg-dark-surface-3"
>
```

Reemplazar por un Link:

```tsx
<Link
  key={item.assignedUserId}
  href={`/dashboard/scheduling/agenda?technicianId=${item.assignedUserId}`}
  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-iwana-primary/30 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:bg-dark-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-1"
>
```

Y cerrar con `</Link>` en lugar de `</button>`.

Agregar el import de `Link` de `next/link` si fue eliminado en T2 (verificar si ya existe). El import de `Link` en este archivo puede ser necesario de nuevo.

El prop `onFilterTechnician` en `SchedulingCapacityPanelProps` ya no se usa — eliminarlo de la interfaz y del componente.

También en `SchedulingDashboard` exportado (línea ~364):

```tsx
<SchedulingCapacityPanel
  summary={summary}
  techniciansById={techniciansById}
  onFilterTechnician={onFilterTechnician}
/>
```

Quitar `onFilterTechnician={onFilterTechnician}`.

Y en `SchedulingDashboardProps`, el prop `onFilterTechnician` deja de ser necesario si no lo usa ningún componente hijo ya. Verificar: `SchedulingAlertRail` también recibe `onFilterTechnician` (línea ~346). Por lo tanto, **mantener** `onFilterTechnician` en `SchedulingDashboardProps` y en la desestructuración, pero simplemente no pasarlo a `SchedulingCapacityPanel`.

- [ ] **Step 2: Leer `technicianId` de searchParams en SchedulingClient (superficie agenda)**

En `SchedulingClient.tsx`, localizar el `useEffect` que lee `searchParams` para el `?open=create` (aprox. líneas 350-450, busca `searchParams.get('open')`). En ese mismo bloque o en un efecto separado, añadir la lectura de `technicianId`:

```typescript
// Leer technicianId de searchParams en agenda (viene desde CapacityPanel del dashboard)
const technicianIdParam = searchParams.get('technicianId');
```

En el `useEffect` de inicialización de filtros (o como una derivación adicional), si `isAgendaSurface && technicianIdParam`:

```typescript
useEffect(() => {
  if (isAgendaSurface && technicianIdParam) {
    setFilters((current) => ({ ...current, technicianId: technicianIdParam }));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

Este efecto debe correr solo una vez al montar (dependencia `[]`), antes de que `loadData` se dispare. Verificar que `setFilters` con el `technicianId` no cause doble carga. La secuencia correcta es: leer param → setFilters → el useEffect de `loadData` (que depende de `filters`) se dispara una sola vez con el valor correcto.

**Alternativa más segura** (para evitar doble render): inicializar `filters` incluyendo el query param desde el inicio. En la inicialización del estado `filters`:

```typescript
const [filters, setFilters] = useState<SchedulingFilters>(() => {
  const base = buildDefaultSchedulingFilters(getDefaultSchedulingViewForRole());
  // En ambiente SSR searchParams puede estar vacío; la lectura solo importa en cliente
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const technicianId = params.get('technicianId');
    if (technicianId) {
      return { ...base, technicianId };
    }
  }
  return base;
});
```

Esta alternativa es más limpia porque no requiere un efecto adicional. Usar esta.

- [ ] **Step 3: Lint y typecheck**

```bash
cd apps/portal && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "SchedulingDashboard|SchedulingClient" | head -15
```

---

## Task 5: Renombrar `onOpenReschedule` → `onOpenMoveToPending`

**Files:**
- Modify: `apps/portal/src/components/scheduling/ScheduleEventDrawer.tsx` (líneas 44, 113, 258)
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx` (línea ~1479)
- Modify: `apps/portal/src/components/scheduling/ScheduleEventDrawer.spec.tsx` (líneas 16, 56)

Rename mecánico: el prop `onOpenReschedule` abre `MoveEventToPendingDialog`, no `RescheduleEventDialog`. El nombre crea confusión para lectores del código.

- [ ] **Step 1: Renombrar en `ScheduleEventDrawer.tsx`**

Tres ubicaciones en ese archivo:

1. En la interfaz (línea ~44): `onOpenReschedule: () => void;` → `onOpenMoveToPending: () => void;`
2. En la desestructuración (línea ~113): `onOpenReschedule,` → `onOpenMoveToPending,`
3. En el JSX (línea ~258): `onClick={onOpenReschedule}` → `onClick={onOpenMoveToPending}`

- [ ] **Step 2: Renombrar en `SchedulingClient.tsx`**

Línea ~1479: `onOpenReschedule={() => {` → `onOpenMoveToPending={() => {`

- [ ] **Step 3: Renombrar en `ScheduleEventDrawer.spec.tsx`**

Líneas 16 y 56: `onOpenReschedule={jest.fn()}` → `onOpenMoveToPending={jest.fn()}`

- [ ] **Step 4: Ejecutar tests del drawer**

```bash
cd apps/portal && npx jest src/components/scheduling/ScheduleEventDrawer.spec.tsx --no-coverage 2>&1 | tail -15
```

Esperado: todos los tests pasan.

- [ ] **Step 5: Typecheck**

```bash
cd apps/portal && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "ScheduleEventDrawer|SchedulingClient" | head -10
```

---

## Task 6: ScheduleList — accesibilidad por teclado en filas

**Files:**
- Modify: `apps/portal/src/components/scheduling/ScheduleList.tsx` (línea ~156-161)

Las filas tienen `tabIndex={0}` y `focus-visible:ring-*` pero carecen de `onKeyDown`. El usuario que navega por teclado no puede activar una fila con Enter/Espacio (WCAG 2.1 SC 2.1.1 — Keyboard).

- [ ] **Step 1: Agregar `onKeyDown` al `<tr>`**

Localizar el `<tr>` (aprox. líneas 156-161):

```tsx
<tr
  key={event.id}
  role="row"
  tabIndex={0}
  className="border-b border-gray-50 transition-colors hover:bg-iwana-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-inset dark:border-dark-border dark:hover:bg-dark-surface-3"
>
```

Reemplazar por:

```tsx
<tr
  key={event.id}
  role="row"
  tabIndex={0}
  onClick={() => onSelectEvent(event)}
  onKeyDown={(keyEvent) => {
    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
      keyEvent.preventDefault();
      onSelectEvent(event);
    }
  }}
  className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-iwana-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-inset dark:border-dark-border dark:hover:bg-dark-surface-3"
>
```

Nota: también se agrega `cursor-pointer` y `onClick` en el `<tr>` para que el click en cualquier parte de la fila también active el detalle (mejora de usabilidad además de accesibilidad). El botón "Ver detalle" dentro de la fila sigue funcionando de forma independiente.

- [ ] **Step 2: Typecheck**

```bash
cd apps/portal && npx tsc --noEmit --project tsconfig.json 2>&1 | grep ScheduleList | head -5
```

---

## Task 7: Banner persistente de modo demo

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx` (cerca del bloque de infoMessage/feedback)

Actualmente, cuando `shouldUseSchedulingDemoState` inyecta datos demo, solo dispara un `setInfoMessage` con timeout de 8s. En producción el operador podría ver datos falsos sin saberlo una vez que el toast desaparece.

- [ ] **Step 1: Agregar `PortalAlert` persistente cuando se usa demo state**

Localizar en el JSX de `SchedulingClient.tsx` el bloque donde se renderiza `infoMessage` (busca `infoMessage &&` o `PortalAlert variant="info"`). En la misma zona, agregar antes o después (pero siempre visible):

```tsx
{shouldUseSchedulingDemoState && (
  <PortalAlert
    variant="warning"
    title="Modo demostración activo"
    description="Los datos mostrados son de muestra y no corresponden a información real del tenant."
  />
)}
```

Este bloque debe renderizarse en ambas superficies (dashboard y agenda) cuando la condición es verdadera.

- [ ] **Step 2: Verificar que `shouldUseSchedulingDemoState` es accesible en el render**

`shouldUseSchedulingDemoState` es importado como función (desde `./scheduling-demo-data`). Verificar que en el archivo se llama como `shouldUseSchedulingDemoState` (sin parámetros) y devuelve boolean. Si se llama con argumentos, ajustar el condicional.

- [ ] **Step 3: Typecheck**

```bash
cd apps/portal && npx tsc --noEmit --project tsconfig.json 2>&1 | grep SchedulingClient | head -5
```

---

## Checklist final

- [ ] Todos los typecheck pasan (`pnpm --filter @iwana/portal typecheck` o equivalente)
- [ ] Todos los tests del módulo pasan (`cd apps/portal && npx jest src/components/scheduling/ --no-coverage`)
- [ ] No hay imports no utilizados (`pnpm lint` sin errores nuevos)
- [ ] El botón "Agendar tarea" ya no aparece en el PageHeader del dashboard
- [ ] `SchedulingModuleOverview` no existe en el bundle
- [ ] Click en `PendingVisitRailCard` activa `onSelectPendingVisit`
- [ ] Click en técnico del CapacityPanel navega a `/agenda?technicianId=...`
- [ ] `onOpenReschedule` no existe en ningún archivo del módulo
- [ ] Filas de `ScheduleList` responden a Enter y Espacio
- [ ] Banner de demo es visible mientras `shouldUseSchedulingDemoState` es true
