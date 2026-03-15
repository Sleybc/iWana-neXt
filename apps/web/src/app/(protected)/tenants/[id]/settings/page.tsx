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
    <div className="space-y-6">
      <PageHeader title="Configuración de empresa" subtitle={`Tenant: ${id}`} />
      <Card>
        <CardHeader>
          <CardTitle>Parámetros base</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-gray-500">Cargando configuración...</p>}>
            <TenantSettingsForm tenantId={id} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
