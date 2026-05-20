'use client';

// Tabla principal de registros de auditoría — soporta modo Básico y Técnico
// con filtros client-side, export CSV, paginación cursor-based y conmutador de vista
import React, { useMemo, useState } from 'react';
import { DatePicker, Select } from '@iwana/ui';
import { AuditRowBasic } from './AuditRowBasic';
import type { AuditBasicEntry } from './AuditRowBasic';
import { AuditRowTechnical } from './AuditRowTechnical';
import type { AuditTechnicalEntry } from './AuditRowTechnical';
import { deriveSeverity } from './helpers/deriveSeverity';
import { computeDiff } from './helpers/computeDiff';
import { actionLabel } from './helpers/actionLabel';

import type { AuditLogEntry } from '@/lib/api-client';

// Tipo base con los campos necesarios para el render de filas
export type BaseAuditEntry = Pick<
  AuditLogEntry,
  | 'id'
  | 'action'
  | 'entityType'
  | 'entityId'
  | 'userId'
  | 'actor'
  | 'ipAddress'
  | 'userAgent'
  | 'requestId'
  | 'oldValue'
  | 'newValue'
  | 'createdAt'
>;

/** Filtros aplicables a la tabla — pueden venir del resumen o de los controles internos */
export interface TableFilters {
  action?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  actionSet?: string[] | undefined;
  severity?: 'critical' | 'medium' | 'info' | undefined;
}

interface AuditLogsTableProps {
  entries?: BaseAuditEntry[];
  isLoading: boolean;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNext: () => void;
  onPrev: () => void;
  /** Modo de vista controlado desde la página padre (compartido entre tablas) */
  viewMode: 'basic' | 'technical';
  onViewModeChange: (mode: 'basic' | 'technical') => void;
  /** Filtros externos aplicados desde el resumen — se mezclan con los internos */
  externalFilters?: TableFilters | undefined;
  /** Nombre de empresa para mostrar en el pie de las filas básicas */
  companyName?: string | undefined;
  /** Índice de página (1-based) para mostrar en el footer de paginación */
  pageIndex: number;
}

const ACTION_FILTER_OPTIONS = [
  { value: '', label: 'Todas las acciones' },
  { value: 'CREATE', label: actionLabel('CREATE') },
  { value: 'UPDATE', label: actionLabel('UPDATE') },
  { value: 'DELETE', label: actionLabel('DELETE') },
  { value: 'LOGIN', label: actionLabel('LOGIN') },
  { value: 'LOGOUT', label: actionLabel('LOGOUT') },
  { value: 'LOGIN_FAILED', label: actionLabel('LOGIN_FAILED') },
  { value: 'MFA_ENABLED', label: actionLabel('MFA_ENABLED') },
  { value: 'MFA_DISABLED', label: actionLabel('MFA_DISABLED') },
  { value: 'TENANT_SUSPENDED', label: actionLabel('TENANT_SUSPENDED') },
  { value: 'TENANT_ACTIVATED', label: actionLabel('TENANT_ACTIVATED') },
];

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {hasFilters
          ? 'No hay eventos que cumplan los filtros actuales.'
          : 'Aún no hay actividad registrada en esta ventana.'}
      </p>
    </div>
  );
}

function toDateFromLocalDateValue(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function toLocalDateValue(date: Date | undefined): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function AuditLogsTable({
  entries = [],
  isLoading,
  hasNextPage,
  hasPrevPage,
  onNext,
  onPrev,
  viewMode,
  onViewModeChange,
  externalFilters,
  companyName,
  pageIndex,
}: AuditLogsTableProps) {
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const effectiveFilters: TableFilters = {
    action: externalFilters?.action ?? actionFilter,
    dateFrom: externalFilters?.dateFrom ?? dateFrom,
    dateTo: externalFilters?.dateTo ?? dateTo,
    ...(externalFilters?.actionSet !== undefined && { actionSet: externalFilters.actionSet }),
    ...(externalFilters?.severity !== undefined && { severity: externalFilters.severity }),
  };

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (effectiveFilters.action && entry.action !== effectiveFilters.action) return false;
      if (effectiveFilters.actionSet?.length && !effectiveFilters.actionSet.includes(entry.action))
        return false;
      if (effectiveFilters.severity) {
        const diff = computeDiff(entry.oldValue, entry.newValue);
        const sev = deriveSeverity(entry.action, entry.entityType, diff);
        if (sev !== effectiveFilters.severity) return false;
      }
      if (
        effectiveFilters.dateFrom &&
        new Date(entry.createdAt) < new Date(effectiveFilters.dateFrom)
      )
        return false;
      if (
        effectiveFilters.dateTo &&
        new Date(entry.createdAt) > new Date(`${effectiveFilters.dateTo}T23:59:59`)
      )
        return false;
      return true;
    });
  }, [
    entries,
    effectiveFilters.action,
    effectiveFilters.actionSet,
    effectiveFilters.severity,
    effectiveFilters.dateFrom,
    effectiveFilters.dateTo,
  ]);

  const hasExternalFilters = Boolean(
    externalFilters?.action || externalFilters?.actionSet?.length || externalFilters?.severity,
  );

  function handleRowToggle(id: string) {
    setExpandedRowId((prev) => (prev === id ? null : id));
  }

  function handleExportCsv() {
    const headers = [
      'Fecha',
      'Acción',
      'Entidad',
      'ID de entidad',
      'Actor',
      'IP',
      'ID de solicitud',
    ];
    const rows = filteredEntries.map((e) =>
      [
        new Date(e.createdAt).toLocaleString('es-CO'),
        e.action,
        e.entityType,
        e.entityId ?? '',
        e.actor?.displayName ?? e.userId ?? 'Sistema',
        e.ipAddress ?? '',
        e.requestId ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-dark-surface-2">
      {/* Barra de controles */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-800">
        {/* Conmutador Básico / Técnico */}
        <div
          className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs shrink-0"
          role="group"
          aria-label="Modo de vista"
        >
          <button
            type="button"
            onClick={() => onViewModeChange('basic')}
            aria-pressed={viewMode === 'basic'}
            className={`px-3 py-1.5 transition-colors ${
              viewMode === 'basic'
                ? 'bg-iwana-primary text-white font-medium'
                : 'bg-white dark:bg-dark-surface-2 text-gray-600 dark:text-gray-400 hover:bg-gray-50'
            }`}
          >
            Básico
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('technical')}
            aria-pressed={viewMode === 'technical'}
            className={`px-3 py-1.5 transition-colors ${
              viewMode === 'technical'
                ? 'bg-iwana-primary text-white font-medium'
                : 'bg-white dark:bg-dark-surface-2 text-gray-600 dark:text-gray-400 hover:bg-gray-50'
            }`}
          >
            Técnico
          </button>
        </div>

        {!hasExternalFilters && (
          <>
            <div className="w-full sm:w-[220px]">
              <Select
                id="audit-action-filter"
                options={ACTION_FILTER_OPTIONS}
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                aria-label="Filtrar por acción"
                title="Filtrar por acción"
              />
            </div>
            <div className="w-full sm:w-[180px]">
              <DatePicker
                id="audit-date-from"
                value={toDateFromLocalDateValue(dateFrom)}
                onChange={(date) => setDateFrom(toLocalDateValue(date))}
                placeholder="Fecha desde"
                buttonClassName="rounded-lg border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-dark-surface-3 dark:text-gray-300"
              />
            </div>
            <div className="w-full sm:w-[180px]">
              <DatePicker
                id="audit-date-to"
                value={toDateFromLocalDateValue(dateTo)}
                onChange={(date) => setDateTo(toLocalDateValue(date))}
                placeholder="Fecha hasta"
                buttonClassName="rounded-lg border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-dark-surface-3 dark:text-gray-300"
              />
            </div>
          </>
        )}

        {hasExternalFilters && (
          <span className="text-xs text-iwana-primary-700 dark:text-iwana-primary-400 bg-iwana-primary-50 dark:bg-iwana-primary-900/20 px-2 py-1 rounded-lg">
            Filtro activo desde resumen
          </span>
        )}

        <button
          type="button"
          onClick={handleExportCsv}
          className="ml-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface-3 dark:text-gray-300 dark:hover:bg-dark-surface-4 transition-colors"
        >
          Exportar CSV
        </button>
      </div>

      {viewMode === 'technical' ? (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-dark-surface-3 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Fecha</th>
              <th className="px-3 py-2 text-left font-medium">Evento</th>
              <th className="px-3 py-2 text-left font-medium">Registro afectado</th>
              <th className="px-3 py-2 text-left font-medium">Actor</th>
              <th className="px-3 py-2 text-left font-medium">Origen</th>
              <th className="px-3 py-2 text-left font-medium">Cliente</th>
              <th className="px-3 py-2 text-left font-medium">Trazabilidad</th>
              <th className="px-3 py-2" aria-label="Expandir" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-dark-border">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center">
                  <EmptyState
                    hasFilters={Boolean(actionFilter || dateFrom || dateTo || hasExternalFilters)}
                  />
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <AuditRowTechnical
                  key={entry.id}
                  entry={entry as AuditTechnicalEntry}
                  expanded={expandedRowId === entry.id}
                  onToggle={() => handleRowToggle(entry.id)}
                />
              ))
            )}
          </tbody>
        </table>
      ) : (
        <table className="w-full">
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-dark-border">
                  <td className="px-4 py-4">
                    <div className="space-y-2 animate-pulse">
                      <div className="flex gap-3">
                        <div className="mt-1 h-2 w-2 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
                          <div className="flex gap-1.5">
                            <div className="h-5 w-16 bg-gray-100 dark:bg-gray-800 rounded-full" />
                            <div className="h-5 w-14 bg-gray-100 dark:bg-gray-800 rounded-full" />
                          </div>
                          <div className="h-3 w-1/2 bg-gray-100 dark:bg-gray-800 rounded" />
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : filteredEntries.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center">
                  <EmptyState
                    hasFilters={Boolean(actionFilter || dateFrom || dateTo || hasExternalFilters)}
                  />
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <AuditRowBasic
                  key={entry.id}
                  entry={entry as AuditBasicEntry}
                  expanded={expandedRowId === entry.id}
                  onToggle={() => handleRowToggle(entry.id)}
                  companyName={companyName}
                />
              ))
            )}
          </tbody>
        </table>
      )}

      {/* Paginación */}
      <div className="flex items-center justify-between gap-2 border-t border-gray-100 dark:border-dark-border px-4 py-2.5">
        <p className="text-xs text-gray-500">
          {isLoading
            ? 'Cargando…'
            : `${filteredEntries.length} registro${filteredEntries.length !== 1 ? 's' : ''} · Página ${pageIndex}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-dark-surface-3 transition-colors"
            onClick={onPrev}
            disabled={!hasPrevPage || isLoading}
          >
            ← Anterior
          </button>
          <button
            type="button"
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-dark-surface-3 transition-colors"
            onClick={onNext}
            disabled={!hasNextPage || isLoading}
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}
