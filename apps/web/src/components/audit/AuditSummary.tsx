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
import { cn, interactiveFocusClassName, SkeletonBlock } from '@iwana/ui';
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

interface AuditSummaryProps {
  entries: SummaryEntry[];
  isLoading: boolean;
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

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-gray-500">
        <Minus className="h-3 w-3" aria-hidden="true" />0
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-error-700 dark:text-error-400">
        <TrendingUp className="h-3 w-3" aria-hidden="true" />+{diff}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-xs text-success-700 dark:text-success-400">
      <TrendingDown className="h-3 w-3" aria-hidden="true" />
      {diff}
    </span>
  );
}

function SummaryCard({
  icon,
  title,
  windowLabel,
  count,
  countPrev,
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
  countPrev: number;
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
        'flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-iwana-soft dark:bg-dark-surface-2',
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
            <p className="text-xs text-gray-500">{windowLabel}</p>
          </div>
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
          {count}
        </span>
        <DeltaBadge current={count} previous={countPrev} />
      </div>

      {sublabel ? (
        <p className="-mt-1 text-xs text-gray-500 dark:text-gray-400">{sublabel}</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex-1 space-y-0.5">
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
        <p className="flex-1 text-xs text-gray-500 italic">Sin actividad en esta ventana</p>
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
  mode,
  tenants = [],
  tenantName,
  window,
  onWindowChange,
  activePreset,
  onPresetChange,
}: AuditSummaryProps) {
  const { current, previous } = useMemo(
    () => splitSummaryWindow(entries, window),
    [entries, window],
  );

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

  const uniqueTenantsCount = useMemo(() => {
    const ids = new Set(current.filter((e) => e.entityType === 'Tenant').map((e) => e.entityId));
    return ids.size;
  }, [current]);

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

  const uniqueActors = useMemo(() => {
    return new Set(current.map((e) => e.userId ?? 'Sistema')).size;
  }, [current]);

  const windowLabel =
    window === '24h' ? PLATFORM_UI_COPY.audit.window24h : PLATFORM_UI_COPY.audit.window7d;

  function handlePresetClick(preset: SummaryPreset) {
    onPresetChange(activePreset === preset ? null : preset);
  }

  if (isLoading) {
    return (
      <section className="mb-6" aria-busy="true" aria-label={PLATFORM_UI_COPY.audit.summaryEyebrow}>
        <p className="portal-eyebrow">{PLATFORM_UI_COPY.audit.summaryEyebrow}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-[140px] w-full rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6 space-y-3" aria-label={PLATFORM_UI_COPY.audit.summaryEyebrow}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="portal-eyebrow">{PLATFORM_UI_COPY.audit.summaryEyebrow}</p>
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
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
          title={PLATFORM_UI_COPY.audit.criticalChanges}
          windowLabel={windowLabel}
          count={criticalCurrent.length}
          countPrev={criticalPrev.length}
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
          countPrev={authPrev.length}
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
          countPrev={secPrev.length}
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
            count={uniqueTenantsCount}
            countPrev={0}
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
            count={uniqueActors}
            countPrev={0}
            items={actorActivity}
            actionLabel="Ver actividad"
            onAction={() => handlePresetClick('actors')}
            pressed={activePreset === 'actors'}
            accentClass="bg-iwana-primary-50 dark:bg-iwana-primary-900/20"
          />
        )}
      </div>
    </section>
  );
}

export type { SummaryPreset };
