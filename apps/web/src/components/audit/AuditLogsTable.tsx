'use client';

// Tabla de registros de auditoría con paginación cursor-based, filtros client-side y export CSV
import React, { useMemo, useState } from 'react';
import { Select } from '@iwana/ui';

import type { AuditLogEntry, PlatformAuditLogEntry } from '@/lib/api-client';

// Base type con campos comunes
type BaseAuditEntry = Pick<
  AuditLogEntry,
  | 'id'
  | 'action'
  | 'entityType'
  | 'entityId'
  | 'userId'
  | 'ipAddress'
  | 'userAgent'
  | 'oldValue'
  | 'newValue'
  | 'createdAt'
>;

// Props del componente de tabla de audit logs
interface AuditLogsTableProps {
  entries?: BaseAuditEntry[];
  isLoading: boolean;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNext: () => void;
  onPrev: () => void;
}

const ACTION_FILTER_OPTIONS = [
  { value: '', label: 'Todas las acciones' },
  { value: 'CREATE', label: 'CREATE' },
  { value: 'UPDATE', label: 'UPDATE' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'LOGIN', label: 'LOGIN' },
  { value: 'LOGOUT', label: 'LOGOUT' },
];

// Campos esenciales para mostrar en auditoría resumida
const ESSENTIAL_FIELDS = [
  'name',
  'status',
  'contactEmail',
  'legalName',
  'nit',
  'phone',
  'address',
  'city',
  'department',
  'countryCode',
  'website',
  'role',
  'email',
  'firstName',
  'lastName',
  'jobTitle',
  'mfaEnabled',
  'passwordResetRequired',
  'maxSubscribers',
  'companyType',
  'currency',
  'language',
  'timezone',
  'country',
];

// Trunca un string a un máximo de caracteres y agrega puntos suspensivos si supera el límite
function truncate(value: unknown, maxLength: number = 50): string {
  if (value === null || value === undefined) return '—';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return str.length > maxLength ? `${str.slice(0, maxLength)}...` : str;
}

// Determina el estilo del badge según la acción registrada
function actionBadgeClass(action: string): string {
  switch (action) {
    case 'CREATE':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'UPDATE':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'DELETE':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'LOGIN':
    case 'LOGOUT':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}

// Formatea el nombre del campo para mostrar
function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace('Id', 'ID')
    .trim();
}

// Compara oldValue y newValue y retorna solo los campos que cambiaron
function computeDiff(
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
): Array<{ field: string; old: unknown; new: unknown }> {
  if (!oldValue && !newValue) return [];
  if (!oldValue) {
    return Object.entries(newValue ?? {}).map(([field, val]) => ({
      field,
      old: '—',
      new: val,
    }));
  }
  if (!newValue) {
    return Object.entries(oldValue).map(([field, val]) => ({
      field,
      old: val,
      new: '—',
    }));
  }

  const diffs: Array<{ field: string; old: unknown; new: unknown }> = [];
  const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

  for (const key of allKeys) {
    const oldVal = oldValue[key];
    const newVal = newValue[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({ field: key, old: oldVal, new: newVal });
    }
  }

  return diffs.sort((a, b) => a.field.localeCompare(b.field));
}

// Renderiza un valor de manera legible
function renderValue(val: unknown): React.ReactNode {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  if (typeof val === 'object') {
    const str = JSON.stringify(val);
    return truncate(str, 80);
  }
  return String(val);
}

export function AuditLogsTable({
  entries = [],
  isLoading,
  hasNextPage,
  hasPrevPage,
  onNext,
  onPrev,
}: AuditLogsTableProps) {
  // Estado de los filtros client-side
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ID de la fila actualmente expandida para mostrar oldValue/newValue
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Calcula los entries filtrados según los criterios activos
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Filtro por tipo de acción
      if (actionFilter && entry.action !== actionFilter) return false;

      // Filtro por fecha desde
      if (dateFrom && new Date(entry.createdAt) < new Date(dateFrom)) return false;

      // Filtro por fecha hasta (inclusive hasta las 23:59:59 del día seleccionado)
      if (dateTo && new Date(entry.createdAt) > new Date(dateTo + 'T23:59:59')) return false;

      return true;
    });
  }, [entries, actionFilter, dateFrom, dateTo]);

  // Alterna la fila expandida al hacer click en una fila de datos
  function handleRowClick(id: string) {
    setExpandedRowId((prev) => (prev === id ? null : id));
  }

  // Exporta los entries filtrados visibles como archivo CSV
  function handleExportCsv() {
    const headers = ['Fecha', 'Acción', 'Entidad', 'ID Entidad', 'Usuario', 'IP'];
    const rows = filteredEntries.map((e) =>
      [
        new Date(e.createdAt).toLocaleString('es-CO'),
        e.action,
        e.entityType,
        e.entityId ?? '',
        e.userId ?? '',
        e.ipAddress ?? '',
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
    // Diferir la revocación para dar tiempo al navegador de iniciar la descarga (Firefox/Safari)
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-dark-surface-2">
      {/* Barra de filtros y acciones */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-800">
        {/* Filtro por acción */}
        <div className="w-full sm:w-[220px]">
          <Select
            id="audit-action-filter"
            options={ACTION_FILTER_OPTIONS}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            title="Filtrar por acción"
          />
        </div>

        {/* Filtro por fecha desde */}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="Fecha desde"
          title="Fecha desde"
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-dark-surface-3 dark:text-gray-300 focus:outline-none"
        />

        {/* Filtro por fecha hasta */}
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="Fecha hasta"
          title="Fecha hasta"
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-dark-surface-3 dark:text-gray-300 focus:outline-none"
        />

        {/* Botón exportar CSV — utiliza los entries filtrados actuales */}
        <button
          type="button"
          onClick={handleExportCsv}
          className="ml-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface-3 dark:text-gray-300 dark:hover:bg-dark-surface-4 transition-colors"
        >
          Exportar CSV
        </button>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-dark-surface-3">
          <tr>
            <th className="px-3 py-2 text-left">Fecha</th>
            <th className="px-3 py-2 text-left">Acción</th>
            <th className="px-3 py-2 text-left">Entidad</th>
            <th className="px-3 py-2 text-left">ID Entidad</th>
            <th className="px-3 py-2 text-left">Usuario</th>
            <th className="px-3 py-2 text-left">IP</th>
          </tr>
        </thead>

        <tbody>
          {isLoading ? (
            // Estado de carga — filas skeleton animadas
            Array.from({ length: 5 }).map((_, index) => (
              <tr key={index} className="border-t border-gray-100 dark:border-dark-border">
                {Array.from({ length: 6 }).map((__, colIndex) => (
                  <td key={colIndex} className="px-3 py-3">
                    <div className="animate-pulse bg-gray-200 rounded h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))
          ) : filteredEntries.length === 0 ? (
            // Estado vacío — sin registros para mostrar
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                Sin registros de auditoría
              </td>
            </tr>
          ) : (
            // Filas de datos de audit logs con soporte para expand row
            filteredEntries.map((entry) => (
              <React.Fragment key={entry.id}>
                {/* Fila principal — click/teclado alterna el panel expandido (WCAG 2.1.1) */}
                <tr
                  onClick={() => handleRowClick(entry.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpandedRowId((prev) => (prev === entry.id ? null : entry.id));
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className="border-t border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  {/* Fecha formateada en locale colombiano */}
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                    {new Date(entry.createdAt).toLocaleString('es-CO')}
                  </td>

                  {/* Badge de acción con color semántico */}
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${actionBadgeClass(entry.action)}`}
                    >
                      {entry.action}
                    </span>
                  </td>

                  {/* Tipo de entidad afectada */}
                  <td className="px-3 py-2 font-medium">{entry.entityType}</td>

                  {/* ID de la entidad truncado a 12 caracteres */}
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">
                    {truncate(entry.entityId, 12)}
                  </td>

                  {/* ID del usuario que ejecutó la acción o "Sistema" si es automático */}
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">
                    {entry.userId ? truncate(entry.userId, 12) : 'Sistema'}
                  </td>

                  {/* Dirección IP del cliente */}
                  <td className="px-3 py-2 text-xs text-gray-500">{entry.ipAddress ?? '—'}</td>
                </tr>

                {/* Panel expandido con diff de oldValue y newValue */}
                {expandedRowId === entry.id && (
                  <tr key={`${entry.id}-expanded`}>
                    <td
                      colSpan={6}
                      className="bg-gray-50 dark:bg-white/[0.03] px-6 py-4 border-t border-gray-100 dark:border-dark-border"
                    >
                      {entry.action === 'UPDATE' ? (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-3">
                            CAMBIOS REALIZADOS (
                            {computeDiff(entry.oldValue ?? null, entry.newValue ?? null).length}{' '}
                            campo(s) modificado(s))
                          </p>
                          <div className="space-y-2">
                            {computeDiff(entry.oldValue ?? null, entry.newValue ?? null).map(
                              ({ field, old: oldVal, new: newVal }) => (
                                <div
                                  key={field}
                                  className="flex items-center gap-3 text-xs bg-white dark:bg-dark-surface-2 rounded-lg p-3"
                                >
                                  <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[140px]">
                                    {formatFieldName(field)}
                                  </span>
                                  <span className="text-red-600 dark:text-red-400 line-through max-w-[200px] truncate">
                                    {renderValue(oldVal)}
                                  </span>
                                  <span className="text-gray-400">→</span>
                                  <span className="text-green-600 dark:text-green-400 max-w-[200px] truncate">
                                    {renderValue(newVal)}
                                  </span>
                                </div>
                              ),
                            )}
                            {computeDiff(entry.oldValue ?? null, entry.newValue ?? null).length ===
                              0 && (
                              <p className="text-xs text-gray-500 italic">Sin cambios detectados</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-2">
                              VALOR ANTERIOR
                            </p>
                            <div className="bg-white dark:bg-dark-surface-2 rounded p-3 overflow-x-auto text-xs">
                              {entry.oldValue ? (
                                <div className="space-y-1">
                                  {Object.entries(entry.oldValue)
                                    .filter(([key]) => ESSENTIAL_FIELDS.includes(key))
                                    .map(([key, val]) => (
                                      <div key={key} className="flex gap-2">
                                        <span className="font-medium text-gray-600 dark:text-gray-400">
                                          {formatFieldName(key)}:
                                        </span>
                                        <span className="text-gray-800 dark:text-gray-200">
                                          {renderValue(val)}
                                        </span>
                                      </div>
                                    ))}
                                  {Object.keys(entry.oldValue).filter((k) =>
                                    ESSENTIAL_FIELDS.includes(k),
                                  ).length === 0 && (
                                    <pre className="text-gray-600 dark:text-gray-400">
                                      {JSON.stringify(entry.oldValue, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-2">VALOR NUEVO</p>
                            <div className="bg-white dark:bg-dark-surface-2 rounded p-3 overflow-x-auto text-xs">
                              {entry.newValue ? (
                                <div className="space-y-1">
                                  {Object.entries(entry.newValue)
                                    .filter(([key]) => ESSENTIAL_FIELDS.includes(key))
                                    .map(([key, val]) => (
                                      <div key={key} className="flex gap-2">
                                        <span className="font-medium text-gray-600 dark:text-gray-400">
                                          {formatFieldName(key)}:
                                        </span>
                                        <span className="text-gray-800 dark:text-gray-200">
                                          {renderValue(val)}
                                        </span>
                                      </div>
                                    ))}
                                  {Object.keys(entry.newValue).filter((k) =>
                                    ESSENTIAL_FIELDS.includes(k),
                                  ).length === 0 && (
                                    <pre className="text-gray-600 dark:text-gray-400">
                                      {JSON.stringify(entry.newValue, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))
          )}
        </tbody>
      </table>

      {/* Controles de paginación cursor-based */}
      <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-2 dark:border-dark-border">
        <p className="text-xs text-gray-500">
          {isLoading ? 'Cargando...' : `${filteredEntries.length} registro(s) en esta página`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onPrev}
            disabled={!hasPrevPage || isLoading}
          >
            Anterior
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onNext}
            disabled={!hasNextPage || isLoading}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
