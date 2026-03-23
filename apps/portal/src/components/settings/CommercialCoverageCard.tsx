'use client';

import { useEffect, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@iwana/ui';
import {
  tenantSelfApi,
  type CoverageAdminConfig,
  type CoverageCheckResponse,
} from '@/lib/api-client';

interface CommercialCoverageCardProps {
  canEdit: boolean;
}

export function CommercialCoverageCard({ canEdit }: CommercialCoverageCardProps) {
  const [config, setConfig] = useState<CoverageAdminConfig | null>(null);
  const [checkResult, setCheckResult] = useState<CoverageCheckResponse | null>(null);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadCoverage();
  }, []);

  async function loadCoverage() {
    setLoading(true);
    setError(null);
    try {
      const data = await tenantSelfApi.getCoverage();
      setConfig(data);
    } catch {
      setError('No fue posible cargar la cobertura comercial.');
    } finally {
      setLoading(false);
    }
  }

  async function runCheck() {
    if (!address.trim()) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const data = await tenantSelfApi.checkCoverage({ address: address.trim() });
      setCheckResult(data);
    } catch {
      setError('No fue posible validar cobertura para la dirección ingresada.');
    } finally {
      setSaving(false);
    }
  }

  async function createQuickNode() {
    setSaving(true);
    setError(null);
    try {
      const next = await tenantSelfApi.createCoverageNode({
        name: `Nodo Comercial ${new Date().toLocaleTimeString('es-CO')}`,
        latitude: 4.60971,
        longitude: -74.08175,
        isActive: true,
      });
      setConfig(next);
    } catch {
      setError('No fue posible crear el nodo comercial.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobertura comercial</CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gestiona nodos y zonas para factibilidad comercial inicial sin invadir provisioning.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando cobertura...</p>
        )}
        {!loading && config && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-100 p-3 dark:border-dark-border">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Nodos activos
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {config.nodes.filter((item) => item.isActive).length}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 p-3 dark:border-dark-border">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Zonas activas
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {config.zones.filter((item) => item.isActive).length}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <Input
            id="coverage-address"
            label="Dirección a validar"
            placeholder="Calle 123 #45-67, Bogotá"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <div className="flex items-end">
            <Button type="button" loading={saving} onClick={() => void runCheck()}>
              Validar cobertura
            </Button>
          </div>
        </div>

        {checkResult && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm dark:border-dark-border dark:bg-dark-surface-3">
            <p className="font-semibold text-gray-900 dark:text-white">
              {checkResult.available ? 'Cobertura disponible' : 'Cobertura no disponible'}
            </p>
            <p className="mt-1 text-gray-600 dark:text-gray-300">{checkResult.reason}</p>
          </div>
        )}

        {canEdit && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              loading={saving}
              onClick={() => void createQuickNode()}
            >
              Crear nodo de prueba
            </Button>
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
