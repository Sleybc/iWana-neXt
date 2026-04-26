import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { TenantSettingsForm } from '@/components/tenants/TenantSettingsForm';

export async function generateStaticParams() {
  // cacheComponents requiere al menos un resultado. El ID real se resuelve en runtime
  // a través de TenantSettingsForm que lee el parámetro vía hook de cliente.
  return [{ id: 'placeholder' }];
}

export default async function TenantSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="space-y-5">
      <PageHeader title="Configuración de empresa" subtitle={`Tenant: ${id}`} />
      <Card className="overflow-hidden border border-gray-100/90 dark:border-dark-border">
        <CardHeader className="px-5 pb-4 pt-5">
          <CardTitle>Parámetros base</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          <Suspense fallback={<p className="text-sm text-gray-500">Cargando configuración...</p>}>
            <div className="max-w-[1180px]">
              <TenantSettingsForm tenantId={id} />
            </div>
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
