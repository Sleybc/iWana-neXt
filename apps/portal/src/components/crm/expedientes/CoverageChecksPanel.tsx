'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@iwana/ui';
import { Loader2, MapPin, MapPinCheck, MapPinX } from 'lucide-react';
import { crmApi, type CoverageCheckRecord, type CreateCoverageCheckDto } from '@/lib/api-client';

const RESULT_OPTIONS = [
  { value: 'VIABLE', label: 'Viable', variant: 'success' as const },
  { value: 'CONDITIONAL', label: 'Condicional', variant: 'warning' as const },
  { value: 'NOT_VISIBLE', label: 'Sin cobertura', variant: 'error' as const },
];

function getResultBadgeVariant(result: string) {
  switch (result) {
    case 'VIABLE':
    case 'VIABLE_COMERCIALMENTE':
      return 'success';
    case 'CONDITIONAL':
    case 'CONDICIONAL':
      return 'warning';
    case 'NOT_VISIBLE':
    case 'NOT_VIABLE':
    case 'SIN_COBERTURA':
      return 'error';
    default:
      return 'neutral';
  }
}

function getResultLabel(result: string) {
  switch (result) {
    case 'VIABLE':
    case 'VIABLE_COMERCIALMENTE':
      return 'Viable';
    case 'CONDITIONAL':
    case 'CONDICIONAL':
      return 'Condicional';
    case 'NOT_VISIBLE':
    case 'NOT_VIABLE':
    case 'SIN_COBERTURA':
      return 'Sin cobertura';
    default:
      return result;
  }
}

function getResultIcon(result: string) {
  switch (result) {
    case 'VIABLE':
    case 'VIABLE_COMERCIALMENTE':
      return MapPinCheck;
    case 'CONDITIONAL':
    case 'CONDICIONAL':
      return MapPin;
    case 'NOT_VISIBLE':
    case 'NOT_VIABLE':
    case 'SIN_COBERTURA':
      return MapPinX;
    default:
      return MapPin;
  }
}

interface CoverageChecksPanelProps {
  expedienteId: string;
}

export function CoverageChecksPanel({ expedienteId }: CoverageChecksPanelProps) {
  const [checks, setChecks] = useState<CoverageCheckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateCoverageCheckDto>({
    latitude: undefined,
    longitude: undefined,
    addressUsed: '',
    result: 'VIABLE',
    technologyAvailable: undefined,
    distanceM: undefined,
  });

  useEffect(() => {
    void loadChecks();
  }, [expedienteId]);

  const loadChecks = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await crmApi.listCoverageChecks(expedienteId);
      setChecks(response.data);
    } catch (err) {
      console.error(err);
      setError('No fue posible cargar las verificaciones de cobertura.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await crmApi.createCoverageCheck(expedienteId, formData);
      await loadChecks();
      setShowForm(false);
      setFormData({
        latitude: undefined,
        longitude: undefined,
        addressUsed: '',
        result: 'VIABLE',
        technologyAvailable: undefined,
        distanceM: undefined,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'No fue posible registrar la verificación.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Verificaciones de cobertura
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Historial de validaciones técnicas de viabilidad
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setShowForm(!showForm)}>
          <MapPin className="mr-2 h-4 w-4" aria-hidden="true" />
          {showForm ? 'Cancelar' : 'Nueva verificación'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nueva verificación de cobertura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                id="addressUsed"
                label="Dirección verificada"
                value={formData.addressUsed}
                onChange={(e) => setFormData({ ...formData, addressUsed: e.target.value })}
                placeholder="Dirección utilizada para la consulta"
                required
              />
              <div>
                <label
                  htmlFor="result"
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  Resultado
                </label>
                <select
                  id="result"
                  value={formData.result}
                  onChange={(e) => setFormData({ ...formData, result: e.target.value })}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                >
                  {RESULT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                id="latitude"
                type="number"
                label="Latitud"
                value={formData.latitude ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    latitude: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="4.7110"
                step="0.0000001"
              />
              <Input
                id="longitude"
                type="number"
                label="Longitud"
                value={formData.longitude ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    longitude: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="-74.0721"
                step="0.0000001"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                id="technologyAvailable"
                label="Tecnología disponible"
                value={formData.technologyAvailable ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, technologyAvailable: e.target.value || undefined })
                }
                placeholder="Fibra, cable,无线"
              />
              <Input
                id="distanceM"
                type="number"
                label="Distancia (metros)"
                value={formData.distanceM ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    distanceM: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="Distancia desde el nodo"
              />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                loading={submitting}
                disabled={!formData.addressUsed || !formData.result}
              >
                Registrar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-iwana-primary" aria-hidden="true" />
        </div>
      ) : checks.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-8 text-center dark:border-dark-border dark:bg-dark-surface-3">
          <MapPin className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No hay verificaciones de cobertura registradas.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {checks.map((check) => {
            const Icon = getResultIcon(check.result);
            return (
              <div
                key={check.id}
                className="rounded-xl border border-gray-200 bg-white px-4 py-4 dark:border-dark-border dark:bg-dark-surface-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg ${
                        check.result === 'VIABLE' || check.result === 'VIABLE_COMERCIALMENTE'
                          ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                          : check.result === 'CONDITIONAL' || check.result === 'CONDICIONAL'
                            ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={getResultBadgeVariant(check.result)}>
                          {getResultLabel(check.result)}
                        </Badge>
                        {check.technologyAvailable && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {check.technologyAvailable}
                          </span>
                        )}
                      </div>
                      {check.addressUsed && (
                        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                          {check.addressUsed}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                        {check.latitude && check.longitude && (
                          <span>
                            Coordenadas: {check.latitude.toFixed(5)}, {check.longitude.toFixed(5)}
                          </span>
                        )}
                        {check.distanceM && <span>Distancia: {check.distanceM}m</span>}
                        <span>
                          {new Date(check.checkedAt).toLocaleString('es-CO', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
