'use client';

import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from '@iwana/ui';
import {
  ApiError,
  commercialApi,
  type SimulateTaxDto,
  type TaxApplicationSnapshot,
} from '@/lib/api-client';

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
      // El endpoint simulate devuelve { applications, winnerRuleId, reason } — extraemos applications
      const snapshotsRaw = data as unknown as
        | { applications?: TaxApplicationSnapshot[] }
        | TaxApplicationSnapshot[];
      const snapshots = Array.isArray(snapshotsRaw)
        ? snapshotsRaw
        : ((snapshotsRaw as { applications?: TaxApplicationSnapshot[] }).applications ?? []);
      setResults(snapshots);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al ejecutar simulación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-dark-text-primary">
          Simulador tributario
        </h3>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-dark-text-secondary">
          Calcula los impuestos aplicables dado un segmento de cliente y muestra la regla ganadora.
        </p>
      </div>

      {/* Formulario de simulación */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Parámetros de simulación</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700 dark:text-dark-text-secondary">
                Segmento
              </label>
              <Select
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
              <label className="text-xs font-medium text-gray-700 dark:text-dark-text-secondary">
                Estrato (opcional)
              </label>
              <Input
                type="number"
                min={1}
                max={6}
                placeholder="1 – 6"
                value={stratum}
                onChange={(e) => setStratum(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700 dark:text-dark-text-secondary">
                Código municipio (opcional)
              </label>
              <Input
                placeholder="ej: 11001"
                value={municipalityCode}
                onChange={(e) => setMunicipalityCode(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void handleSimulate()} disabled={loading} className="gap-2">
              <FlaskConical className="h-4 w-4" />
              {loading ? 'Simulando…' : 'Simular'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mensaje de error */}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {/* Resultados */}
      {results !== null && (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary">
            Resultado de simulación — segmento {SEGMENT_LABELS[segment] ?? segment}
            {stratum ? ` · estrato ${stratum}` : ''}
          </h4>

          {results.length === 0 ? (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              No se encontraron aplicaciones tributarias para los parámetros dados. Verifica las
              reglas de aplicación configuradas.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {results.map((snap, i) => (
                <Card
                  key={snap.taxDefinitionId}
                  className={`border ${i === 0 ? 'border-iwana-secondary-700/30 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-100 dark:border-dark-border'}`}
                >
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {i === 0 && (
                          <Badge className="bg-iwana-secondary-700 text-white text-xs">
                            Regla ganadora
                          </Badge>
                        )}
                        <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                          Definición: {snap.taxDefinitionId}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span>
                          Tratamiento:{' '}
                          <strong>{TREATMENT_LABELS[snap.treatment] ?? snap.treatment}</strong>
                        </span>
                        {snap.effectiveRate !== null && (
                          <>
                            <span>·</span>
                            <span>
                              Tasa efectiva: <strong>{snap.effectiveRate}%</strong>
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span>Regla ID: {snap.ruleId}</span>
                        <span>·</span>
                        <span>Prioridad: {snap.priorityMatched}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
