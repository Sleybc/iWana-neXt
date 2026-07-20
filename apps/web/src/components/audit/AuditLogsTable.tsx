'use client';

// Tabla principal de registros de auditoría — soporta modo Básico y Técnico
// con filtros de barra (server-side vía page), severity/actionSet client-side,
// export CSV server-side, paginación cursor-based y conmutador de vista
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
  /**
   * Filtros de barra controlados (URL / server-side).
   * Si se omite un callback, el control correspondiente usa estado interno.
   */
  actionFilter?: string;
  dateFrom?: string;
  dateTo?: string;
  onActionFilterChange?: (value: string) => void;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  /** Export CSV server-side; si falla, el caller muestra el error. */
  onExportCsv?: () => Promise<{ truncated: boolean } | void> | { truncated: boolean } | void;
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
    <div className="mx-auto flex max-w-md flex-col items-center gap-1 py-2">
      <p className="text-sm font-medium text-iwana-primary dark:text-white">
        {hasFilters ? 'Sin eventos con estos filtros' : 'Sin actividad registrada'}
      </p>
      <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
        {hasFilters
          ? 'Ajusta la acción o el rango de fechas, o limpia el filtro del resumen.'
          : 'Cuando ocurra una operación auditada, aparecerá aquí.'}
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
  actionFilter: controlledAction,
  dateFrom: controlledDateFrom,
  dateTo: controlledDateTo,
  onActionFilterChange,
  onDateFromChange,
  onDateToChange,
  onExportCsv,
}: AuditLogsTableProps) {
  const [internalAction, setInternalAction] = useState(controlledAction ?? '');
  const [internalDateFrom, setInternalDateFrom] = useState(controlledDateFrom ?? '');
  const [internalDateTo, setInternalDateTo] = useState(controlledDateTo ?? '');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const actionFilter = onActionFilterChange ? (controlledAction ?? '') : internalAction;
  const dateFrom = onDateFromChange ? (controlledDateFrom ?? '') : internalDateFrom;
  const dateTo = onDateToChange ? (controlledDateTo ?? '') : internalDateTo;

  const setActionFilter = onActionFilterChange ?? setInternalAction;
  const setDateFrom = onDateFromChange ?? setInternalDateFrom;
  const setDateTo = onDateToChange ?? setInternalDateTo;

  // Acción/fechas las aplica el servidor vía list; severity/actionSet del resumen
  // siguen client-side sobre la página ya filtrada (API sin query `actions`).
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (externalFilters?.actionSet?.length && !externalFilters.actionSet.includes(entry.action)) {
        return false;
      }
      if (externalFilters?.severity) {
        const diff = computeDiff(entry.oldValue, entry.newValue);
        const sev = deriveSeverity(entry.action, entry.entityType, diff);
        if (sev !== externalFilters.severity) return false;
      }
      return true;
    });
  }, [entries, externalFilters?.actionSet, externalFilters?.severity]);

  const hasExternalFilters = Boolean(
    externalFilters?.action || externalFilters?.actionSet?.length || externalFilters?.severity,
  );

  const hasServerFilters = Boolean(actionFilter || dateFrom || dateTo);

  function handleRowToggle(id: string) {
    setExpandedRowId((prev) => (prev === id ? null : id));
  }

  async function handleExportCsv() {
    if (!onExportCsv || isExporting) return;
    setIsExporting(true);
    setExportNotice(null);
    try {
      const result = await onExportCsv();
      if (result?.truncated) {
        setExportNotice('Export limitado a 5000 registros.');
      }
    } catch {
      setExportNotice('No se pudo exportar el CSV. Intenta de nuevo.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden bg-white dark:bg-dark-surface-2">
      {/* Barra de controles */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-200 dark:border-dark-border">
        {/* Conmutador Básico / Técnico */}
        <div
          className="flex shrink-0 overflow-hidden rounded-lg border border-gray-200 text-xs dark:border-dark-border-2"
          role="group"
          aria-label="Modo de vista"
        >
          <button
            type="button"
            onClick={() => onViewModeChange('basic')}
            aria-pressed={viewMode === 'basic'}
            className={`min-h-11 px-3 transition-colors ${
              viewMode === 'basic'
                ? 'bg-iwana-primary font-medium text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-dark-surface-2 dark:text-gray-400'
            }`}
          >
            Básico
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('technical')}
            aria-pressed={viewMode === 'technical'}
            className={`min-h-11 px-3 transition-colors ${
              viewMode === 'technical'
                ? 'bg-iwana-primary font-medium text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-dark-surface-2 dark:text-gray-400'
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
                buttonClassName="min-h-11 rounded-lg border-gray-200 bg-white px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-300"
              />
            </div>
            <div className="w-full sm:w-[180px]">
              <DatePicker
                id="audit-date-to"
                value={toDateFromLocalDateValue(dateTo)}
                onChange={(date) => setDateTo(toLocalDateValue(date))}
                placeholder="Fecha hasta"
                buttonClassName="min-h-11 rounded-lg border-gray-200 bg-white px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-300"
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
          onClick={() => void handleExportCsv()}
          disabled={!onExportCsv || isExporting}
          title="Exportar registros con los filtros actuales (hasta 5000)"
          aria-label="Exportar CSV con los filtros actuales"
          className="ml-auto min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-300 dark:hover:bg-dark-surface-4"
        >
          {isExporting ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </div>

      {exportNotice && (
        <div
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
        >
          {exportNotice}
        </div>
      )}

      {viewMode === 'technical' ? (
        <div className="overflow-x-auto">
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
                        <div className="animate-pulse bg-gray-200 dark:bg-dark-surface-4 rounded h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center">
                    <EmptyState hasFilters={Boolean(hasServerFilters || hasExternalFilters)} />
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
        </div>
      ) : (
        <table className="w-full">
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-dark-border">
                  <td className="px-4 py-4">
                    <div className="space-y-2 animate-pulse">
                      <div className="flex gap-3">
                        <div className="mt-1 h-2 w-2 rounded-full bg-gray-200 dark:bg-dark-surface-4 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-3/4 bg-gray-200 dark:bg-dark-surface-4 rounded" />
                          <div className="flex gap-1.5">
                            <div className="h-5 w-16 bg-gray-100 dark:bg-dark-surface-3 rounded-full" />
                            <div className="h-5 w-14 bg-gray-100 dark:bg-dark-surface-3 rounded-full" />
                          </div>
                          <div className="h-3 w-1/2 bg-gray-100 dark:bg-dark-surface-3 rounded" />
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : filteredEntries.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center">
                  <EmptyState hasFilters={Boolean(hasServerFilters || hasExternalFilters)} />
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
      <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-2.5 dark:border-dark-border">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {isLoading
            ? 'Cargando…'
            : `${filteredEntries.length} registro${filteredEntries.length !== 1 ? 's' : ''} · Página ${pageIndex}`}
          {!isLoading && hasExternalFilters && (
            <span className="ml-1 text-gray-500 dark:text-gray-400">
              · El filtro del resumen aplica solo sobre esta página
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-border-2 dark:text-gray-300 dark:hover:bg-dark-surface-3"
            onClick={onPrev}
            disabled={!hasPrevPage || isLoading}
          >
            ← Anterior
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-border-2 dark:text-gray-300 dark:hover:bg-dark-surface-3"
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
