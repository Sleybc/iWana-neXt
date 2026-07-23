# MOD06 — El resumen comercial deja de ser un tab: plan de implementación

> **Para agentes ejecutores:** SUB-SKILL REQUERIDA: usa `executing-plans` (o `subagent-driven-development`) para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para seguimiento.

**Objetivo:** Que las alertas operativas del módulo Comercial sean visibles desde cualquier tab, eliminar la duplicación entre alertas y KPIs, y cerrar el prop muerto `onRetry`.

**Arquitectura:** Hoy `CommercialClient` calcula el resumen en cada visita (`loadSummary` no depende de `route.tab`) pero las alertas solo se montan dentro de `<TabsContent value="summary">`. El cambio extrae la construcción de alertas a un módulo puro, la envuelve en un componente de tira propio, y lo monta en `CommercialClient` **por encima** de `CommercialTabLayout`. El tab Resumen conserva las vistas transversales (atención + cambios recientes) que ningún manager individual puede mostrar.

**Stack:** Next.js App Router (client components), React 19, Tailwind v4 CSS-first, Jest + Testing Library, primitives de `portal-ui.tsx`.

**Hallazgos que cierra:** H13 (P1), H14 (P2), H15 (P2), H16 (P3) del [PROMPT-MOD06-UI-FASE-F-v1.0](../prompts/PROMPT-MOD06-UI-FASE-F-v1.0.md).

**Baseline verificado antes de empezar:** `pnpm --filter @iwana/portal exec jest --testPathPattern="components/commercial"` → **10 suites / 55 tests PASS**.

---

## Decisiones de diseño fijadas en este plan

Estas quedan cerradas aquí para que la ejecución no las reabra. Si AI-PROD-UX las revierte, se revierte el plan, no la implementación a medias.

| # | Decisión | Motivo |
| --- | --- | --- |
| 1 | La tira de alertas vive en `CommercialClient`, sobre `CommercialTabLayout` | Es capa de orientación, no par de los tabs de trabajo |
| 2 | Se retiran del grid las tarjetas **Vencen pronto** y **Huecos en reglas** | Repiten número, rótulo y destino de una alerta en el mismo viewport |
| 3 | Se conserva **Listos para vender** | Muestra un número distinto al de su alerta (`sellable/active` vs. `incomplete`); es complementario, no duplicado |
| 4 | El error de carga del resumen deja de condicionarse a `route.tab === 'summary'` | Si el resumen falla, el operador pierde el alertado en todo el módulo — debe enterarse esté donde esté |
| 5 | El rótulo del tab sigue siendo **Resumen**; cambia la descripción del panel | Al salir las alertas, el contenido restante (indicadores + atención + cambios) **sí** es un resumen. H16 se disuelve por H13 |
| 6 | `status: 'expiring'` pasa a ser dato de la alerta, no una rama en el handler | Elimina el `if (alert.key === 'offers-at-risk')` del click |

---

## Estructura de archivos

**Crear**
- `apps/portal/src/components/commercial/commercial-format.ts` — formateo numérico compartido del módulo. Una responsabilidad.
- `apps/portal/src/components/commercial/commercial-alerts.ts` — construcción pura de alertas operativas y resolución de tab destino. Sin JSX, testeable en aislamiento.
- `apps/portal/src/components/commercial/CommercialAlertsStrip.tsx` — presentación de la tira.
- `apps/portal/src/components/commercial/commercial-alerts.spec.ts`
- `apps/portal/src/components/commercial/CommercialAlertsStrip.spec.tsx`
- `apps/portal/src/components/commercial/CommercialClient.spec.tsx`

**Modificar**
- `apps/portal/src/components/commercial/CommercialDashboard.tsx` — pierde `buildAlerts`, los resolvers, el bloque de alertas y dos tarjetas.
- `apps/portal/src/components/commercial/CommercialClient.tsx` — monta la tira, cablea `onRetry`, deja de condicionar el error.
- `apps/portal/src/components/commercial/CommercialDashboard.spec.tsx` — ajusta aserciones de alertas y del grid.

---

## Tarea 1 — Extraer formateo y construcción de alertas a módulos puros

Refactor sin cambio de comportamiento. Al terminar, la suite debe seguir en 55/55.

**Archivos:**
- Crear: `apps/portal/src/components/commercial/commercial-format.ts`
- Crear: `apps/portal/src/components/commercial/commercial-alerts.ts`
- Crear: `apps/portal/src/components/commercial/commercial-alerts.spec.ts`
- Modificar: `apps/portal/src/components/commercial/CommercialDashboard.tsx`

- [ ] **Paso 1: Crear el formateador compartido**

`apps/portal/src/components/commercial/commercial-format.ts`:

```ts
/** Formato numérico del módulo comercial (es-CO). */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value);
}
```

- [ ] **Paso 2: Escribir el test de construcción de alertas (falla: módulo inexistente)**

`apps/portal/src/components/commercial/commercial-alerts.spec.ts`:

```ts
import type { CommercialDashboardSummary } from '@/lib/api-client';
import {
  buildCommercialAlerts,
  resolveOffersRiskTab,
  resolveRulesGapTab,
} from './commercial-alerts';

function buildSummary(
  overrides: Partial<CommercialDashboardSummary> = {},
): CommercialDashboardSummary {
  return {
    plansCount: 4,
    activePlansCount: 3,
    productsCount: 6,
    activeProductsCount: 5,
    servicesCount: 2,
    activeServicesCount: 2,
    bundlesCount: 1,
    activeBundlesCount: 1,
    promotionsCount: 3,
    activePromotionsCount: 2,
    compatibilityRulesCount: 4,
    activeCompatibilityRulesCount: 3,
    taxRulesCount: 5,
    activeTaxRulesCount: 4,
    offersExpiringSoonCount: 0,
    offersNearUseLimitCount: 0,
    offersAtRiskCount: 0,
    catalogActiveCount: 10,
    catalogSellableActiveCount: 10,
    catalogIncompleteActiveCount: 0,
    missingCurrentPriceCount: 0,
    activeBundlesWithInactiveItemsCount: 0,
    taxRulesCoverageGapCount: 0,
    rulesGapCount: 0,
    activeOffersCount: 3,
    attentionItems: [],
    recentChanges: [],
    ...overrides,
  };
}

describe('buildCommercialAlerts', () => {
  it('no emite alertas en estado saludable', () => {
    expect(buildCommercialAlerts(buildSummary())).toEqual([]);
  });

  it('emite alerta de ofertas en riesgo con filtro expiring', () => {
    const alerts = buildCommercialAlerts(buildSummary({ offersAtRiskCount: 3 }));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      key: 'offers-at-risk',
      variant: 'warning',
      title: 'Ofertas en riesgo',
      status: 'expiring',
    });
    expect(alerts[0]?.description).toContain('3');
  });

  it('singulariza el texto cuando hay una sola oferta en riesgo', () => {
    const alerts = buildCommercialAlerts(buildSummary({ offersAtRiskCount: 1 }));

    expect(alerts[0]?.description).toContain('oferta vence');
  });

  it('emite alerta de catálogo incompleto sin filtro de estado', () => {
    const alerts = buildCommercialAlerts(buildSummary({ catalogIncompleteActiveCount: 2 }));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      key: 'catalog-incomplete',
      variant: 'error',
      tab: 'plans',
    });
    expect(alerts[0]?.status).toBeUndefined();
  });

  it('emite alerta de huecos en reglas', () => {
    const alerts = buildCommercialAlerts(buildSummary({ rulesGapCount: 4 }));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ key: 'rules-gap', variant: 'error' });
  });

  it('acota a tres alertas como máximo', () => {
    const alerts = buildCommercialAlerts(
      buildSummary({
        offersAtRiskCount: 1,
        catalogIncompleteActiveCount: 1,
        rulesGapCount: 1,
      }),
    );

    expect(alerts).toHaveLength(3);
  });
});

describe('resolveOffersRiskTab', () => {
  it('elige promociones cuando dominan los ítems de promoción', () => {
    const summary = buildSummary({
      offersAtRiskCount: 2,
      attentionItems: [
        {
          id: 'p1',
          name: 'Promo A',
          entityType: 'promotion',
          reason: 'expiring_soon',
          destinoTab: 'promotions',
          validTo: null,
          usesRemaining: null,
        },
        {
          id: 'p2',
          name: 'Promo B',
          entityType: 'promotion',
          reason: 'near_use_limit',
          destinoTab: 'promotions',
          validTo: null,
          usesRemaining: 1,
        },
      ],
    });

    expect(resolveOffersRiskTab(summary)).toBe('promotions');
  });

  it('cae a combos cuando no dominan las promociones', () => {
    expect(resolveOffersRiskTab(buildSummary())).toBe('bundles');
  });
});

describe('resolveRulesGapTab', () => {
  it('elige combos cuando pesan más los combos con ítems inactivos', () => {
    const summary = buildSummary({
      activeBundlesWithInactiveItemsCount: 3,
      taxRulesCoverageGapCount: 1,
    });

    expect(resolveRulesGapTab(summary)).toBe('bundles');
  });

  it('elige tributación en el resto de los casos', () => {
    expect(resolveRulesGapTab(buildSummary())).toBe('taxation');
  });
});
```

- [ ] **Paso 3: Ejecutar el test y verificar que falla**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="commercial-alerts"
```

Esperado: FAIL — `Cannot find module './commercial-alerts'`.

- [ ] **Paso 4: Implementar el módulo de alertas**

`apps/portal/src/components/commercial/commercial-alerts.ts`:

```ts
import type {
  CommercialAttentionReason,
  CommercialDashboardSummary,
} from '@/lib/api-client';
import type {
  CommercialOfferStatusFilter,
  CommercialTab,
} from '@/components/commercial/commercial-tab-params';
import { formatCompactNumber } from '@/components/commercial/commercial-format';

export interface CommercialAlert {
  key: string;
  variant: 'warning' | 'error';
  title: string;
  description: string;
  ctaLabel: string;
  tab: CommercialTab;
  /** Filtro que debe aplicarse al aterrizar en `tab`; ausente si no aplica. */
  status?: CommercialOfferStatusFilter;
}

export function resolveOffersRiskTab(summary: CommercialDashboardSummary): CommercialTab {
  const offerReasons = new Set<CommercialAttentionReason>(['expiring_soon', 'near_use_limit']);
  const offerItems = summary.attentionItems.filter((item) => offerReasons.has(item.reason));
  const promotionHits = offerItems.filter((item) => item.destinoTab === 'promotions').length;
  const bundleHits = offerItems.filter((item) => item.destinoTab === 'bundles').length;

  if (promotionHits > bundleHits) {
    return 'promotions';
  }

  return 'bundles';
}

export function resolveRulesGapTab(summary: CommercialDashboardSummary): CommercialTab {
  if (summary.activeBundlesWithInactiveItemsCount > summary.taxRulesCoverageGapCount) {
    return 'bundles';
  }

  return 'taxation';
}

export function buildCommercialAlerts(summary: CommercialDashboardSummary): CommercialAlert[] {
  const alerts: CommercialAlert[] = [];

  if (summary.offersAtRiskCount > 0) {
    const count = formatCompactNumber(summary.offersAtRiskCount);
    alerts.push({
      key: 'offers-at-risk',
      variant: 'warning',
      title: 'Ofertas en riesgo',
      description: `${count} ${summary.offersAtRiskCount === 1 ? 'oferta vence' : 'ofertas vencen'} pronto o están cerca del límite de usos.`,
      ctaLabel: 'Ver ofertas',
      tab: resolveOffersRiskTab(summary),
      status: 'expiring',
    });
  }

  if (summary.catalogIncompleteActiveCount > 0) {
    const count = formatCompactNumber(summary.catalogIncompleteActiveCount);
    alerts.push({
      key: 'catalog-incomplete',
      variant: 'error',
      title: 'Catálogo incompleto',
      description: `${count} ${summary.catalogIncompleteActiveCount === 1 ? 'ítem activo está' : 'ítems activos están'} sin precio vigente.`,
      ctaLabel: 'Completar catálogo',
      tab: 'plans',
    });
  }

  if (summary.rulesGapCount > 0) {
    const count = formatCompactNumber(summary.rulesGapCount);
    alerts.push({
      key: 'rules-gap',
      variant: 'error',
      title: 'Huecos en reglas',
      description: `${count} ${summary.rulesGapCount === 1 ? 'bloqueo o riesgo' : 'bloqueos o riesgos'} en tributación o integridad de combos.`,
      ctaLabel: 'Revisar reglas',
      tab: resolveRulesGapTab(summary),
    });
  }

  return alerts.slice(0, 3);
}
```

- [ ] **Paso 5: Ejecutar el test y verificar que pasa**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="commercial-alerts"
```

Esperado: PASS, 11 tests.

- [ ] **Paso 6: Hacer que `CommercialDashboard` consuma los módulos nuevos**

En `apps/portal/src/components/commercial/CommercialDashboard.tsx`:

Añade a los imports (tras el bloque de `commercial-tab-params`):

```tsx
import { formatCompactNumber } from '@/components/commercial/commercial-format';
import {
  resolveOffersRiskTab,
  resolveRulesGapTab,
} from '@/components/commercial/commercial-alerts';
```

Elimina de ese archivo, ya duplicados en los módulos nuevos:
- `function formatCompactNumber` (líneas 71-73)
- `function resolveOffersRiskTab` (líneas 79-88)
- `function resolveRulesGapTab` (líneas 90-95)

Deja `buildAlerts` y el bloque de alertas por ahora — se retiran en la Tarea 3, cuando la tira ya exista y no haya ventana sin alertado.

- [ ] **Paso 7: Verificar que nada se rompió**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="components/commercial"
```

Esperado: PASS — 11 suites / 66 tests (55 previos + 11 nuevos).

- [ ] **Paso 8: Commit**

```bash
git add apps/portal/src/components/commercial/commercial-format.ts apps/portal/src/components/commercial/commercial-alerts.ts apps/portal/src/components/commercial/commercial-alerts.spec.ts apps/portal/src/components/commercial/CommercialDashboard.tsx
git commit -m "refactor(mod06): extraer construccion de alertas comerciales a modulo puro"
```

---

## Tarea 2 — Crear la tira de alertas

**Archivos:**
- Crear: `apps/portal/src/components/commercial/CommercialAlertsStrip.tsx`
- Crear: `apps/portal/src/components/commercial/CommercialAlertsStrip.spec.tsx`

- [ ] **Paso 1: Escribir el test (falla: componente inexistente)**

`apps/portal/src/components/commercial/CommercialAlertsStrip.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommercialDashboardSummary } from '@/lib/api-client';
import { CommercialAlertsStrip } from './CommercialAlertsStrip';

function buildSummary(
  overrides: Partial<CommercialDashboardSummary> = {},
): CommercialDashboardSummary {
  return {
    plansCount: 4,
    activePlansCount: 3,
    productsCount: 6,
    activeProductsCount: 5,
    servicesCount: 2,
    activeServicesCount: 2,
    bundlesCount: 1,
    activeBundlesCount: 1,
    promotionsCount: 3,
    activePromotionsCount: 2,
    compatibilityRulesCount: 4,
    activeCompatibilityRulesCount: 3,
    taxRulesCount: 5,
    activeTaxRulesCount: 4,
    offersExpiringSoonCount: 0,
    offersNearUseLimitCount: 0,
    offersAtRiskCount: 0,
    catalogActiveCount: 10,
    catalogSellableActiveCount: 10,
    catalogIncompleteActiveCount: 0,
    missingCurrentPriceCount: 0,
    activeBundlesWithInactiveItemsCount: 0,
    taxRulesCoverageGapCount: 0,
    rulesGapCount: 0,
    activeOffersCount: 3,
    attentionItems: [],
    recentChanges: [],
    ...overrides,
  };
}

describe('CommercialAlertsStrip', () => {
  it('no renderiza contenedor cuando no hay summary', () => {
    const { container } = render(<CommercialAlertsStrip summary={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('no renderiza contenedor en estado saludable', () => {
    const { container } = render(<CommercialAlertsStrip summary={buildSummary()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza las alertas activas con region etiquetada', () => {
    render(<CommercialAlertsStrip summary={buildSummary({ rulesGapCount: 2 })} />);

    expect(screen.getByRole('region', { name: 'Alertas operativas' })).toBeInTheDocument();
    expect(screen.getByText('Huecos en reglas')).toBeInTheDocument();
  });

  it('navega al tab destino con el filtro de la alerta', async () => {
    const user = userEvent.setup();
    const onNavigateTab = jest.fn();

    render(
      <CommercialAlertsStrip
        summary={buildSummary({ offersAtRiskCount: 2 })}
        onNavigateTab={onNavigateTab}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ver ofertas' }));

    expect(onNavigateTab).toHaveBeenCalledWith('bundles', { status: 'expiring' });
  });

  it('navega sin filtro cuando la alerta no lo declara', async () => {
    const user = userEvent.setup();
    const onNavigateTab = jest.fn();

    render(
      <CommercialAlertsStrip
        summary={buildSummary({ catalogIncompleteActiveCount: 1 })}
        onNavigateTab={onNavigateTab}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Completar catálogo' }));

    expect(onNavigateTab).toHaveBeenCalledWith('plans', { status: null });
  });

  it('omite las acciones cuando no hay handler de navegación', () => {
    render(<CommercialAlertsStrip summary={buildSummary({ rulesGapCount: 2 })} />);

    expect(screen.queryByRole('button', { name: 'Revisar reglas' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Paso 2: Ejecutar y verificar que falla**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="CommercialAlertsStrip"
```

Esperado: FAIL — `Cannot find module './CommercialAlertsStrip'`.

- [ ] **Paso 3: Implementar el componente**

`apps/portal/src/components/commercial/CommercialAlertsStrip.tsx`:

```tsx
'use client';

import { Button } from '@iwana/ui';
import type { CommercialDashboardSummary } from '@/lib/api-client';
import { buildCommercialAlerts } from '@/components/commercial/commercial-alerts';
import type { CommercialNavigateHandler } from '@/components/commercial/commercial-tab-params';
import { PortalAlert } from '@/components/shared/portal-ui';

interface CommercialAlertsStripProps {
  summary: CommercialDashboardSummary | null;
  onNavigateTab?: CommercialNavigateHandler | undefined;
}

/**
 * Alertas operativas del módulo, visibles desde cualquier tab.
 * Vive sobre la barra de tabs: es capa de orientación, no una sección más.
 */
export function CommercialAlertsStrip({ summary, onNavigateTab }: CommercialAlertsStripProps) {
  if (!summary) {
    return null;
  }

  const alerts = buildCommercialAlerts(summary);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" aria-label="Alertas operativas">
      {alerts.map((alert) => (
        <PortalAlert
          key={alert.key}
          variant={alert.variant}
          title={alert.title}
          description={alert.description}
          {...(onNavigateTab
            ? {
                action: (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onNavigateTab(alert.tab, { status: alert.status ?? null })}
                  >
                    {alert.ctaLabel}
                  </Button>
                ),
              }
            : {})}
        />
      ))}
    </section>
  );
}
```

- [ ] **Paso 4: Mover los tipos de navegación a `commercial-tab-params.ts`**

La tira no debe depender del dashboard solo para tomar prestado un tipo. Ambos tipos son concerns de navegación y su sitio es el módulo que ya posee `CommercialTab` y `CommercialOfferStatusFilter`. Verificado: no hay consumidores fuera de `CommercialDashboard.tsx`.

Añade al final de `apps/portal/src/components/commercial/commercial-tab-params.ts`:

```ts
export interface CommercialNavigateOptions {
  status?: CommercialOfferStatusFilter | null;
}

export type CommercialNavigateHandler = (
  tab: CommercialTab,
  options?: CommercialNavigateOptions,
) => void;
```

Elimina de `CommercialDashboard.tsx` las líneas 24-28 (`export interface CommercialNavigateOptions` y `type CommercialNavigateHandler`) y añade ambos al import que ya existe de `commercial-tab-params`:

```tsx
import type {
  CommercialTab,
  CommercialOfferStatusFilter,
  CommercialNavigateHandler,
} from '@/components/commercial/commercial-tab-params';
```

En `CommercialAlertsStrip.tsx`, corrige el import del handler para que apunte al módulo de navegación en lugar del dashboard:

```tsx
import type { CommercialNavigateHandler } from '@/components/commercial/commercial-tab-params';
```

- [ ] **Paso 5: Ejecutar y verificar que pasa**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="CommercialAlertsStrip"
```

Esperado: PASS, 6 tests.

- [ ] **Paso 6: Commit**

```bash
git add apps/portal/src/components/commercial/CommercialAlertsStrip.tsx apps/portal/src/components/commercial/CommercialAlertsStrip.spec.tsx apps/portal/src/components/commercial/CommercialDashboard.tsx
git commit -m "feat(mod06): tira de alertas comerciales reutilizable"
```

---

## Tarea 3 — Montar la tira sobre los tabs y retirarla del resumen (H13)

Es el paso que cierra el P1. Se hace en un solo commit para que no exista un estado intermedio con alertas duplicadas ni con el módulo sin alertado.

**Archivos:**
- Modificar: `apps/portal/src/components/commercial/CommercialClient.tsx`
- Modificar: `apps/portal/src/components/commercial/CommercialDashboard.tsx`
- Modificar: `apps/portal/src/components/commercial/CommercialDashboard.spec.tsx`

- [ ] **Paso 1: Escribir la aserción que falla — la alerta vive fuera del tab Resumen**

Añade este bloque al final de `apps/portal/src/components/commercial/CommercialDashboard.spec.tsx`, dentro del `describe('CommercialDashboard', ...)`:

```tsx
  it('no renderiza alertas operativas: viven en la tira sobre los tabs', () => {
    render(
      <CommercialDashboard
        summary={buildSummary({
          offersAtRiskCount: 3,
          rulesGapCount: 2,
          catalogIncompleteActiveCount: 1,
        })}
      />,
    );

    expect(screen.queryByText('Ofertas en riesgo')).not.toBeInTheDocument();
    expect(screen.queryByText('Catálogo incompleto')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Alertas operativas')).not.toBeInTheDocument();
  });
```

- [ ] **Paso 2: Ejecutar y verificar que falla**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="CommercialDashboard"
```

Esperado: FAIL — las alertas siguen renderizándose dentro del panel.

- [ ] **Paso 3: Retirar las alertas de `CommercialDashboard.tsx`**

Elimina la función `buildAlerts` completa (el bloque `function buildAlerts(...) { ... }`).

En `OperationalSummaryBody`, elimina la línea `const alerts = buildAlerts(summary);` y el bloque JSX que la usa:

```tsx
      {alerts.length > 0 ? (
        <div className="space-y-3" aria-label="Alertas operativas">
          ...
        </div>
      ) : null}
```

Elimina también de los imports `PortalAlert`, que deja de usarse en este archivo. **Conserva** `Button` (lo usan los estados vacíos) y los resolvers importados en la Tarea 1 (los usan las tarjetas).

En el bloque de skeleton, elimina la primera línea, que reservaba el espacio de la alerta:

```tsx
          <PortalSkeletonBlock className="min-h-[72px] rounded-2xl" />
```

- [ ] **Paso 4: Montar la tira en `CommercialClient.tsx`**

Añade el import:

```tsx
import { CommercialAlertsStrip } from '@/components/commercial/CommercialAlertsStrip';
```

Sustituye el bloque del error de resumen (líneas 214-221) por la tira más el error **sin condicionar al tab** (decisión 4):

```tsx
      {summaryError && (
        <PortalAlert
          variant="error"
          title="Resumen no disponible"
          description={summaryError}
          icon={AlertTriangle}
        />
      )}

      <CommercialAlertsStrip summary={summary} onNavigateTab={handleNavigateTab} />
```

- [ ] **Paso 5: Ejecutar y verificar que pasa**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="components/commercial"
```

Esperado: PASS. El test de skeleton (`toBeGreaterThanOrEqual(7)`) sigue cumpliéndose con 3 KPIs + 5 filas tras la Tarea 4; si falla aquí por el bloque de alerta retirado, **no relajes el umbral**: ajusta el conteo esperado al número real de bloques y deja constancia en el informe.

- [ ] **Paso 6: Commit**

```bash
git add apps/portal/src/components/commercial/CommercialClient.tsx apps/portal/src/components/commercial/CommercialDashboard.tsx apps/portal/src/components/commercial/CommercialDashboard.spec.tsx
git commit -m "fix(mod06): alertas comerciales visibles desde cualquier tab — cierra H13"
```

---

## Tarea 4 — Retirar las tarjetas que duplican una alerta (H14)

**Archivos:**
- Modificar: `apps/portal/src/components/commercial/CommercialDashboard.tsx`
- Modificar: `apps/portal/src/components/commercial/CommercialDashboard.spec.tsx`

- [ ] **Paso 1: Reemplazar la aserción del grid de 5 tarjetas**

En `CommercialDashboard.spec.tsx`, sustituye el test `'estado saludable: 5 KPIs neutros, sin alertas y empty de atención'` por:

```tsx
  it('estado saludable: 3 KPIs neutros y empty de atención', () => {
    const { container } = render(<CommercialDashboard summary={buildSummary()} />);

    expect(screen.getByText('Operación')).toBeInTheDocument();
    expect(screen.getByText('Listos para vender')).toBeInTheDocument();
    expect(screen.getByText('Planes activos')).toBeInTheDocument();
    expect(screen.getByText('Ofertas vigentes')).toBeInTheDocument();
    expect(screen.getByText('Todo al día')).toBeInTheDocument();
    expect(screen.getByText('Sin cambios en los últimos 7 días.')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/accent.*primary|primary.*accent/);
  });

  it('no repite en el grid los datos que ya emiten alerta', () => {
    render(
      <CommercialDashboard summary={buildSummary({ offersAtRiskCount: 3, rulesGapCount: 2 })} />,
    );

    expect(screen.queryByText('Vencen pronto')).not.toBeInTheDocument();
    expect(screen.queryByText('Huecos en reglas')).not.toBeInTheDocument();
  });
```

En el test `'muestra empty de primera vez sin KPIs'`, sustituye la aserción sobre `'Vencen pronto'` por una tarjeta que sigue existiendo:

```tsx
    expect(screen.queryByText('Listos para vender')).not.toBeInTheDocument();
```

- [ ] **Paso 2: Ejecutar y verificar que falla**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="CommercialDashboard"
```

Esperado: FAIL — `Vencen pronto` y `Huecos en reglas` siguen en el documento.

- [ ] **Paso 3: Retirar las dos tarjetas y ajustar el grid**

En `OperationalSummaryBody`, elimina las dos `<PortalMetricCard>` de `eyebrow="Ofertas" … title="Vencen pronto"` y `eyebrow="Reglas" … title="Huecos en reglas"`.

Cambia la clase del grid de `xl:grid-cols-5` a `xl:grid-cols-3`:

```tsx
      <div
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        aria-label="Indicadores comerciales"
      >
```

Ajusta el skeleton para que refleje las 3 tarjetas reales:

```tsx
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <PortalSkeletonBlock key={index} className="min-h-[148px] rounded-3xl" />
            ))}
          </div>
```

`resolveOffersRiskTab` deja de usarse en este archivo (solo la usaba la tarjeta retirada): elimínala del import. **`resolveRulesGapTab` también** — verifica con `grep -n "resolveRulesGapTab\|resolveOffersRiskTab" apps/portal/src/components/commercial/CommercialDashboard.tsx` y retira del import lo que quede sin uso, para no dejar imports muertos que el lint marque.

- [ ] **Paso 4: Ejecutar y verificar que pasa**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="components/commercial"
```

Esperado: PASS.

- [ ] **Paso 5: Commit**

```bash
git add apps/portal/src/components/commercial/CommercialDashboard.tsx apps/portal/src/components/commercial/CommercialDashboard.spec.tsx
git commit -m "fix(mod06): eliminar KPIs que duplican una alerta — cierra H14"
```

---

## Tarea 5 — Cablear `onRetry` (H15)

**Archivos:**
- Crear: `apps/portal/src/components/commercial/CommercialClient.spec.tsx`
- Modificar: `apps/portal/src/components/commercial/CommercialClient.tsx`

- [ ] **Paso 1: Escribir el test que detecta el prop sin cablear**

`apps/portal/src/components/commercial/CommercialClient.spec.tsx`:

```tsx
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRole } from '@iwana/shared';
import { CommercialClient } from './CommercialClient';
import { commercialApi } from '@/lib/api-client';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/dashboard/commercial',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', role: UserRole.ADMIN, tenantId: 'tenant-1' },
    isLoading: false,
  }),
}));

jest.mock('@/components/commercial/CommercialTabLayout', () => ({
  CommercialTabLayout: ({ summary }: { summary: ReactNode }) => (
    <div data-testid="tab-layout">{summary}</div>
  ),
}));

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }

  return {
    ApiError: MockApiError,
    commercialApi: {
      getDashboardSummary: jest.fn(),
    },
  };
});

const getDashboardSummary = commercialApi.getDashboardSummary as jest.Mock;

describe('CommercialClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ofrece reintentar junto al estado vacío cuando falla la carga', async () => {
    const user = userEvent.setup();
    getDashboardSummary.mockRejectedValue(new Error('network'));

    render(<CommercialClient />);

    await waitFor(() => {
      expect(screen.getByText('Indicadores no disponibles')).toBeInTheDocument();
    });

    const retryButtons = screen.getAllByRole('button', { name: 'Actualizar' });
    expect(retryButtons.length).toBeGreaterThan(1);

    getDashboardSummary.mockClear();
    await user.click(retryButtons[retryButtons.length - 1] as HTMLElement);

    await waitFor(() => {
      expect(getDashboardSummary).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Paso 2: Ejecutar y verificar que falla**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="CommercialClient"
```

Esperado: FAIL — solo existe el botón del encabezado, así que `retryButtons.length` es 1.

- [ ] **Paso 3: Cablear el prop**

En `apps/portal/src/components/commercial/CommercialClient.tsx`, en el montaje de `CommercialDashboard`, añade `onRetry`:

```tsx
        summary={
          <CommercialDashboard
            summary={summary}
            isLoading={summaryLoading}
            onNavigateTab={handleNavigateTab}
            onRetry={handleRefresh}
          />
        }
```

- [ ] **Paso 4: Ejecutar y verificar que pasa**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="CommercialClient"
```

Esperado: PASS, 1 test.

- [ ] **Paso 5: Commit**

```bash
git add apps/portal/src/components/commercial/CommercialClient.spec.tsx apps/portal/src/components/commercial/CommercialClient.tsx
git commit -m "fix(mod06): cablear reintento del resumen comercial — cierra H15"
```

---

## Tarea 6 — Alinear la descripción del panel (H16)

El rótulo **Resumen** se conserva: al salir las alertas, el contenido restante (indicadores + atención + cambios recientes) sí es un resumen. Lo que quedó desalineado es la descripción, escrita cuando el panel llevaba las alertas.

**Archivos:**
- Modificar: `apps/portal/src/components/commercial/CommercialDashboard.tsx`

- [ ] **Paso 1: Sustituir la descripción del panel**

En `CommercialDashboard`, cambia la prop `description` de `PortalPanel`:

```tsx
      description="Estado del catálogo, las ofertas y las reglas, con lo que cambió en los últimos 7 días."
```

- [ ] **Paso 2: Verificar la suite completa del módulo**

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="components/commercial"
```

Esperado: PASS.

- [ ] **Paso 3: Commit**

```bash
git add apps/portal/src/components/commercial/CommercialDashboard.tsx
git commit -m "docs(mod06): alinear descripcion del resumen con su contenido — cierra H16"
```

---

## Tarea 7 — Gates de cierre

Ninguno de estos los reporta quien ejecutó la corrección: los verifica AI-SR-QA o AI-EM-ARCH sobre el código entregado.

- [ ] **Paso 1: Suite completa del portal**

```bash
pnpm --filter @iwana/portal test
```

Esperado: sin regresión frente al baseline del portal (148 suites en verde antes de esta fase).

- [ ] **Paso 2: Lint y typecheck del monorepo**

```bash
pnpm lint && pnpm typecheck
```

Esperado: 8/8 cada uno. Atención a imports muertos en `CommercialDashboard.tsx` tras las Tareas 3 y 4.

- [ ] **Paso 3: Auditoría de identidad**

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial apps/portal/src/components/shared/portal-ui.tsx
```

Esperado: 0 deterministas P0/P1. El heurístico `lime-50-surface` de `portal-ui.tsx:158` es el chip de filtro activo: **acento de interacción, no fondo base** — descartado, ya justificado en fases previas.

- [ ] **Paso 4: Verificación manual en navegador**

Levanta el stack y comprueba lo que ningún test cubre:

```bash
pnpm dev
```

1. Entra a `/dashboard/commercial` con un tenant que tenga al menos una oferta por vencer.
2. Cambia a **Planes**, **Tributación** y **Compatibilidad**: la alerta debe seguir visible en las tres.
3. Pulsa la acción de la alerta: debe aterrizar en el tab correcto con el filtro aplicado (`?tab=bundles&status=expiring`).
4. **Mobile (375 px):** confirma que con tres alertas la barra de tabs y el inicio del contenido siguen alcanzables sin scroll excesivo. Si no lo están, **para y reporta** — la decisión de compactar es de AI-PROD-UX, no de implementación.
5. Con lector de pantalla o inspector, confirma que las alertas de `warning`/`error` conservan `role="alert"` (lo aporta `PortalAlert`) y que no se re-anuncian en cada refresco del resumen. Si se re-anuncian, es hallazgo nuevo: repórtalo, no lo silencies.

- [ ] **Paso 5: Recalcular el puntaje de identidad**

Fórmula de la skill: `100 − 20·P0 − 10·P1 − 3·P2 − 1·P3`. Partiendo de 82/100 con H13 (P1), H14 (P2), H15 (P2) y H16 (P3) cerrados, el objetivo es **≥ 98/100**.

El puntaje se recalcula recorriendo la pantalla contra la tarea del operador, no leyendo la salida del script: H13 y H14 no son grep-ables.

---

## Riesgos y qué hacer si aparecen

| Riesgo | Señal | Acción |
| --- | --- | --- |
| Tres alertas empujan el contenido fuera del primer viewport en mobile | Paso 4.4 de la Tarea 7 | Parar y escalar a AI-PROD-UX. No compactar por criterio de implementación |
| `role="alert"` se re-anuncia en cada refresco del resumen | Paso 4.5 | Hallazgo nuevo; reportar. Posible fix: memoizar por `key` de alerta |
| El error de resumen (decisión 4) resulta ruidoso al trabajar en otro tab | Feedback de uso | Revertir a `summaryError && route.tab === 'summary'` **y documentar** que se pierde el aviso de que no hay alertado |
| La tira resulta patrón repetible en inventario o CRM | Al construirla | Escalar a AI-DS-OWNER: es promoción a `portal-ui`, no copia entre módulos |

---

## Trazabilidad

- [PROMPT-MOD06-UI-FASE-F-v1.0](../prompts/PROMPT-MOD06-UI-FASE-F-v1.0.md) — H13–H16
- [PROMPT-MOD06-UI-FASE-E-v1.0](../prompts/PROMPT-MOD06-UI-FASE-E-v1.0.md) — H1–H12, commit `8340410e`
- [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.1](../informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.1.md) — fases A–D
- `.agents/skills/iwana-identity-ui-review` — disciplina de identidad
- `.agents/skills/writing-plans` — disciplina de este documento
