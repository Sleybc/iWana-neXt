'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Input,
  Select,
  SkeletonBlock,
  cn,
  interactiveFocusClassName,
} from '@iwana/ui';
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
type MapState = 'idle' | 'loading' | 'ready' | 'error';

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
  const tileLayerRef = useRef<ReturnType<LeafletModule['tileLayer']> | null>(null);
  const markerRef = useRef<ReturnType<LeafletModule['circleMarker']> | null>(null);
  const mapReadyRef = useRef(false);
  const [mapState, setMapState] = useState<MapState>('idle');
  const [mapAttempt, setMapAttempt] = useState(0);

  const selectedTechnologies = getCandidateTechnologiesFromDraft(draftValues);
  const selectedTechnologySet = new Set(selectedTechnologies);
  const recommendedTechnology = draftValues.availableTechnology?.trim() ?? EMPTY_VALUE;

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

    const removeMap = () => {
      tileLayerRef.current?.off();
      markerRef.current?.remove();
      mapInstanceRef.current?.remove();
      tileLayerRef.current = null;
      markerRef.current = null;
      mapInstanceRef.current = null;
      mapReadyRef.current = false;
    };

    const mountMap = async () => {
      if (!hasCoords) {
        removeMap();
        setMapState('idle');
        return;
      }

      if (!mapContainerRef.current) {
        return;
      }

      if (!mapInstanceRef.current) {
        setMapState('loading');
      }

      try {
        const L = await import('leaflet');

        if (disposed || !mapContainerRef.current) {
          return;
        }

        // Si el contenedor cambia por re-render condicional, recreamos el mapa para evitar referencias colgantes.
        if (
          mapInstanceRef.current &&
          mapInstanceRef.current.getContainer() !== mapContainerRef.current
        ) {
          removeMap();
        }

        if (!mapInstanceRef.current) {
          const map = L.map(mapContainerRef.current, {
            zoomControl: true,
            attributionControl: false,
          });
          const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          });

          tileLayer.on('tileloadstart', () => setMapState('loading'));
          tileLayer.on('load', () => setMapState('ready'));
          tileLayer.on('tileerror', () => setMapState('error'));
          tileLayer.addTo(map);
          mapInstanceRef.current = map;
          tileLayerRef.current = tileLayer;
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

        markerRef.current?.remove();
        markerRef.current = L.circleMarker([latNum, lngNum], {
          radius: 6,
          color: 'var(--color-iwana-secondary-700)',
          fillColor: 'var(--color-iwana-secondary-700)',
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(mapInstanceRef.current);
      } catch {
        if (!disposed) {
          setMapState('error');
        }
      }
    };

    void mountMap();

    return () => {
      disposed = true;
    };
  }, [hasCoords, latNum, lngNum, mapAttempt]);

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
      tileLayerRef.current?.off();
      markerRef.current?.remove();
      mapInstanceRef.current?.remove();
      tileLayerRef.current = null;
      markerRef.current = null;
      mapInstanceRef.current = null;
      mapReadyRef.current = false;
    };
  }, []);

  const retryMap = () => {
    tileLayerRef.current?.off();
    markerRef.current?.remove();
    mapInstanceRef.current?.remove();
    tileLayerRef.current = null;
    markerRef.current = null;
    mapInstanceRef.current = null;
    mapReadyRef.current = false;
    setMapState('loading');
    setMapAttempt((attempt) => attempt + 1);
  };

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
          label="Ubicación técnica (latitud, longitud)"
          helperText="Usa grados decimales separados por coma. Ej.: 4.581430, -74.447581"
          placeholder="Latitud, longitud"
          value={coordinatesValue}
          onChange={(e) => handleCoordinatesChange(e.target.value)}
        />
      </div>

      {/* ── Mapa full-width ──────────────────────────────────────────────── */}
      <div className="flex h-[240px] flex-col overflow-hidden rounded-2xl border border-gray-200 shadow-iwana-soft dark:border-dark-border">
        {hasCoords ? (
          <>
            <div
              className="relative min-h-0 flex-1"
              role="region"
              aria-label="Mapa de ubicación técnica"
              aria-busy={mapState === 'loading'}
            >
              <div ref={mapContainerRef} className="absolute inset-0" />
              {mapState === 'loading' && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/85 p-4 dark:bg-dark-surface-2/90">
                  <SkeletonBlock className="absolute inset-4" />
                  <p
                    className="relative text-sm font-medium text-iwana-primary dark:text-white"
                    role="status"
                  >
                    Cargando el mapa…
                  </p>
                </div>
              )}
              {mapState === 'error' && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 p-4 dark:bg-dark-surface-2/95">
                  <Alert variant="error" className="max-w-sm" icon={<MapPin className="h-4 w-4" />}>
                    <AlertTitle>No pudimos cargar el mapa</AlertTitle>
                    <AlertDescription>
                      Intenta nuevamente para consultar la ubicación técnica.
                    </AlertDescription>
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-3 min-h-11"
                      onClick={retryMap}
                    >
                      Reintentar
                    </Button>
                  </Alert>
                </div>
              )}
            </div>
            <p className="border-t border-gray-200 px-2 py-1 text-[10px] text-gray-500 dark:border-dark-border dark:text-gray-400">
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
          <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-iwana-surface-soft dark:bg-dark-surface-2">
            <MapPin className="h-7 w-7 text-gray-300 dark:text-gray-400" />
            <p className="px-4 text-center text-sm font-medium text-gray-600 dark:text-gray-300">
              {lat !== '' && lng !== '' && !hasCoords
                ? 'La latitud debe estar entre -90 y 90 y la longitud entre -180 y 180.'
                : 'Ingresa latitud y longitud para visualizar la ubicación.'}
            </p>
          </div>
        )}
      </div>

      {/* ── Tecnologías candidatas ───────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="portal-eyebrow">{FIELD_LABELS.candidateTechnologies}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <span>Selecciona las alternativas viables y marca la opción recomendada con</span>
              <Star
                className="inline-block h-3.5 w-3.5 fill-iwana-secondary-700 text-iwana-secondary-700"
                aria-hidden="true"
              />
              <span className="sr-only">estrella</span>
              <span>.</span>
            </p>
          </div>
          <Badge
            variant={selectedTechnologies.length > 0 ? 'lime' : 'neutral'}
            className="h-6 shrink-0 px-2.5 text-xs"
          >
            {selectedTechnologies.length}{' '}
            {selectedTechnologies.length === 1 ? 'opción' : 'opciones'}
          </Badge>
        </div>

        <fieldset className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="sr-only">Opciones de conexión técnica</legend>
          {TECHNOLOGY_OPTION_OPTIONS.map((option) => {
            const isChecked = selectedTechnologySet.has(option.value);
            const isRecommended = isChecked && recommendedTechnology === option.value;

            return (
              <div
                key={option.value}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-2xl border bg-white px-3 py-2.5 transition-colors dark:bg-dark-surface-3',
                  'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-iwana-primary has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-white dark:has-[input:focus-visible]:ring-iwana-primary-300 dark:has-[input:focus-visible]:ring-offset-dark-surface-2',
                  isChecked
                    ? 'border-iwana-secondary-700 shadow-iwana-soft'
                    : 'border-gray-200 dark:border-dark-border',
                )}
              >
                <label
                  htmlFor={`technical-option-${option.value}`}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl"
                >
                  <input
                    id={`technical-option-${option.value}`}
                    type="checkbox"
                    name="candidate-technologies"
                    value={option.value}
                    checked={isChecked}
                    onChange={(event) =>
                      onCandidateTechnologyToggle(option.value, event.target.checked)
                    }
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                      isChecked
                        ? 'bg-iwana-secondary-700 text-white'
                        : 'border-2 border-gray-300 bg-transparent dark:border-gray-500',
                    )}
                    aria-hidden="true"
                  >
                    {isChecked ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                  </span>
                  <span
                    className={cn(
                      'truncate text-sm font-semibold',
                      isChecked
                        ? 'text-iwana-secondary-700 dark:text-iwana-secondary-400'
                        : 'text-gray-800 dark:text-gray-200',
                    )}
                  >
                    {option.label}
                  </span>
                </label>

                {isChecked ? (
                  <button
                    type="button"
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
                      interactiveFocusClassName,
                      isRecommended
                        ? 'bg-iwana-secondary-700 text-white'
                        : 'border border-gray-200 bg-white text-gray-400 hover:border-iwana-secondary-700 hover:text-iwana-secondary-700 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:text-iwana-secondary-400',
                    )}
                    aria-label={
                      isRecommended
                        ? `${option.label}: opción principal recomendada`
                        : `Marcar ${option.label} como opción principal recomendada`
                    }
                    aria-pressed={isRecommended}
                    onClick={() => onChange('availableTechnology', option.value)}
                  >
                    <Star
                      className={cn('h-3.5 w-3.5', isRecommended && 'fill-current')}
                      aria-hidden="true"
                    />
                  </button>
                ) : null}
              </div>
            );
          })}
        </fieldset>
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
          className="portal-eyebrow-muted mb-2 flex items-center gap-1.5"
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
          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-iwana-soft focus:border-iwana-primary focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200"
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
