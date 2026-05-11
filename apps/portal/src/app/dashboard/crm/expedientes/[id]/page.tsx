'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  ProgressMeter,
  Select,
} from '@iwana/ui';
import { ExpedienteSections } from '@/components/crm/expedientes/sections';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck2,
  ChevronDown,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Loader2,
  Phone,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  AdditionalProduct,
  AdditionalService,
  ApiError,
  commercialApi,
  CompletenessResult,
  crmApi,
  ExpedienteActivityItem,
  InternalUser,
  ExpedienteOperationalMetadata,
  ExpedienteRecord,
  OperationalHistoryItem,
  PipelineRecommendation,
  PlanCatalogItem,
  ResponsibilitySnapshot,
  SalesAttributionRecord,
  ExpedienteStatus,
  ExpedienteTimelineChange,
  usersApi,
} from '@/lib/api-client';
import { ExpedienteHeader } from '@/components/crm/expedientes/ExpedienteHeader';
import { ExpedienteConversionBanner } from '@/components/crm/expedientes/ExpedienteConversionBanner';
import { SeguimientoTab } from '@/components/crm/expedientes/SeguimientoTab';

import {
  EXPEDIENTE_STATUS_META,
  getStatusMeta,
  formatAcquisitionChannel,
  formatMunicipio,
} from '@/components/crm/expedientes/expediente-ui';
import { ExpedienteTabsContainer } from '@/components/crm/expedientes/ExpedienteTabsContainer';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  ACQUISITION_CHANNEL_OPTIONS,
  hasPersistedIdentificationData,
  getSectionPayloadFields,
  buildDraftValues,
  getCandidateTechnologiesFromDraft,
  getMunicipiosByDepartamento,
} from '@/components/crm/expedientes/sections';
import type { SectionId, DraftValues } from '@/components/crm/expedientes/sections';

function getActorLabel(name: string | null | undefined): string {
  return name?.trim() || 'Usuario no disponible';
}

function getCurrentUserDisplayName(
  user:
    | {
        displayName: string;
        firstName: string | null;
        lastName: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!user) {
    return null;
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.displayName || null;
}

const PIPELINE_STATUS_OPTIONS: Array<{
  value: ExpedienteStatus;
  label: string;
}> = [
  {
    value: 'NUEVO_POTENCIAL',
    label: 'Nuevo potencial',
  },
  {
    value: 'PRECALIFICADO',
    label: 'Precalificado',
  },
  {
    value: 'VALIDANDO_COBERTURA',
    label: 'Validando cobertura',
  },
  {
    value: 'EN_COTIZACION',
    label: 'En cotización',
  },
  {
    value: 'LISTO_PARA_INSTALACION',
    label: 'Listo para instalación',
  },
  {
    value: 'INSTALACION_AGENDADA',
    label: 'Instalación agendada',
  },
  {
    value: 'CLIENTE_ACTIVO',
    label: 'Cliente activo',
  },
  {
    value: 'DESCARTADO',
    label: 'Descartado',
  },
];

const PIPELINE_PROGRESS_ORDER: ExpedienteStatus[] = [
  'NUEVO_POTENCIAL',
  'PRECALIFICADO',
  'VALIDANDO_COBERTURA',
  'EN_COTIZACION',
  'LISTO_PARA_INSTALACION',
  'INSTALACION_AGENDADA',
  'CLIENTE_ACTIVO',
  'DESCARTADO',
];

function getSuggestedTransitionTarget(currentStatus: ExpedienteStatus): ExpedienteStatus {
  const currentIndex = PIPELINE_PROGRESS_ORDER.indexOf(currentStatus);
  if (currentIndex === -1 || currentIndex === PIPELINE_PROGRESS_ORDER.length - 1) {
    return currentStatus;
  }

  return PIPELINE_PROGRESS_ORDER[currentIndex + 1]!;
}

export default function ExpedienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const id = params?.id as string;

  const [expediente, setExpediente] = useState<ExpedienteRecord | null>(null);
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);
  const [pipelineRecommendation, setPipelineRecommendation] =
    useState<PipelineRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<DraftValues>({});
  const [savingSection, setSavingSection] = useState<SectionId | null>(null);
  const [timeline, setTimeline] = useState<ExpedienteTimelineChange[]>([]);
  const [recentActivity, setRecentActivity] = useState<ExpedienteActivityItem[]>([]);
  const [operationalMetadata, setOperationalMetadata] =
    useState<ExpedienteOperationalMetadata | null>(null);
  const [transitionTarget, setTransitionTarget] = useState<ExpedienteStatus | ''>('');
  const [transitionReason, setTransitionReason] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionMessageTone, setActionMessageTone] = useState<'success' | 'error' | 'info'>('info');
  const [lockedSections, setLockedSections] = useState<Set<SectionId>>(new Set());
  const [currentAttribution, setCurrentAttribution] = useState<SalesAttributionRecord | null>(null);
  const [attributionHistory, setAttributionHistory] = useState<SalesAttributionRecord[]>([]);
  const [attributionUsers, setAttributionUsers] = useState<InternalUser[]>([]);
  const [loadingAttributionUsers, setLoadingAttributionUsers] = useState(false);
  const [responsibility, setResponsibility] = useState<ResponsibilitySnapshot | null>(null);
  const [responsibilityHistory, setResponsibilityHistory] = useState<OperationalHistoryItem[]>([]);
  const [planCatalog, setPlanCatalog] = useState<PlanCatalogItem[]>([]);
  const [additionalProducts, setAdditionalProducts] = useState<AdditionalProduct[]>([]);
  const [additionalServices, setAdditionalServices] = useState<AdditionalService[]>([]);

  // Controla que el spinner de carga full-page solo se muestre en la carga inicial.
  // Las recargas posteriores (después de guardar) son silenciosas para no resetear el tab activo.
  const initialLoadDone = useRef(false);

  const effectivePersonType = draftValues.personType || null;

  useEffect(() => {
    if (draftValues['department']) {
      const currentDept = draftValues['department'] as string;
      const validMunicipios = getMunicipiosByDepartamento(currentDept);
      const currentMuni = draftValues['municipality'];
      if (currentMuni && !validMunicipios.some((m) => m.value === currentMuni)) {
        setDraftValues((prev) => ({ ...prev, municipality: '' }));
      }
    }
  }, [draftValues['department']]);

  const currentUserDisplayName = getCurrentUserDisplayName(user);
  const lastEditedByLabel =
    operationalMetadata?.lastEditedBy.name?.trim() ||
    currentUserDisplayName ||
    'Usuario no disponible';
  const createdByLabel =
    operationalMetadata?.createdBy.name?.trim() ||
    operationalMetadata?.lastEditedBy.name?.trim() ||
    currentUserDisplayName ||
    'Usuario no disponible';
  const sectionCompleteness = completeness?.sectionCompleteness ?? [];
  const overallProgress = completeness?.overall ?? expediente?.pipelineProgress ?? 0;
  const completedSections = sectionCompleteness.filter(
    (section) => section.percentage >= 100,
  ).length;
  const installationReadiness = completeness?.installationReadiness ?? null;
  const missingRequirements = completeness?.missingRequirements ?? [];

  useEffect(() => {
    if (!id) return;
    void loadExpediente();

    // Carga el catálogo de planes activos para el selector de "Interés del cliente"
    commercialApi
      .getPlans()
      .then((items) => {
        setPlanCatalog(items.filter((p) => p.isActive));
      })
      .catch(() => {
        // Si falla, el selector queda vacío; no es bloqueante
      });

    commercialApi
      .getAdditionalProducts()
      .then((items) => {
        setAdditionalProducts(items.filter((item) => item.isActive));
      })
      .catch(() => {
        // Si falla, el selector queda vacío; no es bloqueante
      });

    commercialApi
      .getAdditionalServices()
      .then((items) => {
        setAdditionalServices(items.filter((item) => item.isActive));
      })
      .catch(() => {
        // Si falla, el selector queda vacío; no es bloqueante
      });
  }, [id]);

  const loadExpediente = async (options?: {
    refreshDraft?: boolean;
    clearActionMessage?: boolean;
  }) => {
    const refreshDraft = options?.refreshDraft ?? true;
    const clearActionMessage = options?.clearActionMessage ?? true;
    const isInitial = !initialLoadDone.current;
    try {
      if (isInitial) setLoading(true);
      const response = await crmApi.getExpediente(id);
      const timelineResponse = await crmApi.getExpedienteTimeline(id);
      const currentAttributionResponse = await crmApi.getAttribution(id);
      const attributionHistoryResponse = await crmApi.getAttributionHistory(id);

      setExpediente(response.data);
      setCompleteness(response.completeness);
      setPipelineRecommendation(response.pipelineRecommendation ?? null);
      if (refreshDraft) {
        setDraftValues((current) => {
          const nextDraft = buildDraftValues(response.data, current);
          setLockedSections((currentLocks) => {
            const nextLocks = new Set(currentLocks);
            if (hasPersistedIdentificationData(nextDraft)) {
              nextLocks.add('identification');
            } else {
              nextLocks.delete('identification');
            }
            return nextLocks;
          });
          return nextDraft;
        });
      }
      setTimeline(timelineResponse.data.changes ?? []);
      setRecentActivity(timelineResponse.data.activities ?? []);
      setOperationalMetadata(
        timelineResponse.data.metadata ?? {
          createdBy: { userId: null, name: null },
          lastEditedBy: { userId: null, name: null },
          lastActivityAt: null,
        },
      );
      setCurrentAttribution(currentAttributionResponse.data);
      setAttributionHistory(attributionHistoryResponse.data ?? []);
      const responsibilityResponse = await crmApi.getResponsibility(id);
      const historyResponse = await crmApi.getResponsibilityHistory(id);
      setResponsibility(responsibilityResponse.data);
      setResponsibilityHistory(historyResponse.data ?? []);
      setTransitionTarget((current) =>
        current && current !== response.data.status
          ? current
          : getSuggestedTransitionTarget(response.data.status),
      );
      setError(null);
      if (clearActionMessage) {
        setActionMessage(null);
      }
    } catch (err) {
      console.error(err);
      setError('No fue posible cargar la oportunidad solicitada.');
    } finally {
      if (isInitial) {
        setLoading(false);
        initialLoadDone.current = true;
      }
    }
  };

  const handleDraftChange = (field: string, value: string) => {
    setDraftValues((current) => ({ ...current, [field]: value }));
  };

  const handleCandidateTechnologyToggle = (technology: string, checked: boolean) => {
    setDraftValues((current) => {
      const currentValues = getCandidateTechnologiesFromDraft(current);
      const nextValues = checked
        ? Array.from(new Set([...currentValues, technology]))
        : currentValues.filter((value) => value !== technology);
      const currentRecommended = current.availableTechnology?.trim() ?? '';

      let nextRecommended = currentRecommended;
      if (!nextValues.includes(nextRecommended)) {
        nextRecommended = nextValues[0] ?? '';
      }

      if (checked && nextValues.length === 1) {
        nextRecommended = technology;
      }

      return {
        ...current,
        candidateTechnologies: nextValues.join(','),
        availableTechnology: nextRecommended,
      };
    });
  };

  const handleSaveSection = async (section: SectionId) => {
    if (section === 'technical_feasibility') {
      const technicalPayload = {
        // Coordenadas se capturan en UI de viabilidad técnica, pero el backend las persiste en sección location.
        latitude: draftValues.latitude?.trim() || null,
        longitude: draftValues.longitude?.trim() || null,
        coverageResult: draftValues.coverageResult?.trim() || null,
        feasibility: draftValues.feasibility?.trim() || null,
        candidateTechnologies: getCandidateTechnologiesFromDraft(draftValues),
        availableTechnology: draftValues.availableTechnology?.trim() || null,
        technicalConfidence: draftValues.technicalConfidence?.trim() || null,
        evaluationSource: draftValues.evaluationSource?.trim() || null,
        technicalObservations: draftValues.technicalObservations?.trim() || null,
      };

      const recommendationIsCandidate =
        !technicalPayload.availableTechnology ||
        technicalPayload.candidateTechnologies.includes(technicalPayload.availableTechnology);

      if (!recommendationIsCandidate) {
        setActionMessageTone('error');
        setActionMessage(
          'La opción principal recomendada debe pertenecer a las alternativas técnicamente viables.',
        );
        return;
      }

      if (technicalPayload.feasibility === 'VIABLE') {
        if (
          technicalPayload.candidateTechnologies.length === 0 ||
          !technicalPayload.availableTechnology ||
          !technicalPayload.technicalConfidence ||
          !technicalPayload.evaluationSource
        ) {
          setActionMessageTone('error');
          setActionMessage(
            'Para Viable debes registrar opciones viables, opción principal recomendada, nivel de certeza y fuente de evaluación.',
          );
          return;
        }
      }

      if (technicalPayload.feasibility === 'VALIDATION_REQUIRED') {
        if (
          technicalPayload.candidateTechnologies.length === 0 ||
          !technicalPayload.technicalConfidence ||
          !technicalPayload.evaluationSource ||
          !technicalPayload.technicalObservations
        ) {
          setActionMessageTone('error');
          setActionMessage(
            'Para Validación técnica requerida debes registrar opciones viables, nivel de certeza, fuente y observación técnica.',
          );
          return;
        }
      }

      if (technicalPayload.feasibility === 'NOT_VIABLE') {
        if (!technicalPayload.evaluationSource || !technicalPayload.technicalObservations) {
          setActionMessageTone('error');
          setActionMessage(
            'Para No viable debes registrar fuente de evaluación y observación técnica.',
          );
          return;
        }
      }

      try {
        setSavingSection(section);
        setActionMessageTone('info');
        setActionMessage(null);

        // Persistimos en ambos endpoints para mantener coherencia UI/API sin perder coordenadas.
        await crmApi.updateExpedienteSection(id, section, technicalPayload);
        await crmApi.updateExpedienteSection(id, 'location', {
          latitude: technicalPayload.latitude,
          longitude: technicalPayload.longitude,
        });

        await loadExpediente();
        setLockedSections((current) => new Set(current).add(section));
        setActionMessageTone('success');
        setActionMessage('Sección actualizada correctamente.');
      } catch (err) {
        console.error(err);
        setActionMessageTone('error');
        setActionMessage(err instanceof Error ? err.message : 'No fue posible guardar la sección.');
      } finally {
        setSavingSection(null);
      }

      return;
    }

    const fieldsToSend = getSectionPayloadFields(section, effectivePersonType);

    const payload = fieldsToSend.reduce<Record<string, unknown>>((accumulator, field) => {
      const value = draftValues[field]?.trim();

      if (field === 'additionalProductIds' || field === 'additionalServiceIds') {
        try {
          const parsed = JSON.parse(value || '[]');
          accumulator[field] = Array.isArray(parsed) ? parsed : [];
        } catch {
          accumulator[field] = [];
        }
        return accumulator;
      }

      if (field === 'altContactName' || field === 'altContactPhone') {
        accumulator[field] = value || null;
        return accumulator;
      }

      if (value) {
        accumulator[field] = value;
      }

      return accumulator;
    }, {});

    try {
      setSavingSection(section);
      setActionMessageTone('info');
      setActionMessage(null);
      await crmApi.updateExpedienteSection(id, section, payload);
      await loadExpediente();
      setLockedSections((current) => new Set(current).add(section));
      setActionMessageTone('success');
      setActionMessage('Sección actualizada correctamente.');
    } catch (err) {
      console.error(err);
      setActionMessageTone('error');
      setActionMessage(err instanceof Error ? err.message : 'No fue posible guardar la sección.');
    } finally {
      setSavingSection(null);
    }
  };

  const handleTransition = async (targetStatus = transitionTarget) => {
    if (!targetStatus) {
      setActionMessageTone('error');
      setActionMessage('Selecciona un estado destino antes de aplicar la transición.');
      return;
    }

    if (expediente && targetStatus === expediente.status) {
      setActionMessageTone('info');
      setActionMessage('Selecciona un estado diferente al actual para avanzar el pipeline.');
      return;
    }

    try {
      setActionMessage(null);

      // No hay secciones con campos requeridos pre-transición que deban auto-persistirse.
      // Billing e instalación ya no son secciones del expediente.

      const response = await crmApi.transitionExpedienteStatus(id, {
        targetStatus,
        ...(transitionReason.trim() ? { reason: transitionReason.trim() } : {}),
      });
      await loadExpediente({ clearActionMessage: false });
      setTransitionReason('');
      if (response.transitionWarning) {
        setActionMessageTone('info');
        setActionMessage(
          `${response.transitionWarning.title}. ${response.transitionWarning.message}`,
        );
      } else {
        setActionMessageTone('success');
        setActionMessage('Transición aplicada correctamente.');
      }
    } catch (err) {
      console.error(err);
      setActionMessageTone('error');
      if (err instanceof ApiError) {
        const missing: string[] = Array.isArray(
          (err as ApiError & { details?: { missingFields?: unknown[] } }).details?.missingFields,
        )
          ? ((err as ApiError & { details?: { missingFields?: string[] } }).details!
              .missingFields ?? [])
          : [];
        if (missing.length > 0) {
          const preview = missing.slice(0, 3).join(', ');
          const extra = missing.length > 3 ? ` y ${missing.length - 3} más` : '';
          setActionMessage(
            `No es posible avanzar al estado seleccionado. Faltantes: ${preview}${extra}.`,
          );
        } else {
          setActionMessage(err.message || 'No fue posible cambiar el estado.');
        }
      } else {
        setActionMessage(err instanceof Error ? err.message : 'No fue posible cambiar el estado.');
      }
    }
  };

  const handleReactivate = async () => {
    try {
      setActionMessage(null);
      await crmApi.reactivateExpediente(id);
      await loadExpediente();
      setActionMessage('Oportunidad reactivada correctamente.');
    } catch (err) {
      console.error(err);
      setActionMessage(
        err instanceof Error ? err.message : 'No fue posible reactivar la oportunidad.',
      );
    }
  };

  const canManageAttribution = new Set(['ADMIN', 'SYSTEM_ADMIN']).has(user?.role ?? '');

  // Usuarios ordenados alfabéticamente para el select sin filtrado.
  const sortedAttributionUsers = [...attributionUsers].sort((left, right) => {
    const leftName = [left.firstName, left.lastName].filter(Boolean).join(' ').trim();
    const rightName = [right.firstName, right.lastName].filter(Boolean).join(' ').trim();
    return leftName.localeCompare(rightName, 'es', { sensitivity: 'base' });
  });

  // Carga usuarios activos una sola vez al activar el panel de atribución.
  // No se envía `search` al backend porque firstName/lastName pueden estar
  // cifrados en BD — ILIKE contra valores cifrados nunca coincide con texto
  // plano. El filtrado se realiza client-side en `filteredAttributionUsers`
  // sobre los nombres ya decodificados que devuelve toDto().
  useEffect(() => {
    if (!canManageAttribution) {
      return;
    }

    let cancelled = false;

    const loadAttributionUsers = async () => {
      try {
        setLoadingAttributionUsers(true);
        const response = await usersApi.list({ status: 'ACTIVE', limit: 100 });

        if (!cancelled) {
          setAttributionUsers(response.data ?? []);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setActionMessage('No fue posible cargar usuarios para atribución.');
        }
      } finally {
        if (!cancelled) {
          setLoadingAttributionUsers(false);
        }
      }
    };

    void loadAttributionUsers();

    return () => {
      cancelled = true;
    };
  }, [canManageAttribution]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="flex items-center gap-3 rounded-[24px] border border-gray-200 bg-white/95 px-5 py-4 text-sm text-gray-600 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95 dark:text-gray-300">
          <Loader2 className="h-6 w-6 animate-spin text-iwana-primary" aria-hidden="true" />
          Estamos preparando la vista operativa de la oportunidad.
        </div>
      </div>
    );
  }

  if (error || !expediente) {
    return (
      <div className="space-y-4 p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 rounded-[24px] border border-red-200 bg-red-50/90 px-4 py-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error || 'Oportunidad no encontrada.'}</span>
            </div>
            <div className="mt-4">
              <Button type="button" variant="secondary" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Volver
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tabVistaGeneral = (
    <div className="space-y-6">
      {actionMessage && (
        <p
          className={`rounded-[20px] px-4 py-3 text-sm shadow-iwana-soft ${
            actionMessageTone === 'error'
              ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300'
              : actionMessageTone === 'success'
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300'
                : 'border border-iwana-primary/15 bg-iwana-primary/5 text-iwana-primary dark:border-iwana-primary-300/20 dark:bg-iwana-primary-400/10 dark:text-iwana-primary-200'
          }`}
        >
          {actionMessage}
        </p>
      )}
      {expediente.dataConsentRevoked && (
        <p className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-iwana-soft dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          El consentimiento de tratamiento de datos fue revocado.
        </p>
      )}
      {installationReadiness && (
        <div
          className={`rounded-[20px] border px-4 py-4 shadow-iwana-soft ${
            installationReadiness.status === 'NOT_READY'
              ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20'
              : installationReadiness.status === 'READY_WITH_PENDING'
                ? 'border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20'
                : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                installationReadiness.status === 'READY_COMPLETE'
                  ? 'text-emerald-600 dark:text-emerald-300'
                  : installationReadiness.status === 'READY_WITH_PENDING'
                    ? 'text-blue-600 dark:text-blue-300'
                    : 'text-amber-600 dark:text-amber-300'
              }`}
              aria-hidden="true"
            />
            <div className="space-y-2">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {installationReadiness.title}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {installationReadiness.message}
                </p>
              </div>
              {missingRequirements.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Pendientes principales
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {missingRequirements.slice(0, 6).map((requirement) => (
                      <span
                        key={`${requirement.sectionKey}-${requirement.fieldKey}`}
                        className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300"
                      >
                        {requirement.sectionLabel}: {requirement.fieldLabel}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Progreso general */}
      <div className="rounded-[20px] border border-gray-50 bg-white p-6 shadow-[var(--shadow-iwana-soft)] dark:border-dark-border dark:bg-dark-surface-2">
        <div className="flex items-center space-x-2 mb-5 text-iwana-primary dark:text-white">
          <LayoutDashboard className="h-5 w-5 text-iwana-secondary-700" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold">Resumen de la oportunidad</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {completedSections}/{sectionCompleteness.length || 7} secciones completas
            </p>
          </div>
        </div>
        <ProgressMeter
          value={overallProgress}
          dimensions={sectionCompleteness.map((section) => ({
            label: section.label,
            value: section.percentage,
          }))}
        />
      </div>
      {/* Informacion del caso */}
      <div className="grid gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-2 xl:grid-cols-6">
        <div>
          <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400">
            Estado actual
          </p>
          <div className="mt-2">
            <Badge variant={getStatusMeta(expediente.status).variant}>
              {getStatusMeta(expediente.status).label}
            </Badge>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400">
            Fuente
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {currentAttribution?.actorName?.trim()
              ? currentAttribution.actorName
              : formatAcquisitionChannel(expediente.acquisitionChannel)}
          </p>
          {currentAttribution?.actorRole ? (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {currentAttribution.actorRole}
            </p>
          ) : expediente.sourceDetail ? (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {expediente.sourceDetail}
            </p>
          ) : null}
          {currentAttribution?.acquisitionChannel && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {formatAcquisitionChannel(currentAttribution.acquisitionChannel)}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400">
            Municipio
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {expediente.municipality ? formatMunicipio(expediente.municipality) : 'Sin municipio'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400">
            Código postal
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {expediente.postalCode?.trim() || 'Sin código postal'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400">
            Estrato
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {expediente.stratum != null ? `Estrato ${expediente.stratum}` : 'Sin estrato'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400">
            Asesor responsable
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {responsibility?.currentResponsibleUserId
              ? (responsibility.currentResponsible?.name ?? 'Usuario asignado')
              : 'Sin asesor asignado'}
          </p>
          {responsibility?.currentResponsible?.role && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {responsibility.currentResponsible.role}
            </p>
          )}
        </div>
      </div>
      {/* Recomendación del pipeline asistido */}
      {pipelineRecommendation?.suggestedStatus && (
        <div className="rounded-[20px] border border-iwana-primary/20 bg-iwana-primary/5 p-4 shadow-iwana-soft dark:border-iwana-primary-300/20 dark:bg-iwana-primary-400/10">
          <div className="flex items-start gap-3">
            <Sparkles
              className="mt-0.5 h-4 w-4 shrink-0 text-iwana-primary dark:text-iwana-primary-200"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-sm font-semibold text-iwana-primary dark:text-iwana-primary-200">
                  Estado sugerido:{' '}
                  <span className="font-bold">
                    {getStatusMeta(pipelineRecommendation.suggestedStatus).label}
                  </span>
                </p>
                {pipelineRecommendation.recommendationReason && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {pipelineRecommendation.recommendationReason}
                  </p>
                )}
              </div>
              {pipelineRecommendation.blockingRequirements.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                    Requerido para avanzar
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {pipelineRecommendation.blockingRequirements.map((req) => (
                      <li
                        key={`${req.sectionKey}-${req.fieldKey}`}
                        className="text-xs text-red-700 dark:text-red-300"
                      >
                        • {req.sectionLabel}: {req.fieldLabel}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pipelineRecommendation.informationalRequirements.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    Recomendado (no bloqueante)
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {pipelineRecommendation.informationalRequirements.map((req) => (
                      <li
                        key={`${req.sectionKey}-${req.fieldKey}`}
                        className="text-xs text-amber-700 dark:text-amber-300"
                      >
                        • {req.sectionLabel}: {req.fieldLabel}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pipelineRecommendation.blockingRequirements.length === 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-1"
                  onClick={() =>
                    handleTransition(pipelineRecommendation.suggestedStatus as ExpedienteStatus)
                  }
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Avanzar a {getStatusMeta(pipelineRecommendation.suggestedStatus).label}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Acciones de pipeline */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-dark-border dark:bg-dark-surface-2">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">
              Acciones de pipeline
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Cambia el estado comercial de forma controlada y registra un motivo cuando aplique.
            </p>
          </div>
          <Badge variant={getStatusMeta(expediente.status).variant} className="w-fit">
            Estado actual: {getStatusMeta(expediente.status).label}
          </Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto_auto] lg:items-end">
          <Select
            id="transition-target"
            label="Nuevo estado"
            value={transitionTarget}
            onChange={(event) => setTransitionTarget(event.target.value as ExpedienteStatus)}
          >
            {PIPELINE_STATUS_OPTIONS.filter((option) => option.value !== expediente.status).map(
              (option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ),
            )}
          </Select>
          <Input
            id="transition-reason"
            label="Motivo (opcional)"
            value={transitionReason}
            onChange={(event) => setTransitionReason(event.target.value)}
            placeholder="Registra contexto de la transición"
          />
          <Button
            type="button"
            onClick={() => handleTransition()}
            disabled={
              transitionTarget === 'LISTO_PARA_INSTALACION' &&
              installationReadiness?.canTransition === false
            }
          >
            Aplicar transición
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleTransition('INSTALACION_AGENDADA')}
          >
            <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
            Cerrar como agendada
          </Button>
        </div>
        {transitionTarget === 'LISTO_PARA_INSTALACION' && installationReadiness && (
          <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {installationReadiness.title}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {installationReadiness.message}
            </p>
          </div>
        )}

        {expediente.status === 'DESCARTADO' && (
          <div className="mt-4 flex justify-start">
            <Button type="button" variant="ghost" onClick={handleReactivate}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reactivar oportunidad
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  const tabSecciones = (
    <ExpedienteSections
      expediente={expediente}
      completeness={completeness}
      draftValues={draftValues}
      onDraftChange={handleDraftChange}
      onSaveSection={handleSaveSection}
      onCandidateTechnologyToggle={handleCandidateTechnologyToggle}
      lockedSections={lockedSections}
      onUnlockIdentification={() => {
        setLockedSections((prev) => {
          const next = new Set(prev);
          next.delete('identification');
          return next;
        });
      }}
      savingSection={savingSection}
      planCatalog={planCatalog}
      additionalProducts={additionalProducts}
      additionalServices={additionalServices}
      actionMessage={actionMessage}
      actionMessageTone={actionMessageTone}
      onDocumentSupportSaved={loadExpediente}
    />
  );

  const tabSeguimiento = (
    <SeguimientoTab
      expedienteId={expediente.id}
      expediente={expediente}
      canManageAttribution={canManageAttribution}
      responsibility={responsibility}
      responsibilityHistory={responsibilityHistory}
      currentAttribution={currentAttribution}
      attributionHistory={attributionHistory}
      sortedAttributionUsers={sortedAttributionUsers}
      loadingAttributionUsers={loadingAttributionUsers}
      planCatalog={planCatalog}
      additionalProducts={additionalProducts}
      recentActivity={recentActivity}
      pipelineChanges={timeline}
      onSaved={loadExpediente}
    />
  );

  return (
    <div className="space-y-6 pb-6">
      <ExpedienteHeader
        fullName={expediente.fullName}
        status={expediente.status}
        overallProgress={overallProgress}
        subtitle={`Oportunidad ${expediente.id.slice(0, 8).toUpperCase()} · Gestión progresiva comercial y operativa.`}
        createdAt={expediente.createdAt}
        createdBy={createdByLabel !== 'Usuario no disponible' ? createdByLabel : null}
        acquisitionChannel={formatAcquisitionChannel(
          currentAttribution?.acquisitionChannel ?? expediente.acquisitionChannel,
        )}
      />
      <ExpedienteConversionBanner
        status={expediente.status}
        subscriberSummary={expediente.subscriberSummary ?? null}
      />
      <ExpedienteTabsContainer
        defaultTab="vista-general"
        tabs={[
          {
            id: 'vista-general',
            label: 'Vista general',
            icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />,
            content: tabVistaGeneral,
          },
          {
            id: 'gestion',
            label: 'Gestión',
            icon: <FileText className="h-4 w-4" aria-hidden="true" />,
            content: tabSecciones,
          },
          {
            id: 'seguimiento',
            label: 'Seguimiento',
            icon: <Phone className="h-4 w-4" aria-hidden="true" />,
            content: tabSeguimiento,
          },
        ]}
      />
    </div>
  );
}
