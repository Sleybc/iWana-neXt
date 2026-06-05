'use client';

import { Badge, Button } from '@iwana/ui';
import type { CoverageNodeConfig } from '@/lib/api-client';
import { getPortalActiveBadgeVariant } from '@/lib/portal-status-badge-rules';

interface CoverageNodeTableProps {
  nodes: CoverageNodeConfig[];
  canEdit: boolean;
  onEdit: (node: CoverageNodeConfig) => void;
  onDelete: (nodeId: string) => void;
  onToggle: (nodeId: string, isActive: boolean) => void;
}

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
const cellClass = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';

export function CoverageNodeTable({
  nodes,
  canEdit,
  onEdit,
  onDelete,
  onToggle,
}: CoverageNodeTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-dark-border">
      <table className="w-full min-w-[760px] border-collapse" data-testid="coverage-node-table">
        <thead className="bg-[#f6f8f4] dark:bg-dark-surface-3">
          <tr>
            <th scope="col" className={tableHeadClass}>
              Nombre
            </th>
            <th scope="col" className={tableHeadClass}>
              Latitud
            </th>
            <th scope="col" className={tableHeadClass}>
              Longitud
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
          {nodes.length === 0 && (
            <tr>
              <td
                colSpan={canEdit ? 5 : 4}
                className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                No hay nodos registrados todavia.
              </td>
            </tr>
          )}

          {nodes.map((node) => (
            <tr
              key={node.id}
              className="border-t border-gray-100 transition-colors hover:bg-[#fbfcf8] dark:border-dark-border dark:hover:bg-dark-surface-3"
            >
              <td className={cellClass}>
                <p className="font-semibold text-gray-900 dark:text-white">{node.name}</p>
              </td>
              <td className={cellClass}>{node.latitude.toFixed(6)}</td>
              <td className={cellClass}>{node.longitude.toFixed(6)}</td>
              <td className={cellClass}>
                <Badge variant={getPortalActiveBadgeVariant(node.isActive)}>
                  {node.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </td>
              {canEdit && (
                <td className={cellClass}>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={node.isActive}
                        aria-label={`Cambiar estado de ${node.name}`}
                        onChange={() => onToggle(node.id, !node.isActive)}
                      />
                      Activo
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      data-testid={`node-edit-btn-${node.id}`}
                      aria-label={`Editar nodo ${node.name}`}
                      onClick={() => onEdit(node)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      data-testid={`node-delete-btn-${node.id}`}
                      aria-label={`Eliminar nodo ${node.name}`}
                      onClick={() => onDelete(node.id)}
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
