'use client';

import { useState } from 'react';
import { Button, Input } from '@iwana/ui';
import type { CoverageCheckResponse } from '@/lib/api-client';

interface CoverageCheckSectionProps {
  canEdit: boolean;
  onCheck: (params: { address: string; latitude?: number; longitude?: number }) => Promise<CoverageCheckResponse>;
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
          <Button type="button" disabled={!canEdit || isLoading} loading={isLoading} onClick={() => void handleCheck()}>
            Validar
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3">
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
      )}
    </section>
  );
}
