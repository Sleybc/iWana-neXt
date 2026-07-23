# MOD06 — Eliminar el tab Resumen: plan de implementación

> **Para agentes ejecutores:** SUB-SKILL REQUERIDA: usa `executing-plans` (o `subagent-driven-development`) para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para seguimiento.

**Objetivo:** Retirar el tab Resumen del módulo Comercial, aterrizar en la superficie de trabajo, y reubicar su contenido único en un panel de actividad accesible desde cualquier tab.

**Arquitectura:** Fase F elevó las alertas sobre la barra de tabs y con eso vació el Resumen: dos de sus tres KPIs repiten insignias que ya existen en el panel destino, y su cola de atención detalla un banner permanentemente visible encima. Lo único sin otro sitio es *Requiere atención* (detalle por ítem) y *Cambios recientes*. Ambos pasan a un panel lateral abierto desde la cabecera, reutilizando `PortalSidePeek` — el primitive ya existe y ya tiene gestión de foco desde Fase E, así que **no se introduce ningún contrato nuevo en el design system**.

**Stack:** Next.js App Router (client components), React 19, Tailwind v4 CSS-first, Jest + Testing Library, primitives de `portal-ui.tsx`.

**Cierra:** H19 (P1) — el tab Resumen es redundante tras Fase F.

---

## Precondición bloqueante

En el momento de redactar este plan el árbol tiene **466 inserciones sin commitear** de otra oleada (deuda de alertas operativas: CTA de catálogo, precio en productos, alta guiada de regla tributaria), incluida la migración `086_tax_rules_classification_nullable.ts`.

**No inicies este plan con esa oleada abierta.** Aunque no hay colisión directa de archivos —esta oleada toca `commercial-alerts.ts` y `api-client.ts`, y este plan no—, ejecutar sobre un árbol sucio impide distinguir qué rompió qué si algo falla.

- [ ] **Paso 0: Verificar árbol limpio antes de empezar**

```bash
git status --short
```

Esperado: sin salida. Si hay contenido, **para** y cierra esa oleada primero.

---

## Decisiones de diseño fijadas

Cerradas aquí para que la ejecución no las reabra. Si AI-PROD-UX revierte alguna, se revierte el plan, no la implementación a medias.

| # | Decisión | Motivo |
| --- | --- | --- |
| 1 | El módulo aterriza en **Planes** | La tira de alertas ya avisa si algo va mal; la superficie de trabajo deja trabajar |
| 2 | *Requiere atención* y *Cambios recientes* van a un **panel lateral** desde la cabecera | Alcanzables desde cualquier tab, no solo desde uno |
| 3 | El panel reutiliza `PortalSidePeek` | Ya existe y ya resuelve foco (Fase E). Inventar un primitive sería costo sin beneficio |
| 4 | Se retiran los KPIs **Planes activos** y **Ofertas vigentes** | Repiten `PlanCatalogPanel.tsx:584` y `BundlesManager.tsx:247` |
| 5 | **Listos para vender** sobrevive, dentro del panel | Es cruce de planes + productos + servicios; ningún manager lo puede mostrar |
| 6 | `'summary'` sale del tipo `CommercialTab`; `?tab=summary` redirige a `plans` | El tab deja de existir; los deep links viejos no deben romper |
| 7 | `CommercialDashboard` se renombra a `CommercialActivityPanel` | Un "dashboard" que no es dashboard desorienta a quien lea el módulo después |
| 8 | El rótulo del botón y del peek es **Actividad** | Vocabulario ya establecido en el portal: `RecentActivityPanel.tsx` e icono `Activity` en `DashboardClient.tsx:4`. No se inventa término nuevo |

**Verificado antes de fijar la decisión 6:** `'summary'` no tiene consumidores fuera del módulo comercial. Las coincidencias en `apps/portal/src` pertenecen al modelo de tabs **propio** de inventario (`inventory-tab-params.ts`) y a un campo de la API de expedientes — ninguno se ve afectado por este cambio.

---

## Estructura de archivos

**Renombrar**
- `CommercialDashboard.tsx` → `CommercialActivityPanel.tsx`
- `CommercialDashboard.spec.tsx` → `CommercialActivityPanel.spec.tsx`

**Modificar**
- `apps/portal/src/components/commercial/CommercialActivityPanel.tsx` — pierde `PortalPanel`, pierde dos KPIs, se vuelve contenido de panel.
- `apps/portal/src/components/commercial/CommercialClient.tsx` — botón de actividad en la cabecera, monta el peek, deja de pasar `summary` al layout.
- `apps/portal/src/components/commercial/CommercialTabLayout.tsx` — pierde el trigger y el content de `summary`, y la prop `summary`.
- `apps/portal/src/components/commercial/commercial-tab-params.ts` — `'summary'` fuera del tipo, default `plans`, alias legacy.
- Specs correspondientes: `CommercialTabLayout.spec.tsx`, `CommercialClient.spec.tsx`, `commercial-tab-params.spec.ts`.

**Sin tocar:** `commercial-alerts.ts`, `CommercialAlertsStrip.tsx`, `commercial-format.ts`, y todos los managers. La tira de alertas es la que sostiene el aviso operativo y no cambia.

---

## Tarea 1 — Convertir el resumen en contenido de panel

**Archivos:**
- Renombrar: `CommercialDashboard.tsx` → `CommercialActivityPanel.tsx` (+ spec)
- Modificar: `apps/portal/src/components/commercial/CommercialActivityPanel.tsx`
- Modificar: `apps/portal/src/components/commercial/CommercialActivityPanel.spec.tsx`

- [ ] **Paso 1: Renombrar conservando historial**

```bash
git mv apps/portal/src/components/commercial/CommercialDashboard.tsx apps/portal/src/components/commercial/CommercialActivityPanel.tsx
git mv apps/portal/src/components/commercial/CommercialDashboard.spec.tsx apps/portal/src/components/commercial/CommercialActivityPanel.spec.tsx
```

- [ ] **Paso 2: Ajustar el test a la forma nueva (falla)**

En `CommercialActivityPanel.spec.tsx`, sustituye el import y el `describe`:

```tsx
import { CommercialActivityPanel } from './CommercialActivityPanel';
```

Reemplaza todas las apariciones de `<CommercialDashboard` por `<CommercialActivityPanel` y `describe('CommercialDashboard'` por `describe('CommercialActivityPanel'`.

Sustituye el test `'estado saludable: 3 KPIs neutros y empty de atención'` por:

```tsx
  it('estado saludable: un indicador de catálogo y empty de atención', () => {
    render(<CommercialActivityPanel summary={buildSummary()} />);

    expect(screen.getByText('Listos para vender')).toBeInTheDocument();
    expect(screen.getByText('Todo al día')).toBeInTheDocument();
    expect(screen.getByText('Sin cambios en los últimos 7 días.')).toBeInTheDocument();
  });

  it('no repite indicadores que ya viven en el panel destino', () => {
    render(<CommercialActivityPanel summary={buildSummary()} />);

    expect(screen.queryByText('Planes activos')).not.toBeInTheDocument();
    expect(screen.queryByText('Ofertas vigentes')).not.toBeInTheDocument();
  });

  it('no envuelve su contenido en un panel propio: el peek ya aporta la cabecera', () => {
    render(<CommercialActivityPanel summary={buildSummary()} />);

    expect(screen.queryByText('Resumen comercial')).not.toBeInTheDocument();
    expect(screen.queryByText('Operación')).not.toBeInTheDocument();
  });
```

En el test `'muestra empty de primera vez sin KPIs'`, la aserción sobre `'Listos para vender'` se mantiene tal cual.

- [ ] **Paso 3: Ejecutar y verificar que falla**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="CommercialActivityPanel"
```

Esperado: FAIL — siguen presentes `Planes activos`, `Ofertas vigentes` y el título `Resumen comercial`.

- [ ] **Paso 4: Retirar los dos KPIs duplicados**

En `OperationalSummaryBody`, elimina las dos `<PortalMetricCard>` cuyos `title` son `"Planes activos"` y `"Ofertas vigentes"`. Deja únicamente la de `"Listos para vender"` y cambia el grid a una sola columna, porque ya no es una rejilla:

```tsx
      <div aria-label="Indicadores comerciales">
        <PortalMetricCard
          eyebrow="Catálogo"
          value={formatCompactNumber(summary.catalogSellableActiveCount)}
          total={formatCompactNumber(summary.catalogActiveCount)}
          title="Listos para vender"
          description="Planes, productos y servicios activos con precio vigente."
          accent={summary.catalogIncompleteActiveCount > 0 ? 'danger' : 'neutral'}
          {...(onNavigateTab ? { onClick: () => onNavigateTab('plans') } : {})}
        />
      </div>
```

- [ ] **Paso 5: Quitar el envoltorio `PortalPanel` y renombrar el componente**

Sustituye la función exportada completa (desde `export function CommercialDashboard` hasta su cierre) por:

```tsx
export function CommercialActivityPanel({
  summary,
  isLoading = false,
  onNavigateTab,
  onRetry,
}: CommercialActivityPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Cargando actividad comercial">
        <PortalSkeletonBlock className="min-h-[148px] rounded-3xl" />
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <PortalSkeletonBlock key={index} className="min-h-[52px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <PortalEmptyState
        title="Actividad no disponible"
        description="No fue posible cargar la actividad comercial."
        {...(onRetry
          ? {
              action: (
                <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
                  Reintentar
                </Button>
              ),
            }
          : {})}
      />
    );
  }

  if (isFirstTimeCatalog(summary)) {
    return (
      <PortalEmptyState
        title="Arma tu oferta comercial"
        description="Crea el primer plan para empezar a vender. Luego podrás sumar productos, servicios, combos y promociones."
        {...(onNavigateTab
          ? {
              action: (
                <Button type="button" size="sm" onClick={() => onNavigateTab('plans')}>
                  Crear plan
                </Button>
              ),
            }
          : {})}
      />
    );
  }

  return (
    <div className="space-y-6">
      <OperationalSummaryBody summary={summary} onNavigateTab={onNavigateTab} />
    </div>
  );
}
```

Renombra también la interfaz de props:

```tsx
interface CommercialActivityPanelProps {
  summary: CommercialDashboardSummary | null;
  isLoading?: boolean;
  onNavigateTab?: CommercialNavigateHandler;
  onRetry?: () => void;
}
```

Elimina `PortalPanel` del import de `portal-ui`, que deja de usarse.

- [ ] **Paso 6: Ejecutar y verificar que pasa**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="CommercialActivityPanel"
```

Esperado: PASS.

- [ ] **Paso 7: Commit**

```bash
git add apps/portal/src/components/commercial/CommercialActivityPanel.tsx apps/portal/src/components/commercial/CommercialActivityPanel.spec.tsx
git commit -m "refactor(mod06): resumen comercial pasa a contenido de panel de actividad"
```

---

## Tarea 2 — Abrir el panel desde la cabecera

**Archivos:**
- Modificar: `apps/portal/src/components/commercial/CommercialClient.tsx`
- Modificar: `apps/portal/src/components/commercial/CommercialClient.spec.tsx`

- [ ] **Paso 1: Escribir el test (falla)**

Añade al `describe('CommercialClient', ...)` de `CommercialClient.spec.tsx`:

```tsx
  it('abre la actividad comercial desde la cabecera en cualquier tab', async () => {
    const user = userEvent.setup();
    mockSearchParams = new URLSearchParams('tab=taxation');
    getDashboardSummary.mockResolvedValue(
      buildSummary({
        attentionItems: [
          {
            id: 'b1',
            name: 'Combo hogar',
            entityType: 'bundle',
            reason: 'expiring_soon',
            destinoTab: 'bundles',
            validTo: '2026-07-30T00:00:00.000Z',
            usesRemaining: null,
          },
        ],
      }),
    );

    render(<CommercialClient />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Actividad/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Actividad/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Requiere atención')).toBeInTheDocument();
    expect(screen.getByText('Cambios recientes')).toBeInTheDocument();
  });

  it('anuncia en el botón cuántos ítems requieren atención', async () => {
    mockSearchParams = new URLSearchParams('tab=plans');
    getDashboardSummary.mockResolvedValue(
      buildSummary({
        attentionItems: [
          {
            id: 'b1',
            name: 'Combo hogar',
            entityType: 'bundle',
            reason: 'expiring_soon',
            destinoTab: 'bundles',
            validTo: null,
            usesRemaining: null,
          },
          {
            id: 'p1',
            name: 'Plan fibra',
            entityType: 'plan',
            reason: 'missing_current_price',
            destinoTab: 'plans',
            validTo: null,
            usesRemaining: null,
          },
        ],
      }),
    );

    render(<CommercialClient />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Actividad comercial, 2 ítems requieren atención' }),
      ).toBeInTheDocument();
    });
  });
```

- [ ] **Paso 2: Ejecutar y verificar que falla**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="CommercialClient"
```

Esperado: FAIL — no existe el botón `Actividad`.

- [ ] **Paso 3: Implementar el disparador y el peek**

En `CommercialClient.tsx`, ajusta los imports:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { CommercialActivityPanel } from '@/components/commercial/CommercialActivityPanel';
import { PortalAlert, PortalSidePeek, PortalSkeletonBlock } from '@/components/shared/portal-ui';
```

Añade el estado y el conteo, junto al resto de `useState`:

```tsx
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  const attentionCount = useMemo(() => summary?.attentionItems.length ?? 0, [summary]);
```

Sustituye el bloque de `actions` del `PageHeader`:

```tsx
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsActivityOpen(true)}
              aria-label={
                attentionCount > 0
                  ? `Actividad comercial, ${attentionCount} ${attentionCount === 1 ? 'ítem requiere' : 'ítems requieren'} atención`
                  : 'Actividad comercial'
              }
            >
              <Activity className="h-4 w-4" aria-hidden="true" />
              Actividad
              {attentionCount > 0 && (
                <span className="ml-1 rounded-full bg-iwana-surface-soft px-2 py-0.5 font-mono text-xs tabular-nums text-iwana-secondary-700 dark:bg-dark-surface-3 dark:text-iwana-primary-300">
                  {attentionCount}
                </span>
              )}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Actualizar
            </Button>
          </>
        }
```

Sustituye el montaje de `CommercialTabLayout` para que deje de recibir `summary`, y añade el peek justo después:

```tsx
      <CommercialTabLayout
        canEdit={canEdit}
        activeTab={route.tab}
        taxationSubTab={route.taxationSubTab}
        onTabChange={handleTabChange}
        onTaxationSubTabChange={handleTaxationSubTabChange}
      />

      <PortalSidePeek
        open={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
        eyebrow="Operación"
        title="Actividad comercial"
        description="Qué requiere atención y qué cambió en los últimos 7 días."
      >
        <CommercialActivityPanel
          summary={summary}
          isLoading={summaryLoading}
          onNavigateTab={(tab, options) => {
            setIsActivityOpen(false);
            handleNavigateTab(tab, options);
          }}
          onRetry={handleRefresh}
        />
      </PortalSidePeek>
```

- [ ] **Paso 4: Ejecutar y verificar que pasa**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="CommercialClient"
```

Esperado: PASS.

- [ ] **Paso 5: Commit**

```bash
git add apps/portal/src/components/commercial/CommercialClient.tsx apps/portal/src/components/commercial/CommercialClient.spec.tsx
git commit -m "feat(mod06): actividad comercial accesible desde la cabecera en cualquier tab"
```

---

## Tarea 3 — Sacar `summary` del modelo de rutas

**Archivos:**
- Modificar: `apps/portal/src/components/commercial/commercial-tab-params.ts`
- Modificar: `apps/portal/src/components/commercial/commercial-tab-params.spec.ts`

- [ ] **Paso 1: Escribir el test (falla)**

Sustituye en `commercial-tab-params.spec.ts` las aserciones que esperan `tab: 'summary'` y añade la cobertura del alias legacy:

```ts
  it('aterriza en planes cuando no hay tab en la URL', () => {
    expect(resolveCommercialRoute(null)).toEqual({
      tab: 'plans',
      taxationSubTab: 'tax-catalog',
      status: null,
    });
  });

  it('redirige el deep link legacy de resumen a planes', () => {
    expect(resolveCommercialRoute('summary').tab).toBe('plans');
  });

  it('deja de reconocer summary como tab del modulo', () => {
    expect(isCommercialTabParam('summary')).toBe(false);
  });

  it('omite el parametro tab cuando la ruta es la de aterrizaje', () => {
    expect(
      buildCommercialTabQuery({ tab: 'plans', taxationSubTab: 'tax-catalog', status: null }),
    ).toBeUndefined();
  });
```

- [ ] **Paso 2: Ejecutar y verificar que falla**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="commercial-tab-params"
```

Esperado: FAIL — `resolveCommercialRoute(null).tab` sigue siendo `'summary'`.

- [ ] **Paso 3: Retirar `summary` del modelo**

En `commercial-tab-params.ts`:

Quita `'summary'` del tipo y del arreglo:

```ts
export type CommercialTab =
  | 'plans'
  | 'products'
  | 'services'
  | 'bundles'
  | 'promotions'
  | 'compatibility'
  | 'taxation';
```

```ts
const COMMERCIAL_TABS: CommercialTab[] = [
  'plans',
  'products',
  'services',
  'bundles',
  'promotions',
  'compatibility',
  'taxation',
];
```

Añade el alias legacy junto al de ofertas:

```ts
/** Alias legacy del tab retirado `?tab=summary` (Fase G). */
const LEGACY_SUMMARY_BASE = 'summary';
```

Cambia el default:

```ts
const DEFAULT_ROUTE: ResolvedCommercialRoute = {
  tab: 'plans',
  taxationSubTab: 'tax-catalog',
  status: null,
};
```

En `resolveCommercialRoute`, antes del chequeo de `LEGACY_OFFERS_BASE`, añade:

```ts
  if (baseTab === LEGACY_SUMMARY_BASE) {
    return DEFAULT_ROUTE;
  }
```

En `buildCommercialTabQuery`, sustituye la rama de `summary` por la de aterrizaje:

```ts
  if (route.tab === 'plans') {
    return undefined;
  }
```

- [ ] **Paso 4: Ejecutar y verificar que pasa**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="commercial-tab-params"
```

Esperado: PASS.

- [ ] **Paso 5: Commit**

```bash
git add apps/portal/src/components/commercial/commercial-tab-params.ts apps/portal/src/components/commercial/commercial-tab-params.spec.ts
git commit -m "feat(mod06)!: modulo comercial aterriza en planes y retira la ruta summary"
```

---

## Tarea 4 — Retirar el tab del layout

**Archivos:**
- Modificar: `apps/portal/src/components/commercial/CommercialTabLayout.tsx`
- Modificar: `apps/portal/src/components/commercial/CommercialTabLayout.spec.tsx`

- [ ] **Paso 1: Ajustar el test (falla)**

En `CommercialTabLayout.spec.tsx`, cambia `defaultProps` para que deje de pasar `summary` y aterrice en planes:

```tsx
const defaultProps = {
  canEdit: true,
  activeTab: 'plans' as const,
  taxationSubTab: 'tax-catalog' as const,
  onTabChange: jest.fn(),
  onTaxationSubTabChange: jest.fn(),
};
```

Sustituye el test `'renderiza Resumen por defecto fuera de grupo Operación'` por:

```tsx
  it('no ofrece un tab de resumen', () => {
    render(<CommercialTabLayout {...defaultProps} />);

    expect(screen.queryByRole('tab', { name: 'Resumen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Operación')).not.toBeInTheDocument();
  });

  it('aterriza en Planes con los tres grupos visibles', () => {
    render(<CommercialTabLayout {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'Planes' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Catálogo')).toBeInTheDocument();
    expect(screen.getByText('Ofertas')).toBeInTheDocument();
    expect(screen.getByText('Reglas')).toBeInTheDocument();
  });
```

- [ ] **Paso 2: Ejecutar y verificar que falla**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="CommercialTabLayout"
```

Esperado: FAIL — el tab `Resumen` sigue presente.

- [ ] **Paso 3: Retirar el tab, su contenido y la prop**

En `CommercialTabLayout.tsx`, elimina de `CommercialTabLayoutProps` la línea `summary: ReactNode;` y el parámetro `summary` de la firma. Elimina el import de `ReactNode` si queda sin uso.

Elimina el trigger y el separador que lo seguía:

```tsx
        {/* H12: Resumen fuera de grupo (sin rótulo Operación) */}
        <TabsTrigger value="summary" className={portalModuleTabTriggerClassName}>
          Resumen
        </TabsTrigger>

        <div role="separator" aria-hidden="true" className={portalModuleTabsDividerClassName} />
```

Elimina el content:

```tsx
      <TabsContent value="summary" className="space-y-6">
        {summary}
      </TabsContent>
```

- [ ] **Paso 4: Ejecutar y verificar que pasa**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="components/commercial"
```

Esperado: PASS en las 13 suites.

- [ ] **Paso 5: Commit**

```bash
git add apps/portal/src/components/commercial/CommercialTabLayout.tsx apps/portal/src/components/commercial/CommercialTabLayout.spec.tsx
git commit -m "feat(mod06)!: retirar el tab Resumen de la navegacion comercial"
```

---

## Tarea 5 — Gates de cierre

Ninguno lo reporta quien ejecutó la corrección. Los verifica AI-SR-QA o AI-EM-ARCH sobre el código entregado.

- [ ] **Paso 1: Suite completa del portal**

```bash
pnpm --filter @iwana/portal test
```

Esperado: sin regresión frente al baseline **153 suites / 760 tests**.

- [ ] **Paso 2: Typecheck y lint**

`pnpm lint` y `pnpm typecheck` fallan en este entorno Windows por el binario de turbo (`errno -4094`), no por el código. Ejecuta directamente sobre el paquete:

```bash
cd apps/portal && npx tsc --noEmit && npx eslint src --ext .ts,.tsx
```

Esperado: exit 0 en ambos. Atención especial a consumidores de `CommercialTab` que asumieran `'summary'`.

- [ ] **Paso 3: Auditoría de identidad**

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial apps/portal/src/components/shared/portal-ui.tsx
```

Esperado: 0 deterministas P0/P1. El heurístico `lime-50-surface` de `portal-ui.tsx` es el chip de filtro activo — acento de interacción, ya descartado en fases previas.

- [ ] **Paso 4: Verificación en navegador — es un gate, no es opcional**

En la fase anterior este paso se declaró *"opcional, no bloquea"* y los dos P2 que se colaron eran exactamente lo que detecta. **No se repite.**

```bash
pnpm dev
```

1. Entra a `/dashboard/commercial`: debe aterrizar en **Planes**, sin tab Resumen.
2. `?tab=summary` en la URL: debe resolver a Planes sin error de consola.
3. Pulsa **Actividad** desde tres tabs distintos: el peek abre con atención y cambios recientes.
4. Con el peek abierto, pulsa un ítem de atención: debe cerrarse y navegar al destino correcto.
5. **Teclado:** abre el peek con Enter, recorre con Tab, cierra con Escape. El foco vuelve al botón Actividad.
6. **Mobile 375 px:** el botón Actividad y el de Actualizar caben en la cabecera sin desbordar. Si no caben, **para y reporta** — la decisión de compactar es de AI-PROD-UX.

- [ ] **Paso 5: Recalcular el puntaje**

Fórmula de la skill: `100 − 20·P0 − 10·P1 − 3·P2 − 1·P3`. Partiendo de 90/100 con H19 (P1) cerrado, el objetivo es **≥ 98/100**.

Se recalcula recorriendo la pantalla contra la tarea del operador. H19 no es grep-able.

---

## Orquestación — protocolo multiagente

| Etapa | Rol | Agente | Entregable | Aprueba |
| --- | --- | --- | --- | --- |
| Decisión de producto | Aterrizaje en Planes y panel de actividad | **AI-PROD-UX** | Confirmación o veto de las decisiones 1–3 | AI-EM-ARCH |
| Consulta de contrato | Uso de `PortalSidePeek` para actividad | **AI-DS-OWNER** | Veredicto: reutilizar vs. promover primitive | AI-EM-ARCH |
| Implementación | Tareas 1–4 | **AI-FE-PLATFORM** | 4 commits | AI-SR-QA |
| Verificación | Tarea 5 completa, incluido el paso 4 | **AI-SR-QA** | Informe de gates con evidencia real | AI-EM-ARCH |
| Cierre | Consolidación e informe vivo | **AI-EM-ARCH** | `INFORME-COMMERCIAL-UI-ALIGNMENT-v1.4` | CTO |

**Gate de entrada:** AI-PROD-UX debe confirmar la decisión 1 antes de la Tarea 3. Retirar el aterrizaje por defecto es un cambio de producto, no de implementación.

**Regla del protocolo:** el aprobador de un gate nunca es el productor del artefacto. AI-FE-PLATFORM no reporta su propio puntaje ni declara sus propios gates en verde.

**Regla dura para el ejecutor:** si al retirar el tab aparece un consumidor de `'summary'` fuera del módulo comercial, **para y escala** — no lo absorbas en el fix.

---

## Riesgos

| Riesgo | Señal | Acción |
| --- | --- | --- |
| Un operador esperaba el resumen como aterrizaje | Feedback de uso | El botón Actividad lo conserva a un clic; medir antes de revertir |
| El botón Actividad no cabe en cabecera mobile | Paso 4.6 | Parar y escalar a AI-PROD-UX. No compactar por criterio de implementación |
| `PortalSidePeek` no encaja para contenido de solo lectura | Al construir | Escalar a AI-DS-OWNER antes de forzarlo |
| Deep links `?tab=summary` guardados por usuarios | Post-merge | Cubierto por el alias legacy y su test |
| Colisión con la oleada de deuda de alertas | Al empezar | Precondición Paso 0: árbol limpio |

---

## Hallazgo sistémico detectado al planificar — fuera de alcance

`apps/portal/src/components/inventory/inventory-tab-params.ts:36` devuelve `'summary'` como aterrizaje por defecto, con el mismo patrón que este plan retira en comercial: un tab de resumen como primera pantalla del módulo.

**No se toca aquí** — este plan cierra MOD06 y meter inventario dentro haría el cambio irrevisable. Pero si el diagnóstico de H19 se confirma en uso, el mismo análisis aplica a inventario y merece su propia auditoría. Queda declarado con dueño pendiente para que no se pierda.

## Trazabilidad

- Auditoría que origina H19 — este mismo hilo, sobre `3fe620ff`
- [PROMPT-MOD06-UI-FASE-F-v1.0](../prompts/PROMPT-MOD06-UI-FASE-F-v1.0.md) — H13–H16
- [2026-07-23-mod06-resumen-fuera-del-tab](2026-07-23-mod06-resumen-fuera-del-tab.md) — Fase F
- [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.3](../informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.3.md) — cierre Fase F
- `.agents/skills/iwana-identity-ui-review` · `.agents/skills/writing-plans`
