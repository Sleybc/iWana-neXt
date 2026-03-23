'use client';

import { useEffect, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@iwana/ui';
import { tenantSelfApi, type PlanCatalogItem } from '@/lib/api-client';

interface PlanCatalogCardProps {
  canEdit: boolean;
}

export function PlanCatalogCard({ canEdit }: PlanCatalogCardProps) {
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    void loadPlans();
  }, []);

  async function loadPlans() {
    setLoading(true);
    setError(null);
    try {
      const data = await tenantSelfApi.getPlans();
      setPlans(data);
    } catch {
      setError('No fue posible cargar el catálogo de planes.');
    } finally {
      setLoading(false);
    }
  }

  async function createPlan() {
    if (!name.trim()) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const data = await tenantSelfApi.createPlan({
        name: name.trim(),
        technology: 'FTTH',
        downloadSpeedMbps: 200,
        uploadSpeedMbps: 80,
        basePrice: 129900,
        installationFee: 90000,
        isActive: true,
      });
      setPlans(data);
      setName('');
    } catch {
      setError('No fue posible crear el plan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Planes y valores</CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Administra el catálogo maestro comercial consumido en lectura por CRM.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando catálogo...</p>
        )}

        {!loading && (
          <div className="rounded-xl border border-gray-100 dark:border-dark-border">
            <div className="grid grid-cols-[1.3fr_0.8fr_0.7fr] gap-2 border-b border-gray-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-dark-border dark:text-gray-400">
              <span>Plan</span>
              <span>Tecnología</span>
              <span>Base</span>
            </div>
            <div className="max-h-56 overflow-auto">
              {plans.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1.3fr_0.8fr_0.7fr] gap-2 border-b border-gray-100 px-3 py-2 text-sm last:border-b-0 dark:border-dark-border"
                >
                  <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                  <span className="text-gray-600 dark:text-gray-300">{item.technology}</span>
                  <span className="text-gray-600 dark:text-gray-300">
                    {new Intl.NumberFormat('es-CO', {
                      style: 'currency',
                      currency: 'COP',
                      maximumFractionDigits: 0,
                    }).format(item.basePrice)}
                  </span>
                </div>
              ))}
              {plans.length === 0 && (
                <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                  Aún no hay planes creados.
                </p>
              )}
            </div>
          </div>
        )}

        {canEdit && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
            <Input
              id="plan-name"
              label="Nombre comercial del plan"
              placeholder="Internet Hogar 200"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="flex items-end">
              <Button type="button" loading={saving} onClick={() => void createPlan()}>
                Crear plan
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
