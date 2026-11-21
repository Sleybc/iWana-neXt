# PROMPT — WEB-DASHBOARD · Ola 3 (consolidación DS web + portal)

**Versión:** 1.0 · **Fecha:** 2026-11-21 · **Emisor:** AI-EM-ARCH · **Etapa:** 4 (G4 emitido, contrafirma pendiente de cada receptor)
**Precondición:** 3A congelado ([contrato DS de consolidación](../specs/2026-11-21-web-portal-dashboard-consolidacion-ds-contrato.md) v1.0, U-1…U-4) y G0-4 ✅ CTO 2026-11-21 (U-5, §6 del contrato). Olas 1 y 2 cerradas con G6 GO ([informe](../informes/INFORME-WEB-DASHBOARD-AUDITORIA-v1.0.md) §6 y §7).
**Contrafirma G4 §C:** AI-FE-PLATFORM, 2026-11-21. Consume el contrato DS v1.0 (§2–§7) sin cambios.
**Plan:** [2026-11-21-web-dashboard-auditoria-remediacion.md](../plans/2026-11-21-web-dashboard-auditoria-remediacion.md)

## Contratos congelados

- **DS:** el contrato de consolidación citado arriba, §2–§7. Es la única fuente de API, estados, tokens y consumidores. Un cambio pide `[BLOQUEO]` a AI-EM-ARCH.
- **`formatRelativeTime` v1.0** (U-6), en `packages/shared/src/utils/`: `formatRelativeTime(value: string | Date | null | undefined, now?: Date): string`, con `Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' })`. Fecha nula o inválida devuelve «Reciente»; una fecha futura se trata como «ahora». Los tramos son minutos (<60), horas (<24) y días.

## §B — fe-platform: formateador compartido (U-6)

1. Crear `formatRelativeTime` en `@iwana/shared`, exportarlo en `index.ts` y añadir su spec con tramos, límites (59/60 min, 23 h 59, 24 h), nulo, inválido y futuro.
2. Sustituir los 4 formateadores locales: `apps/web/src/components/dashboard/DashboardClient.tsx` (`formatRelativeDate`), `apps/portal/src/components/dashboard/RecentActivityPanel.tsx`, `apps/portal/src/components/layout/NotificationBell.tsx` y el cuarto que localice el `grep`. Ajustar sus specs solo donde cambie el texto y declararlo.

**Fuera de alcance:** C-1 (`ListMeta`), que necesita su propio G0. Primitives y estilos (§C).

## §C — fe-platform: primitives y adopción (U-1…U-5)

1. U-5: escala `warning-50…700` en `globals.css` con los valores de §6 del contrato, y sustitución 1:1 de `amber-N` por `warning-N` en los tonos y en `Badge`.
2. U-4 y U-3: `toneVariants`, `Card` variante `outline`, `ErrorState`, `EmptyState` y `StackedBar` en `@iwana/ui`, con sus specs.
3. U-1: `MetricCard` y `metricCardVariants` en `@iwana/ui`. U-2: `SystemStatusPanel` con `error`, `onRetry`, `emptyMessage` y `statusLabels`.
4. Migrar los consumidores de §7 del contrato en web y portal, localizados por nombre de componente y no por número de línea. Borrar `SignalChips` y los helpers de métrica del portal. Actualizar `core-components` (`MetricCard` ya existe).

**Fuera de alcance:** el barrido de `rose-*` y `amber-*` fuera del dashboard; queda como deuda con regla de lint. No tocar las líneas de formato de fecha (§B).

## Paso de cierre (stop/go)

- `pnpm turbo run typecheck lint test --filter=@iwana/ui --filter=@iwana/shared --filter=@iwana/web --filter=@iwana/portal --force` con conteo real y `Cached: 0`.
- E2E de `playwright.web.config.ts` y de los specs del dashboard del portal; axe con `wcag22aa` en claro y oscuro.
- `test-change-reviewer` sobre las specs ajustadas; revisión P0–P3 con `iwana-identity-ui-review`.
- G6 y commit local por bloque, sin push.
