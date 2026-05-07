'use client';

import { Badge, Button } from '@iwana/ui';
import type { CoverageZoneConfig } from '@/lib/api-client';

interface CoverageZoneTableProps {
  zones: CoverageZoneConfig[];
  canEdit: boolean;
  onEdit: (zone: CoverageZoneConfig) => void;
  onDelete: (zoneId: string) => void;
  onToggle: (zoneId: string, isActive: boolean) => void;
}

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
const cellClass = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';

export function CoverageZoneTable({
  zones,
  canEdit,
  onEdit,
  onDelete,
  onToggle,
}: CoverageZoneTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-dark-border">
      <table className="w-full min-w-[860px] border-collapse" data-testid="coverage-zone-table">
        <thead className="bg-[#f6f8f4] dark:bg-dark-surface-3">
          <tr>
            <th scope="col" className={tableHeadClass}>
              Nombre
            </th>
            <th scope="col" className={tableHeadClass}>
              Lat centro
            </th>
            <th scope="col" className={tableHeadClass}>
              Lng centro
            </th>
            <th scope="col" className={tableHeadClass}>
              Radio (km)
            </th>
            <th scope="col" className={tableHeadClass}>
              Estado
            </th>
            {canEdit && (
              <th scope="col" className={tableHeadClass}>
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {zones.length === 0 && (
            <tr>
              <td
                colSpan={canEdit ? 6 : 5}
                className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                No hay zonas registradas todavia.
              </td>
            </tr>
          )}

          {zones.map((zone) => (
            <tr
              key={zone.id}
              className="border-t border-gray-100 transition-colors hover:bg-[#fbfcf8] dark:border-dark-border dark:hover:bg-dark-surface-3"
            >
              <td className={cellClass}>
                <p className="font-semibold text-gray-900 dark:text-white">{zone.name}</p>
              </td>
              <td className={cellClass}>{zone.centerLatitude.toFixed(6)}</td>
              <td className={cellClass}>{zone.centerLongitude.toFixed(6)}</td>
              <td className={cellClass}>{zone.radiusKm.toFixed(2)}</td>
              <td className={cellClass}>
                <Badge variant={zone.isActive ? 'success' : 'neutral'}>
                  {zone.isActive ? 'Activa' : 'Inactiva'}
                </Badge>
              </td>
              {canEdit && (
                <td className={cellClass}>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={zone.isActive}
                        aria-label={`Cambiar estado de ${zone.name}`}
                        onChange={() => onToggle(zone.id, !zone.isActive)}
                      />
                      Activa
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      data-testid={`zone-edit-btn-${zone.id}`}
                      aria-label={`Editar zona ${zone.name}`}
                      onClick={() => onEdit(zone)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      data-testid={`zone-delete-btn-${zone.id}`}
                      aria-label={`Eliminar zona ${zone.name}`}
                      onClick={() => onDelete(zone.id)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
