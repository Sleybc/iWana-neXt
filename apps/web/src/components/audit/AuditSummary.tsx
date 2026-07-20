'use client';

// Resumen superior del módulo de auditoría — 4 tarjetas con señales operativas
// Agrega client-side sobre limit=200 (Fase 5: agregar endpoint de agregación en backend)
import React, { useMemo, useState } from 'react';
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
import { deriveSeverity } from './helpers/deriveSeverity';
import { computeDiff } from './helpers/computeDiff';
import { actionLabel, AUTH_ACTIONS, SECURITY_ACTIONS, TENANT_ACTIONS } from './helpers/actionLabel';
import { entityLabel } from './helpers/entityLabel';
import { timeAgo } from './helpers/timeAgo';

/**
 * Extrae el nombre legible del registro afectado desde los datos del evento.
 * Prioriza: name/firstName > email > slug — igual que buildNarrative en AuditRowBasic.
 */
function extractEntrySubject(entry: SummaryEntry): string {
  const data = entry.newValue ?? entry.oldValue;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const name = d.name ?? d.firstName ?? d.email ?? d.slug ?? d.legalName;
    if (name && typeof name === 'string') return name;
  }
  // Fallback a entidad + ID corto
  if (entry.entityId) return `${entityLabel(entry.entityType)} ${entry.entityId.slice(0, 8)}`;
  return entityLabel(entry.entityType);
}

function extractActorName(entry: SummaryEntry): string {
  if (!entry.userId) return 'Sistema';
  if (entry.actor?.displayName) return entry.actor.displayName;
  return entry.userId.slice(0, 8);
}

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
  /** 'platform' muestra tarjeta de empresas activas; 'tenant' muestra top actores */
  mode: 'platform' | 'tenant';
  /** Tenants disponibles para resolver IDs a nombres (solo en modo platform) */
  tenants?: TenantInfo[];
  /** Nombre de la empresa seleccionada (solo en modo tenant) */
  tenantName?: string | undefined;
  window: '24h' | '7d';
  onWindowChange: (w: '24h' | '7d') => void;
  onFilterApply: (filter: AppliedFilter) => void;
}

/** Retorna el timestamp de inicio de una ventana temporal */
function windowStart(window: '24h' | '7d'): Date {
  const now = new Date();
  if (window === '7d') return new Date(now.getTime() - 7 * 24 * 3600_000);
  return new Date(now.getTime() - 24 * 3600_000);
}

/** Separa entries en ventana actual y ventana anterior (para calcular delta) */
function splitWindow(
  entries: SummaryEntry[],
  window: '24h' | '7d',
): { current: SummaryEntry[]; previous: SummaryEntry[] } {
  const start = windowStart(window);
  const prevStart = new Date(start.getTime() - (window === '7d' ? 7 : 1) * 24 * 3600_000);

  const current = entries.filter((e) => new Date(e.createdAt) >= start);
  const previous = entries.filter(
    (e) => new Date(e.createdAt) >= prevStart && new Date(e.createdAt) < start,
  );
  return { current, previous };
}

/** Icono de delta con color */
function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0)
    return (
      <span className="flex items-center gap-0.5 text-xs text-gray-400">
        <Minus className="h-3 w-3" />0
      </span>
    );
  if (diff > 0)
    return (
      <span className="flex items-center gap-0.5 text-xs text-red-500">
        <TrendingUp className="h-3 w-3" />+{diff}
      </span>
    );
  return (
    <span className="flex items-center gap-0.5 text-xs text-green-500">
      <TrendingDown className="h-3 w-3" />
      {diff}
    </span>
  );
}

/** Skeleton de tarjeta durante carga */
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-dark-border-2 bg-white dark:bg-dark-surface-2 p-4 space-y-3 animate-pulse">
      <div className="h-4 w-24 bg-gray-200 dark:bg-dark-surface-4 rounded" />
      <div className="h-8 w-16 bg-gray-200 dark:bg-dark-surface-4 rounded" />
      <div className="space-y-1.5">
        <div className="h-3 w-full bg-gray-100 dark:bg-dark-surface-3 rounded" />
        <div className="h-3 w-3/4 bg-gray-100 dark:bg-dark-surface-3 rounded" />
      </div>
    </div>
  );
}

/** Tarjeta de resumen con métrica, delta y lista */
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
  accentClass: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-gray-200 dark:border-dark-border-2 bg-white dark:bg-dark-surface-2 p-4 gap-2">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`${accentClass} p-1.5 rounded-lg`} aria-hidden="true">
            {icon}
          </span>
          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{title}</p>
            <p className="text-[10px] text-gray-400">{windowLabel}</p>
          </div>
        </div>
      </div>

      {/* Métrica principal */}
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">{count}</span>
        <DeltaBadge current={count} previous={countPrev} />
      </div>

      {sublabel && <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">{sublabel}</p>}

      {/* Lista de ítems */}
      {items.length > 0 ? (
        <ul className="space-y-0.5 flex-1">
          {items.map((item, i) => (
            <li key={i} className="text-xs text-gray-600 dark:text-gray-400 truncate">
              <span className="mr-1 text-gray-300 dark:text-gray-600">•</span>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 italic flex-1">Sin actividad en esta ventana</p>
      )}

      {/* Acción */}
      {count > 0 && (
        <button
          type="button"
          onClick={onAction}
          className="mt-1 text-xs font-medium text-iwana-primary-700 dark:text-iwana-primary-400 hover:underline text-left"
        >
          {actionLabelText} →
        </button>
      )}
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
  onFilterApply,
}: AuditSummaryProps) {
  const { current, previous } = useMemo(() => splitWindow(entries, window), [entries, window]);

  // --- Tarjeta 1: Eventos críticos ---
  const criticalCurrent = useMemo(
    () =>
      current.filter((e) => {
        const diff = computeDiff(e.oldValue, e.newValue);
        return deriveSeverity(e.action, e.entityType, diff) === 'critical';
      }),
    [current],
  );
  const criticalPrev = useMemo(
    () =>
      previous.filter((e) => {
        const diff = computeDiff(e.oldValue, e.newValue);
        return deriveSeverity(e.action, e.entityType, diff) === 'critical';
      }),
    [previous],
  );
  const criticalItems = criticalCurrent
    .slice(0, 3)
    .map((e) => `${extractEntrySubject(e)} · ${actionLabel(e.action)} · ${timeAgo(e.createdAt)}`);

  // --- Tarjeta 2: Accesos ---
  const authCurrent = useMemo(() => current.filter((e) => AUTH_ACTIONS.has(e.action)), [current]);
  const authPrev = useMemo(() => previous.filter((e) => AUTH_ACTIONS.has(e.action)), [previous]);
  const loginFailed = authCurrent.filter((e) => e.action === 'LOGIN_FAILED');
  const loginOk = authCurrent.filter((e) => e.action === 'LOGIN');

  // Priorizar señales de riesgo cuando existan (≥3 fallidos del mismo actor)
  const riskActors = useMemo(() => {
    const counts: Record<string, number> = {};
    loginFailed.forEach((e) => {
      const key = e.userId ?? e.ipAddress ?? 'desconocido';
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [loginFailed]);

  const authItems =
    riskActors.length > 0
      ? riskActors.map(
          ([actor, n]) =>
            `⚠ ${actor.length > 30 ? 'desconocido' : actor.slice(0, 12)} — ${n} fallos`,
        )
      : loginOk.slice(0, 3).map((e) => `${extractEntrySubject(e)} · ${timeAgo(e.createdAt)}`);

  const authSublabel = loginFailed.length > 0 ? `Fallidos: ${loginFailed.length}` : undefined;

  // --- Tarjeta 3: Permisos y seguridad ---
  // Solo cuenta acciones de seguridad y tenant explícitas (no UPDATEs genéricos).
  // Los UPDATEs con campos críticos ya están cubiertos por "Eventos críticos".
  const secCurrent = useMemo(
    () => current.filter((e) => SECURITY_ACTIONS.has(e.action) || TENANT_ACTIONS.has(e.action)),
    [current],
  );
  const secPrev = useMemo(
    () => previous.filter((e) => SECURITY_ACTIONS.has(e.action) || TENANT_ACTIONS.has(e.action)),
    [previous],
  );
  const secItems = secCurrent
    .slice(0, 3)
    .map((e) => `${extractEntrySubject(e)} · ${actionLabel(e.action)}`);

  // --- Tarjeta 4 / 4-bis ---
  // Modo platform: empresas más activas (por entityType === 'Tenant' o entityId)
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
      .map(([id, n]) => `${tenantMap[id] ?? id.slice(0, 8)} — ${n} acciones`);
  }, [mode, current, tenantMap]);

  const uniqueTenantsCount = useMemo(() => {
    const ids = new Set(current.filter((e) => e.entityType === 'Tenant').map((e) => e.entityId));
    return ids.size;
  }, [current]);

  // Top actores en modo tenant
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
        if (uid === 'Sistema') return `Sistema — ${n} acciones`;
        // Buscar nombre en algún entry con ese userId
        const entry = current.find((e) => e.userId === uid);
        const name = entry ? extractActorName(entry) : uid.slice(0, 8);
        return `${name} — ${n} acciones`;
      });
  }, [mode, current]);

  const uniqueActors = useMemo(() => {
    return new Set(current.map((e) => e.userId ?? 'Sistema')).size;
  }, [current]);

  const windowLabel = window === '24h' ? 'Últimas 24 h' : 'Últimos 7 días';

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 mb-6">
      {/* Control de ventana temporal */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">Resumen:</span>
        <div className="flex rounded-lg border border-gray-200 dark:border-dark-border-2 overflow-hidden text-xs">
          {(['24h', '7d'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onWindowChange(w)}
              className={`px-3 py-1 transition-colors ${
                window === w
                  ? 'bg-iwana-primary text-white'
                  : 'bg-white dark:bg-dark-surface-2 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-surface-3'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Tarjeta 1: Eventos críticos */}
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
          title="Eventos críticos"
          windowLabel={windowLabel}
          count={criticalCurrent.length}
          countPrev={criticalPrev.length}
          items={criticalItems}
          actionLabel="Ver críticos"
          onAction={() => onFilterApply({ severity: 'critical' })}
          accentClass="bg-red-50 dark:bg-red-900/20"
        />

        {/* Tarjeta 2: Accesos */}
        <SummaryCard
          icon={<KeyRound className="h-4 w-4 text-blue-600" />}
          title="Accesos"
          windowLabel={windowLabel}
          count={authCurrent.length}
          countPrev={authPrev.length}
          sublabel={authSublabel}
          items={authItems}
          actionLabel="Ver accesos"
          onAction={() => onFilterApply({ actionSet: [...AUTH_ACTIONS] })}
          accentClass="bg-blue-50 dark:bg-blue-900/20"
        />

        {/* Tarjeta 3: Permisos y seguridad */}
        <SummaryCard
          icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
          title="Permisos y seguridad"
          windowLabel={window === '24h' ? 'Últimas 24 h' : 'Últimos 7 días'}
          count={secCurrent.length}
          countPrev={secPrev.length}
          items={secItems}
          actionLabel="Ver permisos"
          onAction={() => onFilterApply({ actionSet: [...SECURITY_ACTIONS, ...TENANT_ACTIONS] })}
          accentClass="bg-amber-50 dark:bg-amber-900/20"
        />

        {/* Tarjeta 4 / 4-bis */}
        {mode === 'platform' ? (
          <SummaryCard
            icon={<Building2 className="h-4 w-4 text-iwana-primary-600" />}
            title="Empresas activas"
            windowLabel={windowLabel}
            count={uniqueTenantsCount}
            countPrev={0}
            items={tenantActivity}
            actionLabel="Ver actividad"
            onAction={() => onFilterApply({ actionSet: ['CREATE', 'UPDATE', 'DELETE'] })}
            accentClass="bg-iwana-primary-50 dark:bg-iwana-primary-900/20"
          />
        ) : (
          <SummaryCard
            icon={<Users className="h-4 w-4 text-iwana-secondary-700" />}
            title={tenantName ? `Actores — ${tenantName}` : 'Top actores'}
            windowLabel={windowLabel}
            count={uniqueActors}
            countPrev={0}
            items={actorActivity}
            actionLabel="Ver actividad"
            onAction={() => onFilterApply({ actionSet: ['CREATE', 'UPDATE', 'DELETE'] })}
            accentClass="bg-iwana-secondary-50 dark:bg-iwana-secondary-900/20"
          />
        )}
      </div>
    </div>
  );
}
