'use client';

// Tabla principal del historial — modos Lectura / Detalle (DS-A-TABLE).
import React, { type Ref, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  DatePicker,
  Select,
  SkeletonBlock,
  cn,
  interactiveFocusClassName,
} from '@iwana/ui';
import { AuditRowBasic } from './AuditRowBasic';
import type { AuditBasicEntry } from './AuditRowBasic';
import { AuditRowTechnical } from './AuditRowTechnical';
import type { AuditTechnicalEntry } from './AuditRowTechnical';
import { actionLabel } from './helpers/actionLabel';
import type { AuditLogEntry } from '@/lib/api-client';
import { PLATFORM_PAGE_SIZE_OPTIONS } from '@/lib/platform-page-size';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

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

/** @deprecated CA-AUD-09: el resumen ya no empuja severity/actionSet. */
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
  viewMode: 'basic' | 'technical';
  onViewModeChange: (mode: 'basic' | 'technical') => void;
  /** @deprecated Ignorado — CA-AUD-09. */
  externalFilters?: TableFilters | undefined;
  companyName?: string | undefined;
  pageIndex: number;
  pageSize: number;
  onPageSizeChange: (value: number) => void;
  actionFilter?: string;
  dateFrom?: string;
  dateTo?: string;
  onActionFilterChange?: (value: string) => void;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  onExportCsv?: () => Promise<{ truncated: boolean } | void> | { truncated: boolean } | void;
  /** Título de tabla para foco CA-AUD-09. */
  titleRef?: Ref<HTMLHeadingElement>;
  titleId?: string;
  /**
   * Empty C: lote del resumen evaluado pero preset sin coincidencias.
   * Tiene prioridad sobre empty de filtros servidor / parque.
   */
  emptySummaryPreset?: boolean;
  /**
   * Con preset activo: ocultar controles de pager (DS-A-TABLE v1.2).
   */
  summaryPresetActive?: boolean;
}

const ACTION_FILTER_OPTIONS = [
  { value: '', label: PLATFORM_UI_COPY.audit.allActions },
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

function EmptyState({
  hasFilters,
  emptySummaryPreset,
}: {
  hasFilters: boolean;
  emptySummaryPreset?: boolean;
}) {
  const title = emptySummaryPreset
    ? PLATFORM_UI_COPY.audit.emptySummaryPreset
    : hasFilters
      ? PLATFORM_UI_COPY.audit.emptyFiltered
      : PLATFORM_UI_COPY.audit.emptyPark;
  const hint = emptySummaryPreset
    ? PLATFORM_UI_COPY.audit.emptySummaryPresetHint
    : hasFilters
      ? PLATFORM_UI_COPY.audit.emptyFilteredHint
      : PLATFORM_UI_COPY.audit.emptyParkHint;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-1 py-2">
      <p className="text-sm font-medium text-iwana-primary dark:text-white">{title}</p>
      <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">{hint}</p>
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
  companyName,
  pageIndex,
  pageSize,
  onPageSizeChange,
  actionFilter: controlledAction,
  dateFrom: controlledDateFrom,
  dateTo: controlledDateTo,
  onActionFilterChange,
  onDateFromChange,
  onDateToChange,
  onExportCsv,
  titleRef,
  titleId = 'audit-table-title',
  emptySummaryPreset = false,
  summaryPresetActive = false,
}: AuditLogsTableProps) {
  const [internalAction, setInternalAction] = useState(controlledAction ?? '');
  const [internalDateFrom, setInternalDateFrom] = useState(controlledDateFrom ?? '');
  const [internalDateTo, setInternalDateTo] = useState(controlledDateTo ?? '');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportTruncated, setExportTruncated] = useState(false);

  const actionFilter = onActionFilterChange ? (controlledAction ?? '') : internalAction;
  const dateFrom = onDateFromChange ? (controlledDateFrom ?? '') : internalDateFrom;
  const dateTo = onDateToChange ? (controlledDateTo ?? '') : internalDateTo;

  const setActionFilter = onActionFilterChange ?? setInternalAction;
  const setDateFrom = onDateFromChange ?? setInternalDateFrom;
  const setDateTo = onDateToChange ?? setInternalDateTo;

  const hasServerFilters = Boolean(actionFilter || dateFrom || dateTo);
  const showTechnicalMeta = viewMode === 'technical';

  function handleRowToggle(id: string) {
    setExpandedRowId((prev) => (prev === id ? null : id));
  }

  async function handleExportCsv() {
    if (!onExportCsv || isExporting) return;
    setIsExporting(true);
    setExportError(null);
    setExportTruncated(false);
    try {
      const result = await onExportCsv();
      if (result?.truncated) {
        setExportTruncated(true);
      }
    } catch {
      setExportError(PLATFORM_UI_COPY.audit.downloadError);
    } finally {
      setIsExporting(false);
    }
  }

  const rowCountLabel = useMemo(() => {
    if (isLoading) return 'Cargando…';
    return `${entries.length} cambio${entries.length !== 1 ? 's' : ''} · Página ${pageIndex}`;
  }, [entries.length, isLoading, pageIndex]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2">
      <div className="border-b border-gray-200 px-4 pt-4 dark:border-dark-border">
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className={cn(
            'text-sm font-semibold text-gray-900 outline-none dark:text-white',
            interactiveFocusClassName,
          )}
        >
          {PLATFORM_UI_COPY.audit.tableTitle}
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 p-4 dark:border-dark-border">
        <div
          className="flex shrink-0 overflow-hidden rounded-lg border border-gray-200 text-sm dark:border-dark-border-2"
          role="group"
          aria-label="Modo de vista"
        >
          <button
            type="button"
            onClick={() => onViewModeChange('basic')}
            aria-pressed={viewMode === 'basic'}
            className={cn(
              'min-h-11 px-3 transition-colors',
              interactiveFocusClassName,
              viewMode === 'basic'
                ? 'bg-iwana-primary font-medium text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-dark-surface-2 dark:text-gray-400',
            )}
          >
            {PLATFORM_UI_COPY.audit.modeReading}
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('technical')}
            aria-pressed={viewMode === 'technical'}
            className={cn(
              'min-h-11 px-3 transition-colors',
              interactiveFocusClassName,
              viewMode === 'technical'
                ? 'bg-iwana-primary font-medium text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-dark-surface-2 dark:text-gray-400',
            )}
          >
            {PLATFORM_UI_COPY.audit.modeDetail}
          </button>
        </div>

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

        <button
          type="button"
          onClick={() => void handleExportCsv()}
          disabled={!onExportCsv || isExporting}
          aria-label={PLATFORM_UI_COPY.audit.download}
          className={cn(
            'ml-auto min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-300 dark:hover:bg-dark-surface-4',
            interactiveFocusClassName,
          )}
        >
          {isExporting ? PLATFORM_UI_COPY.audit.downloading : PLATFORM_UI_COPY.audit.download}
        </button>
      </div>

      {exportError ? (
        <div className="border-b border-gray-200 px-4 py-3 dark:border-dark-border">
          <Alert variant="error">
            <AlertDescription>{exportError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {exportTruncated ? (
        <div className="border-b border-gray-200 px-4 py-3 dark:border-dark-border">
          <Alert variant="warning">
            <AlertDescription>{PLATFORM_UI_COPY.audit.downloadTruncated}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {viewMode === 'technical' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs tracking-wide text-gray-500 uppercase dark:bg-dark-surface-3 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Fecha</th>
                <th className="px-3 py-2 text-left font-medium">Evento</th>
                <th className="px-3 py-2 text-left font-medium">Registro afectado</th>
                <th className="px-3 py-2 text-left font-medium">Quién</th>
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
                        <SkeletonBlock className="h-4 w-full rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center">
                    <EmptyState
                      hasFilters={hasServerFilters}
                      emptySummaryPreset={emptySummaryPreset}
                    />
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <AuditRowTechnical
                    key={entry.id}
                    entry={entry as AuditTechnicalEntry}
                    expanded={expandedRowId === entry.id}
                    onToggle={() => handleRowToggle(entry.id)}
                    showTechnicalMeta={showTechnicalMeta}
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
                    <div className="flex gap-3">
                      <SkeletonBlock className="mt-1 h-2 w-2 shrink-0 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <SkeletonBlock className="h-4 w-3/4 rounded" />
                        <div className="flex gap-1.5">
                          <SkeletonBlock className="h-5 w-16 rounded-full" />
                          <SkeletonBlock className="h-5 w-14 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center">
                  <EmptyState
                    hasFilters={hasServerFilters}
                    emptySummaryPreset={emptySummaryPreset}
                  />
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <AuditRowBasic
                  key={entry.id}
                  entry={entry as AuditBasicEntry}
                  expanded={expandedRowId === entry.id}
                  onToggle={() => handleRowToggle(entry.id)}
                  companyName={companyName}
                  showTechnicalMeta={false}
                />
              ))
            )}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-2.5 dark:border-dark-border">
        <p className="text-xs text-gray-500 dark:text-gray-400">{rowCountLabel}</p>
        {summaryPresetActive ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {PLATFORM_UI_COPY.audit.pageSizeLabel}
              </span>
              <div className="w-[5.5rem]">
                <Select
                  id={companyName ? 'tenant-audit-page-size' : 'platform-audit-page-size'}
                  options={PLATFORM_PAGE_SIZE_OPTIONS.map((size) => ({
                    value: String(size),
                    label: String(size),
                  }))}
                  value={String(pageSize)}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value, 10);
                    if (Number.isFinite(next)) onPageSizeChange(next);
                  }}
                  disabled={isLoading}
                  aria-label={PLATFORM_UI_COPY.audit.pageSizeLabel}
                />
              </div>
            </div>
            <button
              type="button"
              className={cn(
                'min-h-11 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-border-2 dark:text-gray-300 dark:hover:bg-dark-surface-3',
                interactiveFocusClassName,
              )}
              onClick={onPrev}
              disabled={!hasPrevPage || isLoading}
            >
              ← Anterior
            </button>
            <button
              type="button"
              className={cn(
                'min-h-11 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-border-2 dark:text-gray-300 dark:hover:bg-dark-surface-3',
                interactiveFocusClassName,
              )}
              onClick={onNext}
              disabled={!hasNextPage || isLoading}
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
