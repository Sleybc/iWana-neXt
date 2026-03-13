// apps/web/src/components/dashboard/TenantsTable.tsx
import { Badge } from '@iwana/ui';
import { Card, CardHeader, CardTitle, CardContent } from '@iwana/ui';

type TenantStatus = 'ACTIVE' | 'PROVISIONING' | 'PROVISIONING_FAILED' | 'SUSPENDED' | 'INACTIVE';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: string;
}

const statusConfig: Record<
  TenantStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'neutral' }
> = {
  ACTIVE: { label: 'Activo', variant: 'success' },
  PROVISIONING: { label: 'Provisionando', variant: 'warning' },
  PROVISIONING_FAILED: { label: 'Error provisión', variant: 'error' },
  SUSPENDED: { label: 'Suspendido', variant: 'neutral' },
  INACTIVE: { label: 'Inactivo', variant: 'neutral' },
};

const mockTenants: Tenant[] = [
  {
    id: '1',
    name: 'Primera Empresa ISP',
    slug: 'primeraempresa',
    status: 'ACTIVE',
    createdAt: '2026-03-10',
  },
  {
    id: '2',
    name: 'Demo ISP',
    slug: 'demoisp',
    status: 'PROVISIONING_FAILED',
    createdAt: '2026-03-11',
  },
];

/**
 * Tabla de tenants para el dashboard administrativo.
 */
export function TenantsTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenants de la plataforma</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Lista de tenants">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Creado
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mockTenants.map((tenant) => {
                const { label, variant } = statusConfig[tenant.status];
                return (
                  <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-[#17163A]">{tenant.name}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">{tenant.slug}</td>
                    <td className="px-6 py-4">
                      <Badge variant={variant}>{label}</Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{tenant.createdAt}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`/tenants/${tenant.id}`}
                          className="text-xs text-[#6A7A1C] hover:underline"
                        >
                          Ver detalle
                        </a>
                        {tenant.status === 'PROVISIONING_FAILED' && (
                          <button
                            type="button"
                            className="text-xs font-medium text-white bg-[#EF4444] hover:bg-[#DC2626] px-2 py-1 rounded-lg transition-colors"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
