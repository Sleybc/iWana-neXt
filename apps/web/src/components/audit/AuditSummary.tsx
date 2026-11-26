'use client';

// Resumen superior del historial — 4 tarjetas con señales (anatomía rica DS-A-SUM).
// CTA → preset cliente sobre lote + foco a tabla (CA-AUD-09 / CA-FR).
import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  KeyRound,
  Building2,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { Button, cn, ErrorState, interactiveFocusClassName, SkeletonBlock } from '@iwana/ui';
import {
  matchesSummaryPreset,
  splitSummaryWindow,
  type SummaryPreset,
  type SummaryWindow,
} from './summary-presets';
import { describePlatformActivityLine } from '@/lib/platform-audit-vocabulary';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

export interface SummaryEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  actor?: {
    id: string | null;
    type: 'tenant' | 'platform' | 'system' | 'unknown';
    displayName: string;
    role?: string;
    status?: string;
    isDeleted?: boolean;
  } | null;
  ipAddress: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
}

/** @deprecated CA-AUD-09: el resumen ya no aplica filtros vía AppliedFilter. */
export interface AppliedFilter {
  actionSet?: string[] | undefined;
  severity?: 'critical' | undefined;
}

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
}

const COPY = PLATFORM_UI_COPY.audit;
const SUMMARY_GRID = 'grid grid-cols-1 gap-3 min-[23rem]:grid-cols-2 sm:gap-4 xl:grid-cols-4';

interface AuditSummaryProps {
  entries: SummaryEntry[];
  isLoading: boolean;
  hasMore?: boolean;
  hasError?: boolean;
  onRetry?: () => void;
  onGoToList?: () => void;
  /** Destino del foco si el reintento vuelve a fallar. */
  errorRef?: React.Ref<HTMLDivElement>;
  /** 'platform' muestra empresas con cambios; 'tenant' muestra quién cambió */
  mode: 'platform' | 'tenant';
  tenants?: TenantInfo[];
  tenantName?: string | undefined;
  window: SummaryWindow;
  onWindowChange: (w: SummaryWindow) => void;
  /** Preset activo del lote (null = sin filtro de resumen). */
  activePreset: SummaryPreset | null;
  /** Aplica o quita preset (toggle si es el mismo). El padre enfoca la tabla. */
  onPresetChange: (preset: SummaryPreset | null) => void;
}

function extractActorName(entry: SummaryEntry): string {
  if (!entry.userId) return 'Sistema';
  if (entry.actor?.displayName) return entry.actor.displayName;
  return PLATFORM_UI_COPY.audit.actorFallback;
}

function DeltaBadge({
  difference,
  period,
  critical,
}: {
  difference: number;
  period: string;
  critical: boolean;
}) {
  const Icon = difference > 0 ? TrendingUp : difference < 0 ? TrendingDown : Minus;
  const tone =
    !critical || difference === 0
      ? 'text-gray-600 dark:text-gray-300'
      : difference > 0
        ? 'text-error-700 dark:text-error-400'
        : 'text-success-700 dark:text-success-400';
  return (
    <span className={cn('flex items-start gap-1 text-xs', tone)}>
      <Icon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
      {COPY.summaryDelta(difference, period)}
    </span>
  );
}

function SummaryCard({
  icon,
  title,
  windowLabel,
  count,
  countPrev,
  critical = false,
  previousPeriod,
  emptyLabel,
  sublabel,
  items,
  actionLabel: actionLabelText,
  onAction,
  pressed,
  accentClass,
}: {
  icon: React.ReactNode;
  title: string;
  windowLabel: string;
  count: number;
  countPrev: number | null;
  critical?: boolean;
  previousPeriod: string;
  emptyLabel: string;
  sublabel?: string | undefined;
  items: string[];
  actionLabel: string;
  onAction: () => void;
  pressed: boolean;
  accentClass: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-2xl border bg-white p-3 shadow-iwana-soft sm:gap-2 sm:p-4 dark:bg-dark-surface-2',
        pressed
          ? 'border-iwana-primary/40 dark:border-iwana-primary/40'
          : 'border-gray-200 dark:border-dark-border',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`${accentClass} rounded-lg p-1.5`} aria-hidden="true">
            {icon}
          </span>
          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{title}</p>
            <p className="hidden text-xs text-gray-600 sm:block dark:text-gray-300">
              {windowLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
          {count}
        </span>
        {countPrev !== null ? (
          <DeltaBadge difference={count - countPrev} period={previousPeriod} critical={critical} />
        ) : null}
      </div>

      {sublabel ? (
        <p className="-mt-1 text-xs text-gray-500 dark:text-gray-400">{sublabel}</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex-1 space-y-0.5 max-sm:[&>li:not(:first-child)]:hidden">
          {items.map((item, i) => (
            <li key={`${item}-${i}`} className="truncate text-xs text-gray-600 dark:text-gray-400">
              <span className="mr-1 text-gray-300 dark:text-gray-400" aria-hidden="true">
                •
              </span>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex-1 text-xs text-gray-600 italic dark:text-gray-300">{emptyLabel}</p>
      )}

      {count > 0 ? (
        <button
          type="button"
          onClick={onAction}
          aria-pressed={pressed}
          className={cn(
            'mt-1 min-h-11 text-left text-xs font-medium text-iwana-primary-700 hover:underline dark:text-iwana-primary-400',
            interactiveFocusClassName,
            pressed && 'font-semibold underline',
          )}
        >
          {actionLabelText} →
        </button>
      ) : null}
    </div>
  );
}

export function AuditSummary({
  entries,
  isLoading,
  hasMore = false,
  hasError = false,
  onRetry,
  onGoToList,
  errorRef,
  mode,
  tenants = [],
  tenantName,
  window,
  onWindowChange,
  activePreset,
  onPresetChange,
}: AuditSummaryProps) {
  const { current, previous, previousStart } = useMemo(
    () => splitSummaryWindow(entries, window),
    [entries, window],
  );

  // Si todavía hay registros, solo comparamos cuando la muestra rebasa el periodo anterior.
  const canCompare = !hasMore || entries.some((entry) => new Date(entry.createdAt) < previousStart);
  const comparisonProps = {
    previousPeriod: window === '24h' ? COPY.summaryPrevious24h : COPY.summaryPrevious7d,
    emptyLabel: hasMore ? COPY.summaryEmptySample : COPY.summaryEmptyWindow,
  };

  const criticalCurrent = useMemo(
    () => current.filter((e) => matchesSummaryPreset(e, 'critical')),
    [current],
  );
  const criticalPrev = useMemo(
    () => previous.filter((e) => matchesSummaryPreset(e, 'critical')),
    [previous],
  );
  const criticalItems = criticalCurrent.slice(0, 3).map((e) => describePlatformActivityLine(e));

  const authCurrent = useMemo(
    () => current.filter((e) => matchesSummaryPreset(e, 'access')),
    [current],
  );
  const authPrev = useMemo(
    () => previous.filter((e) => matchesSummaryPreset(e, 'access')),
    [previous],
  );
  const loginFailed = authCurrent.filter((e) => e.action === 'LOGIN_FAILED');
  const loginOk = authCurrent.filter((e) => e.action === 'LOGIN');

  const riskActors = useMemo(() => {
    const counts: Record<string, { n: number; name: string }> = {};
    loginFailed.forEach((e) => {
      const key = e.userId ?? 'anon';
      const name = extractActorName(e);
      const prev = counts[key];
      counts[key] = { n: (prev?.n ?? 0) + 1, name };
    });
    return Object.values(counts)
      .filter((row) => row.n >= 3)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);
  }, [loginFailed]);

  const authItems =
    riskActors.length > 0
      ? riskActors.map((row) => `${row.name} — ${row.n} fallos`)
      : loginOk.slice(0, 3).map((e) => describePlatformActivityLine(e));

  const authSublabel = loginFailed.length > 0 ? `Fallidos: ${loginFailed.length}` : undefined;

  const secCurrent = useMemo(
    () => current.filter((e) => matchesSummaryPreset(e, 'security')),
    [current],
  );
  const secPrev = useMemo(
    () => previous.filter((e) => matchesSummaryPreset(e, 'security')),
    [previous],
  );
  const secItems = secCurrent.slice(0, 3).map((e) => describePlatformActivityLine(e));

  const tenantMap = useMemo(() => {
    const m: Record<string, string> = {};
    tenants.forEach((t) => {
      m[t.id] = t.name;
    });
    return m;
  }, [tenants]);

  const tenantActivity = useMemo(() => {
    if (mode !== 'platform') return [];
    const counts: Record<string, number> = {};
    current.forEach((e) => {
      if (e.entityType === 'Tenant' && e.entityId) {
        counts[e.entityId] = (counts[e.entityId] ?? 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, n]) => `${tenantMap[id] ?? 'Una empresa'} — ${n} cambios`);
  }, [mode, current, tenantMap]);

  const actorActivity = useMemo(() => {
    if (mode !== 'tenant') return [];
    const counts: Record<string, number> = {};
    current.forEach((e) => {
      const key = e.userId ?? 'Sistema';
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([uid, n]) => {
        if (uid === 'Sistema') return `Sistema — ${n} cambios`;
        const found = current.find((e) => e.userId === uid);
        const name = found ? extractActorName(found) : PLATFORM_UI_COPY.audit.actorFallback;
        return `${name} — ${n} cambios`;
      });
  }, [mode, current]);

  const countCompanies = (items: SummaryEntry[]) =>
    new Set(items.filter((entry) => entry.entityType === 'Tenant').map((entry) => entry.entityId))
      .size;
  const countActors = (items: SummaryEntry[]) => new Set(items.map((entry) => entry.userId)).size;

  const windowLabel =
    window === '24h' ? PLATFORM_UI_COPY.audit.window24h : PLATFORM_UI_COPY.audit.window7d;

  function handlePresetClick(preset: SummaryPreset) {
    onPresetChange(activePreset === preset ? null : preset);
  }

  return (
    <section className="mb-5 space-y-3" aria-label={COPY.summaryEyebrow} aria-busy={isLoading}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="portal-eyebrow">{COPY.summaryEyebrow}</p>
        {onGoToList ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto min-h-11 md:hidden"
            onClick={onGoToList}
          >
            {COPY.focusTable}
          </Button>
        ) : null}
        {!isLoading && !hasError ? (
          <div
            className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-dark-border-2"
            role="group"
            aria-label="Ventana temporal"
          >
            {(['24h', '7d'] as const).map((w) => {
              const label =
                w === '24h' ? PLATFORM_UI_COPY.audit.window24h : PLATFORM_UI_COPY.audit.window7d;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => onWindowChange(w)}
                  aria-pressed={window === w}
                  className={cn(
                    'min-h-11 px-3 text-sm transition-colors',
                    interactiveFocusClassName,
                    window === w
                      ? 'bg-iwana-primary text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-dark-surface-2 dark:text-gray-300 dark:hover:bg-dark-surface-3',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {isLoading ? (
        <div className={SUMMARY_GRID}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-35 w-full rounded-2xl" />
          ))}
        </div>
      ) : hasError ? (
        <div ref={errorRef} tabIndex={-1} className={cn('rounded-xl', interactiveFocusClassName)}>
          <ErrorState
            message={COPY.summaryError}
            onRetry={onRetry}
            retryLabel={PLATFORM_UI_COPY.dashboard.retry}
          />
        </div>
      ) : (
        <>
          {hasMore ? (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              {COPY.summarySample(entries.length)}
              {!canCompare ? ` ${COPY.summaryComparisonUnavailable}` : null}
            </p>
          ) : null}
          <div className={SUMMARY_GRID}>
            <SummaryCard
              icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
              title={PLATFORM_UI_COPY.audit.criticalChanges}
              windowLabel={windowLabel}
              count={criticalCurrent.length}
              countPrev={canCompare ? criticalPrev.length : null}
              critical
              {...comparisonProps}
              items={criticalItems}
              actionLabel="Ver críticos"
              onAction={() => handlePresetClick('critical')}
              pressed={activePreset === 'critical'}
              accentClass="bg-red-50 dark:bg-red-900/20"
            />

            <SummaryCard
              icon={<KeyRound className="h-4 w-4 text-blue-600" />}
              title={PLATFORM_UI_COPY.audit.accesses}
              windowLabel={windowLabel}
              count={authCurrent.length}
              countPrev={canCompare ? authPrev.length : null}
              {...comparisonProps}
              sublabel={authSublabel}
              items={authItems}
              actionLabel="Ver accesos"
              onAction={() => handlePresetClick('access')}
              pressed={activePreset === 'access'}
              accentClass="bg-blue-50 dark:bg-blue-900/20"
            />

            <SummaryCard
              icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
              title={PLATFORM_UI_COPY.audit.accessAndSecurity}
              windowLabel={windowLabel}
              count={secCurrent.length}
              countPrev={canCompare ? secPrev.length : null}
              {...comparisonProps}
              items={secItems}
              actionLabel="Ver seguridad"
              onAction={() => handlePresetClick('security')}
              pressed={activePreset === 'security'}
              accentClass="bg-amber-50 dark:bg-amber-900/20"
            />

            {mode === 'platform' ? (
              <SummaryCard
                icon={<Building2 className="h-4 w-4 text-iwana-primary-600" />}
                title={PLATFORM_UI_COPY.audit.companiesWithChanges}
                windowLabel={windowLabel}
                count={countCompanies(current)}
                countPrev={canCompare ? countCompanies(previous) : null}
                {...comparisonProps}
                items={tenantActivity}
                actionLabel="Ver actividad"
                onAction={() => handlePresetClick('tenants')}
                pressed={activePreset === 'tenants'}
                accentClass="bg-iwana-primary-50 dark:bg-iwana-primary-900/20"
              />
            ) : (
              <SummaryCard
                icon={<Users className="h-4 w-4 text-iwana-primary-600" />}
                title={
                  tenantName
                    ? `${PLATFORM_UI_COPY.audit.whoChanged} — ${tenantName}`
                    : PLATFORM_UI_COPY.audit.whoChanged
                }
                windowLabel={windowLabel}
                count={countActors(current)}
                countPrev={canCompare ? countActors(previous) : null}
                {...comparisonProps}
                items={actorActivity}
                actionLabel="Ver actividad"
                onAction={() => handlePresetClick('actors')}
                pressed={activePreset === 'actors'}
                accentClass="bg-iwana-primary-50 dark:bg-iwana-primary-900/20"
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

export type { SummaryPreset };
