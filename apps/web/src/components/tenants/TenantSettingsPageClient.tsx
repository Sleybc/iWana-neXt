'use client';

import { Suspense, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { tenantApi } from '@/lib/api-client';
import { TenantSettingsForm } from './TenantSettingsForm';

interface TenantSettingsPageClientProps {
  tenantId: string;
}

export function TenantSettingsPageClient({ tenantId }: TenantSettingsPageClientProps) {
  const [tenantName, setTenantName] = useState<string>('');

  useEffect(() => {
    const loadTenantName = async () => {
      try {
        const tenant = await tenantApi.getOne(tenantId);
        setTenantName(tenant.name);
      } catch {
        setTenantName('');
      }
    };

    void loadTenantName();
  }, [tenantId]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Configuración de empresa"
        subtitle={tenantName ? `Empresa: ${tenantName}` : 'Empresa'}
      />

      <Card className="overflow-hidden border border-gray-100/90 dark:border-dark-border">
        <CardHeader className="px-5 pb-4 pt-5">
          <CardTitle>Parámetros base</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          <Suspense fallback={<p className="text-sm text-gray-500">Cargando configuración...</p>}>
            <div className="max-w-[1180px]">
              <TenantSettingsForm tenantId={tenantId} />
            </div>
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
