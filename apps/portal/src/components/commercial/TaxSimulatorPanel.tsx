'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, FlaskConical } from 'lucide-react';
import { Badge, Button, Input, Select, cn } from '@iwana/ui';
import {
  ApiError,
  commercialApi,
  type SimulateTaxDto,
  type TaxApplicationSnapshot,
  type TaxDefinition,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import {
  commercialFieldClassName,
  commercialSelectTriggerClassName,
} from '@/components/commercial/commercial-field-styles';
import {
  TAX_SEGMENT_LABELS,
  TAX_TREATMENT_LABELS,
  resolveTaxLabel,
} from '@/components/commercial/commercial-labels';

export function TaxSimulatorPanel() {
  const [segment, setSegment] = useState<SimulateTaxDto['segment']>('RESIDENTIAL');
  const [stratum, setStratum] = useState<string>('');
  const [municipalityCode, setMunicipalityCode] = useState<string>('');
  const [definitions, setDefinitions] = useState<TaxDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TaxApplicationSnapshot[] | null>(null);
  const [hasSimulated, setHasSimulated] = useState(false);

  useEffect(() => {
    void commercialApi
      .listTaxDefinitions({ isActive: true })
      .then(setDefinitions)
      .catch(() => {
        setDefinitions([]);
      });
  }, []);

  const resolveDefinitionLabel = (taxDefinitionId: string): string => {
    const def = definitions.find((item) => item.id === taxDefinitionId);
    if (!def) {
      return 'Definición tributaria';
    }
    return `${def.name} (${def.code})`;
  };

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    setHasSimulated(true);
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
      <PortalPanel
        eyebrow="Tributación"
        title="Parámetros de simulación"
        description="Evalúa qué reglas tributarias aplican según segmento, estrato y municipio."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tax-simulator-segment" className="portal-eyebrow-muted">
              Segmento
            </label>
            <Select
              id="tax-simulator-segment"
              value={segment}
              onChange={(e) => setSegment(e.target.value as SimulateTaxDto['segment'])}
              className={commercialSelectTriggerClassName}
            >
              <option value="RESIDENTIAL">Residencial</option>
              <option value="SOHO">SOHO</option>
              <option value="PYME">PyME</option>
              <option value="CORPORATE">Corporativo</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tax-simulator-stratum" className="portal-eyebrow-muted">
              Estrato (opcional)
            </label>
            <Input
              id="tax-simulator-stratum"
              type="number"
              min={1}
              max={6}
              placeholder="Ej. 1 – 6"
              value={stratum}
              onChange={(e) => setStratum(e.target.value)}
              className={commercialFieldClassName}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tax-simulator-municipality" className="portal-eyebrow-muted">
              Código municipio (opcional)
            </label>
            <Input
              id="tax-simulator-municipality"
              placeholder="Ej. 11001"
              value={municipalityCode}
              onChange={(e) => setMunicipalityCode(e.target.value)}
              className={commercialFieldClassName}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => void handleSimulate()}
            disabled={loading}
            loading={loading}
            className="gap-2"
          >
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            Simular
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

      {loading && <PortalSkeletonBlock className="h-32" />}

      {!loading && !hasSimulated && (
        <PortalEmptyState
          title="Sin simulación aún"
          description='Configura los parámetros y pulsa "Simular" para ver las reglas aplicables.'
        />
      )}

      {!loading && results !== null && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Resultado — {resolveTaxLabel(TAX_SEGMENT_LABELS, segment)}
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
                  key={`${snap.taxDefinitionId}-${snap.ruleId}-${index}`}
                  className={
                    index === 0
                      ? 'border-iwana-secondary-700/30 bg-iwana-surface-soft dark:bg-dark-surface-3'
                      : undefined
                  }
                  title={resolveDefinitionLabel(snap.taxDefinitionId)}
                  actions={
                    index === 0 ? (
                      <Badge variant="lime" className="text-xs">
                        Regla ganadora
                      </Badge>
                    ) : undefined
                  }
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      Tratamiento:{' '}
                      <strong className="text-gray-700 dark:text-gray-200">
                        {resolveTaxLabel(TAX_TREATMENT_LABELS, snap.treatment)}
                      </strong>
                    </span>
                    {snap.effectiveRate !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          Tasa efectiva:{' '}
                          <strong
                            className={cn(
                              'font-mono tabular-nums text-gray-700 dark:text-gray-200',
                            )}
                          >
                            {snap.effectiveRate}%
                          </strong>
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>
                      Prioridad:{' '}
                      <strong className="font-mono tabular-nums text-gray-700 dark:text-gray-200">
                        {snap.priorityMatched}
                      </strong>
                    </span>
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
