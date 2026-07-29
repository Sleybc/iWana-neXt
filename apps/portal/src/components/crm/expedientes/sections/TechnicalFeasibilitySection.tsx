'use client';

import { useEffect, useRef } from 'react';
import { Badge, Card, CardContent, Input, Select, cn } from '@iwana/ui';
import { Check, Info, MapPin, Star } from 'lucide-react';
import {
  EMPTY_VALUE,
  EVALUATION_SOURCE_OPTIONS,
  FIELD_LABELS,
  FIELD_PLACEHOLDERS,
  TECHNICAL_CONFIDENCE_OPTIONS,
  TECHNICAL_VIABILITY_RESULT_OPTIONS,
  TECHNOLOGY_OPTION_OPTIONS,
  getCandidateTechnologiesFromDraft,
} from './constants';
import type { DraftValues } from './types';
import 'leaflet/dist/leaflet.css';

type LeafletModule = typeof import('leaflet');

interface TechnicalFeasibilitySectionProps {
  latitude?: string;
  longitude?: string;
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  onCandidateTechnologyToggle: (technology: string, checked: boolean) => void;
  saving: boolean;
  onSave: () => void;
}

export function TechnicalFeasibilitySection({
  latitude: latitudeProp,
  longitude: longitudeProp,
  draftValues,
  onChange,
  onCandidateTechnologyToggle,
}: TechnicalFeasibilitySectionProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<ReturnType<LeafletModule['map']> | null>(null);
  const markerRef = useRef<ReturnType<LeafletModule['circleMarker']> | null>(null);
  const mapReadyRef = useRef(false);

  const selectedTechnologies = getCandidateTechnologiesFromDraft(draftValues);
  const selectedTechnologySet = new Set(selectedTechnologies);
  const selectedRecommendation =
    draftValues.availableTechnology && selectedTechnologySet.has(draftValues.availableTechnology)
      ? draftValues.availableTechnology
      : EMPTY_VALUE;

  const hasCoverageContext = Boolean(draftValues.coverageResult?.trim());
  const shouldShowCoverageContext =
    draftValues.feasibility === 'VALIDATION_REQUIRED' ||
    draftValues.feasibility === 'NOT_VIABLE' ||
    hasCoverageContext;

  // Coordenadas: primero prop explícita, luego draftValues
  const lat = latitudeProp ?? draftValues.latitude ?? '';
  const lng = longitudeProp ?? draftValues.longitude ?? '';

  // Validación de rango real — lat [-90,90], lng [-180,180]
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const hasCoords =
    lat !== '' &&
    lng !== '' &&
    !isNaN(latNum) &&
    !isNaN(lngNum) &&
    latNum >= -90 &&
    latNum <= 90 &&
    lngNum >= -180 &&
    lngNum <= 180;

  const coordinatesValue =
    lat !== '' || lng !== '' ? `${lat}${lat !== '' ? ', ' : ''}${lng}` : EMPTY_VALUE;

  useEffect(() => {
    let disposed = false;

    const mountMap = async () => {
      if (!hasCoords) {
        markerRef.current?.remove();
        mapInstanceRef.current?.remove();
        markerRef.current = null;
        mapInstanceRef.current = null;
        mapReadyRef.current = false;
        return;
      }

      if (!mapContainerRef.current) {
        return;
      }

      const L = await import('leaflet');

      if (disposed || !mapContainerRef.current) {
        return;
      }

      // Si el contenedor cambia por re-render condicional, recreamos el mapa para evitar referencias colgantes.
      if (
        mapInstanceRef.current &&
        mapInstanceRef.current.getContainer() !== mapContainerRef.current
      ) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        mapReadyRef.current = false;
      }

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = L.map(mapContainerRef.current, {
          zoomControl: true,
          attributionControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(mapInstanceRef.current);
      }

      const targetPosition: [number, number] = [latNum, lngNum];
      if (mapReadyRef.current) {
        mapInstanceRef.current.flyTo(targetPosition, 16, {
          animate: true,
          duration: 0.8,
        });
      } else {
        mapInstanceRef.current.setView(targetPosition, 16);
        mapReadyRef.current = true;
      }

      mapInstanceRef.current.invalidateSize();

      if (markerRef.current) {
        markerRef.current.remove();
      }

      markerRef.current = L.circleMarker([latNum, lngNum], {
        radius: 6,
        color: '#6A7A1C',
        fillColor: '#6A7A1C',
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(mapInstanceRef.current);
    };

    void mountMap();

    return () => {
      disposed = true;
    };
  }, [hasCoords, latNum, lngNum]);

  useEffect(() => {
    if (!hasCoords) {
      return;
    }

    const notifyMapSize = () => {
      mapInstanceRef.current?.invalidateSize();
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && mapContainerRef.current
        ? new ResizeObserver(() => {
            notifyMapSize();
          })
        : null;

    if (resizeObserver && mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    window.addEventListener('resize', notifyMapSize);
    const frameId = window.requestAnimationFrame(() => {
      notifyMapSize();
    });

    return () => {
      window.removeEventListener('resize', notifyMapSize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.cancelAnimationFrame(frameId);
    };
  }, [hasCoords]);

  useEffect(() => {
    return () => {
      markerRef.current?.remove();
      mapInstanceRef.current?.remove();
      markerRef.current = null;
      mapInstanceRef.current = null;
      mapReadyRef.current = false;
    };
  }, []);

  const handleCoordinatesChange = (value: string) => {
    const raw = value.trim();

    if (!raw) {
      onChange('latitude', EMPTY_VALUE);
      onChange('longitude', EMPTY_VALUE);
      return;
    }

    const parts = raw.split(',');

    if (parts.length === 1) {
      onChange('latitude', parts[0]?.trim() ?? EMPTY_VALUE);
      onChange('longitude', EMPTY_VALUE);
      return;
    }

    onChange('latitude', parts[0]?.trim() ?? EMPTY_VALUE);
    onChange('longitude', parts.slice(1).join(',').trim());
  };

  return (
    <div className="space-y-6">
      {/* ── Fila 1: 3 selectores horizontales ──────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Select
          id="technical-feasibility"
          label={FIELD_LABELS.feasibility!}
          value={draftValues.feasibility ?? EMPTY_VALUE}
          onChange={(event) => onChange('feasibility', event.target.value)}
          placeholder="Selecciona resultado"
        >
          {TECHNICAL_VIABILITY_RESULT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select
          id="technical-technicalConfidence"
          label={FIELD_LABELS.technicalConfidence!}
          value={draftValues.technicalConfidence ?? EMPTY_VALUE}
          onChange={(event) => onChange('technicalConfidence', event.target.value)}
          placeholder="Selecciona nivel"
        >
          {TECHNICAL_CONFIDENCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select
          id="technical-evaluationSource"
          label={FIELD_LABELS.evaluationSource!}
          value={draftValues.evaluationSource ?? EMPTY_VALUE}
          onChange={(event) => onChange('evaluationSource', event.target.value)}
          placeholder="Selecciona fuente"
        >
          {EVALUATION_SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {/* ── Fila 2: Coordenadas (input único) ──────────────────────────── */}
      <div className="sm:max-w-md">
        <Input
          id="technical-coordinates"
          type="text"
          label="Coordenadas (Lat, Lng)"
          placeholder="Ej: 4.581430, -74.447581"
          value={coordinatesValue}
          onChange={(e) => handleCoordinatesChange(e.target.value)}
        />
      </div>

      {/* ── Fila 3: Mapa full-width ─────────────────────────────────────── */}
      <div className="overflow-hidden rounded-[20px] border border-gray-100 shadow-[var(--shadow-sm)] dark:border-dark-border h-[240px] flex flex-col">
        {hasCoords ? (
          <>
            <div
              ref={mapContainerRef}
              className="h-full w-full"
              aria-label="Mapa OpenStreetMap de ubicación técnica"
            />
            <p className="border-t border-gray-100 px-2 py-1 text-[10px] text-gray-400 dark:border-dark-border dark:text-gray-500">
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                © OpenStreetMap contributors
              </a>
            </p>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-gray-50 dark:bg-dark-surface-2">
            <MapPin className="h-7 w-7 text-gray-300 dark:text-gray-600" />
            <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
              {lat !== '' && lng !== '' && !hasCoords
                ? 'Coordenadas fuera de rango — lat [-90, 90] / lng [-180, 180]'
                : 'Ingresa coordenadas para visualizar el mapa'}
            </p>
          </div>
        )}
      </div>

      {/* ── Fila 2: Tecnologías candidatas ─────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
              {FIELD_LABELS.candidateTechnologies}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Selecciona las alternativas viables y marca la opción recomendada con{' '}
              <Star className="inline h-3 w-3 text-iwana-secondary" />.
            </p>
          </div>
          {selectedTechnologies.length > 0 && (
            <Badge variant="success" className="h-6 px-2.5 text-[11px]">
              {selectedTechnologies.length}{' '}
              {selectedTechnologies.length === 1 ? 'opción' : 'opciones'}
            </Badge>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TECHNOLOGY_OPTION_OPTIONS.map((option) => {
            const isChecked = selectedTechnologySet.has(option.value);
            const isPrimary = selectedRecommendation === option.value;
            return (
              <Card
                key={option.value}
                className={cn(
                  'cursor-pointer border-2 transition-all duration-150',
                  isChecked
                    ? 'border-iwana-secondary bg-iwana-secondary/5 dark:border-iwana-secondary/50 dark:bg-iwana-secondary/10'
                    : 'border-transparent bg-gray-50/60 hover:bg-gray-100/70 dark:bg-dark-surface-3 dark:hover:bg-dark-surface-4',
                )}
                onClick={() => onCandidateTechnologyToggle(option.value, !isChecked)}
              >
                <CardContent className="flex items-center gap-3 px-4 py-3">
                  {/* Checkbox visual */}
                  <div
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all',
                      isChecked
                        ? 'border-iwana-secondary bg-iwana-secondary text-white'
                        : 'border-gray-300 bg-white dark:border-dark-border dark:bg-dark-surface-2',
                    )}
                  >
                    {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>

                  <p
                    className={cn(
                      'flex-1 truncate text-sm font-semibold',
                      isChecked
                        ? 'text-iwana-secondary-700 dark:text-iwana-secondary'
                        : 'text-gray-600 dark:text-gray-400',
                    )}
                  >
                    {option.label}
                  </p>

                  {/* Botón "marcar como recomendada" */}
                  {isChecked && (
                    <button
                      title={isPrimary ? 'Opción recomendada' : 'Marcar como recomendada'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange('availableTechnology', option.value);
                      }}
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110',
                        isPrimary
                          ? 'bg-iwana-secondary text-white shadow-sm'
                          : 'bg-white text-gray-300 hover:text-iwana-secondary dark:bg-dark-surface-3',
                      )}
                    >
                      <Star className={cn('h-3.5 w-3.5', isPrimary && 'fill-current')} />
                    </button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {selectedTechnologies.length > 1 && !selectedRecommendation && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Selecciona una opción principal dentro de las alternativas marcadas.
          </p>
        )}
      </div>

      {/* ── Contexto de cobertura (condicional) ──────────────────────────── */}
      {shouldShowCoverageContext && (
        <Input
          id="technical-coverageResult"
          label={FIELD_LABELS.coverageResult!}
          value={draftValues.coverageResult ?? EMPTY_VALUE}
          onChange={(event) => onChange('coverageResult', event.target.value)}
          placeholder={FIELD_PLACEHOLDERS.coverageResult}
        />
      )}

      {/* ── Observaciones técnicas ────────────────────────────────────────── */}
      <div>
        <label
          htmlFor="technical-technicalObservations"
          className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500"
        >
          <Info className="h-3 w-3" />
          {FIELD_LABELS.technicalObservations}
        </label>
        <textarea
          id="technical-technicalObservations"
          value={draftValues.technicalObservations ?? EMPTY_VALUE}
          onChange={(event) => onChange('technicalObservations', event.target.value)}
          rows={3}
          placeholder={FIELD_PLACEHOLDERS.technicalObservations}
          className="w-full rounded-[20px] border border-gray-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-[var(--shadow-sm)] focus:border-iwana-primary focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200"
        />
        {(draftValues.feasibility === 'VALIDATION_REQUIRED' ||
          draftValues.feasibility === 'NOT_VIABLE') && (
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Describe brevemente el criterio técnico que justifica el estado seleccionado.
          </p>
        )}
      </div>
    </div>
  );
}
