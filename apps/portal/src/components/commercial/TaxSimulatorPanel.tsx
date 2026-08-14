'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, FlaskConical } from 'lucide-react';
import { Badge, Button, Input, Select, cn } from '@iwana/ui';
import {
  ApiError,
  COMMERCIAL_PICKER_LIMIT,
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
  portalFieldClassName,
  portalSelectTriggerClassName,
} from '@/components/shared/portal-ui';
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
  const [definitionsError, setDefinitionsError] = useState<string | null>(null);
  const [definitionsReloadToken, setDefinitionsReloadToken] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TaxApplicationSnapshot[] | null>(null);
  const [hasSimulated, setHasSimulated] = useState(false);

  const loadDefinitions = useCallback(async () => {
    setDefinitionsError(null);
    try {
      const result = await commercialApi.listTaxDefinitions({
        isActive: true,
        limit: COMMERCIAL_PICKER_LIMIT,
      });
      setDefinitions(result.data);
    } catch (err) {
      setDefinitions([]);
      setDefinitionsError(
        err instanceof ApiError
          ? err.message
          : 'No fue posible cargar las definiciones tributarias.',
      );
    }
  }, []);

  useEffect(() => {
    void loadDefinitions();
  }, [loadDefinitions, definitionsReloadToken]);

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
              className={portalSelectTriggerClassName}
            >
              <option value="RESIDENTIAL">Residencial</option>
              <option value="SOHO">SOHO (oficina pequeña)</option>
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
              className={portalFieldClassName}
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
              className={portalFieldClassName}
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

      {definitionsError && (
        <PortalAlert
          variant="warning"
          title="Definiciones tributarias no disponibles"
          description={definitionsError}
          icon={CircleAlert}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDefinitionsReloadToken((current) => current + 1)}
            >
              Reintentar
            </Button>
          }
        />
      )}

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
              description="No hay reglas tributarias para estos parámetros. Revisa las reglas de aplicación configuradas."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {results.map((snap, index) => (
                <div
                  key={`${snap.taxDefinitionId}-${snap.ruleId}-${index}`}
                  className={cn(
                    'rounded-2xl border border-gray-200 px-4 py-3 dark:border-dark-border',
                    index === 0
                      ? 'border-iwana-secondary-700/30 bg-iwana-surface-soft dark:bg-dark-surface-3'
                      : 'bg-white dark:bg-dark-surface-2',
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {resolveDefinitionLabel(snap.taxDefinitionId)}
                    </p>
                    {index === 0 ? (
                      <Badge variant="success" className="text-xs">
                        Regla ganadora
                      </Badge>
                    ) : null}
                  </div>
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
