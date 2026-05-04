'use client';

import { useState } from 'react';
import { CheckCircle2, CircleAlert, MapPinned } from 'lucide-react';
import { Button, Input } from '@iwana/ui';
import type { CoverageCheckResponse } from '@/lib/api-client';

interface CoverageCheckSectionProps {
  canEdit: boolean;
  onCheck: (params: {
    address: string;
    latitude?: number;
    longitude?: number;
  }) => Promise<CoverageCheckResponse>;
}

export function CoverageCheckSection({ canEdit, onCheck }: CoverageCheckSectionProps) {
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CoverageCheckResponse | null>(null);

  const handleCheck = async () => {
    if (!address.trim()) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const parsedLat = latitude.trim() ? Number(latitude) : undefined;
      const parsedLng = longitude.trim() ? Number(longitude) : undefined;
      const payload: { address: string; latitude?: number; longitude?: number } = {
        address: address.trim(),
      };

      if (typeof parsedLat === 'number' && Number.isFinite(parsedLat)) {
        payload.latitude = parsedLat;
      }

      if (typeof parsedLng === 'number' && Number.isFinite(parsedLng)) {
        payload.longitude = parsedLng;
      }

      const nextResult = await onCheck(payload);

      setResult(nextResult);
    } catch {
      setError('No fue posible validar cobertura para la ubicacion ingresada.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="space-y-4" data-testid="coverage-check-section">
      <div className="rounded-2xl border border-gray-100 bg-[#f8faf5] p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
            <MapPinned className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Factibilidad inicial
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Usa dirección y coordenadas opcionales para una validación comercial rápida antes del
              flujo técnico detallado.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
        <Input
          id="coverage-address"
          label="Direccion a validar"
          placeholder="Calle 123 #45-67, Bogota"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <Input
          id="coverage-latitude"
          label="Latitud"
          type="number"
          step="0.000001"
          placeholder="4.6097"
          value={latitude}
          onChange={(event) => setLatitude(event.target.value)}
        />
        <Input
          id="coverage-longitude"
          label="Longitud"
          type="number"
          step="0.000001"
          placeholder="-74.0817"
          value={longitude}
          onChange={(event) => setLongitude(event.target.value)}
        />
        <div className="flex items-end">
          <Button
            type="button"
            disabled={!canEdit || isLoading}
            loading={isLoading}
            onClick={() => void handleCheck()}
          >
            Validar
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 dark:text-white">
                {result.available ? 'Cobertura disponible' : 'Cobertura no disponible'}
              </p>
              <p className="mt-1 text-gray-600 dark:text-gray-300">{result.reason}</p>

              {result.matches.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-gray-600 dark:text-gray-300">
                  {result.matches.map((match) => (
                    <li key={match.id}>
                      {match.type}: {match.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
