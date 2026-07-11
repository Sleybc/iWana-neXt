'use client';

import { useState } from 'react';
import { CircleAlert, FlaskConical } from 'lucide-react';
import { Badge, Button, Input, Select } from '@iwana/ui';
import {
  ApiError,
  commercialApi,
  type SimulateTaxDto,
  type TaxApplicationSnapshot,
} from '@/lib/api-client';
import { PortalAlert, PortalPanel } from '@/components/shared/portal-ui';

const SEGMENT_LABELS: Record<string, string> = {
  RESIDENTIAL: 'Residencial',
  SOHO: 'SOHO',
  PYME: 'PyME',
  CORPORATE: 'Corporativo',
};

const TREATMENT_LABELS: Record<string, string> = {
  STANDARD: 'Estándar',
  EXEMPT: 'Exento',
  EXCLUDED: 'Excluido',
  FIXED: 'Fija',
};

export function TaxSimulatorPanel() {
  const [segment, setSegment] = useState<SimulateTaxDto['segment']>('RESIDENTIAL');
  const [stratum, setStratum] = useState<string>('');
  const [municipalityCode, setMunicipalityCode] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TaxApplicationSnapshot[] | null>(null);

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const dto: SimulateTaxDto = {
        segment,
        ...(stratum ? { stratum: Number(stratum) } : {}),
        ...(municipalityCode ? { municipalityCode } : {}),
      };
      const data = await commercialApi.simulateTax(dto);
      setResults(data.applications);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al ejecutar simulación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PortalPanel title="Parámetros de simulación">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="tax-simulator-segment"
              className="text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              Segmento
            </label>
            <Select
              id="tax-simulator-segment"
              value={segment}
              onChange={(e) => setSegment(e.target.value as SimulateTaxDto['segment'])}
            >
              <option value="RESIDENTIAL">Residencial</option>
              <option value="SOHO">SOHO</option>
              <option value="PYME">PyME</option>
              <option value="CORPORATE">Corporativo</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="tax-simulator-stratum"
              className="text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              Estrato (opcional)
            </label>
            <Input
              id="tax-simulator-stratum"
              type="number"
              min={1}
              max={6}
              placeholder="1 – 6"
              value={stratum}
              onChange={(e) => setStratum(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="tax-simulator-municipality"
              className="text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              Código municipio (opcional)
            </label>
            <Input
              id="tax-simulator-municipality"
              placeholder="ej: 11001"
              value={municipalityCode}
              onChange={(e) => setMunicipalityCode(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={() => void handleSimulate()} disabled={loading} className="gap-2">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            {loading ? 'Simulando…' : 'Simular'}
          </Button>
        </div>
      </PortalPanel>

      {error && (
        <PortalAlert
          variant="error"
          title="No fue posible simular"
          description={error}
          icon={CircleAlert}
        />
      )}

      {results !== null && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Resultado — {SEGMENT_LABELS[segment] ?? segment}
            {stratum ? ` · estrato ${stratum}` : ''}
          </p>

          {results.length === 0 ? (
            <PortalAlert
              variant="warning"
              title="Sin reglas aplicables"
              description="No se encontraron aplicaciones tributarias para los parámetros dados. Verifica las reglas de aplicación configuradas."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {results.map((snap, index) => (
                <PortalPanel
                  key={snap.taxDefinitionId}
                  className={
                    index === 0
                      ? 'border-iwana-secondary-700/30 bg-iwana-surface-soft dark:bg-dark-surface-3'
                      : undefined
                  }
                  title={`Definición ${snap.taxDefinitionId}`}
                  actions={
                    index === 0 ? (
                      <Badge className="bg-iwana-secondary-700 text-xs text-white">
                        Regla ganadora
                      </Badge>
                    ) : undefined
                  }
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      Tratamiento:{' '}
                      <strong className="text-gray-700 dark:text-gray-200">
                        {TREATMENT_LABELS[snap.treatment] ?? snap.treatment}
                      </strong>
                    </span>
                    {snap.effectiveRate !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          Tasa efectiva:{' '}
                          <strong className="text-gray-700 dark:text-gray-200">
                            {snap.effectiveRate}%
                          </strong>
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>Regla ID: {snap.ruleId}</span>
                    <span aria-hidden="true">·</span>
                    <span>Prioridad: {snap.priorityMatched}</span>
                  </div>
                </PortalPanel>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
