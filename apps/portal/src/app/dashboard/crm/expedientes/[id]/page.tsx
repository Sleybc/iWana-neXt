'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, FormStatus, Input, ProgressMeter, Select } from '@iwana/ui';
import { AccessPermissionKey, PlatformRole, UserRole, formatFullName } from '@iwana/shared';
const ExpedienteSections = dynamic(
  () =>
    import('@/components/crm/expedientes/sections/ExpedienteSections').then(
      (module) => module.ExpedienteSections,
    ),
  {
    ssr: false,
    loading: () => (
      <p role="status" aria-live="polite" className="text-sm text-gray-500">
        Cargando la gestión…
      </p>
    ),
  },
);
const SeguimientoTab = dynamic(
  () =>
    import('@/components/crm/expedientes/SeguimientoTab').then((module) => module.SeguimientoTab),
  {
    ssr: false,
    loading: () => (
      <p role="status" aria-live="polite" className="text-sm text-gray-500">
        Cargando el seguimiento…
      </p>
    ),
  },
);
import {
  ArrowLeft,
  CalendarCheck2,
  ChevronDown,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Phone,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  ApiError,
  CompletenessResult,
  crmApi,
  ExpedienteDetailAttributionSummary,
  ExpedienteDetailBootstrap,
  ExpedienteDetailSummary,
  ExpedienteOperationalMetadata,
  ExpedienteRecord,
  PipelineRecommendation,
  ResponsibilitySnapshot,
  ExpedienteStatus,
} from '@/lib/api-client';
import { ExpedienteHeader } from '@/components/crm/expedientes/ExpedienteHeader';
import { ExpedienteConversionBanner } from '@/components/crm/expedientes/ExpedienteConversionBanner';
import { ConsentsPanel } from '@/components/crm/expedientes/ConsentsPanel';
import {
  EXPEDIENTE_STATUS_META,
  getStatusMeta,
  formatAcquisitionChannel,
} from '@/components/crm/expedientes/expediente-ui';
import { ExpedienteTabsContainer } from '@/components/crm/expedientes/ExpedienteTabsContainer';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePermissions } from '@/components/access-control/permissions-context';
import {
  ACQUISITION_CHANNEL_OPTIONS,
  applyIdentificationDerivedDefaults,
  getIdentificationValidationMessage,
  hasPersistedIdentificationData,
  getSectionPayloadFields,
  buildDraftValues,
  getDirtySections,
  getSectionEditableFields,
  getCandidateTechnologiesFromDraft,
  getMunicipiosByDepartamento,
} from '@/components/crm/expedientes/sections/constants';
import {
  canScheduleInstallation,
  hasMissingOperationalRefsForInstallation,
} from '@/components/crm/expedientes/expediente-scheduling';
import { ExpedienteSchedulingActions } from '@/components/crm/expedientes/ExpedienteSchedulingActions';
import { useCrmInstallationFieldWork } from '@/components/crm/expedientes/useCrmInstallationFieldWork';
import { useCrmVisitRequestAction } from '@/components/crm/expedientes/useCrmVisitRequestAction';
import { getSafeCrmErrorMessage } from '@/components/crm/expedientes/crm-error-message';
import {
  invalidateExpedienteTimelineCache,
  resolveExpedienteCacheScope,
} from '@/components/crm/expedientes/expediente-detail-cache';
import {
  PortalAlert,
  PortalFieldList,
  PortalFieldRow,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import type { SectionId, DraftValues } from '@/components/crm/expedientes/sections/types';
import { getPortalUserRoleLabel } from '@/lib/user-labels';

function getInstallationFieldWorkCtaLabel(
  kind: 'scheduled' | 'in_progress' | 'pending_inbox' | 'none',
): string {
  switch (kind) {
    case 'scheduled':
      return 'Ver la visita agendada';
    case 'in_progress':
      return 'Ver la visita en curso';
    case 'pending_inbox':
      return 'Abrir en pendientes';
    default:
      return 'Coordinar visita de instalación';
  }
}

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

  const fullName = formatFullName(user.firstName, user.lastName).trim();
  return fullName || user.displayName || null;
}

const PIPELINE_STATUS_OPTIONS: Array<{
  value: ExpedienteStatus;
  label: string;
}> = [
  {
    value: 'NUEVO_POTENCIAL',
    label: 'Nuevo',
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
  const { status: permissionsStatus, hasPermission } = usePermissions();
  const canReadPrivacy = hasPermission(AccessPermissionKey.PRIVACY_READ);
  const id = params?.id as string;
  const tenantScope = resolveExpedienteCacheScope(user?.tenantId);
  const [timelineRevision, setTimelineRevision] = useState(0);

  const invalidateTimelineCache = useCallback(() => {
    invalidateExpedienteTimelineCache(tenantScope, id);
  }, [id, tenantScope]);

  const markTimelineMutation = useCallback(() => {
    invalidateTimelineCache();
    setTimelineRevision((current) => current + 1);
  }, [invalidateTimelineCache]);

  const [bootstrapExpediente, setBootstrapExpediente] = useState<ExpedienteDetailSummary | null>(
    null,
  );
  const [detailExpediente, setDetailExpediente] = useState<ExpedienteRecord | null>(null);
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);
  const [pipelineRecommendation, setPipelineRecommendation] =
    useState<PipelineRecommendation | null>(null);
  const [subscriberSummary, setSubscriberSummary] =
    useState<ExpedienteDetailBootstrap['subscriberSummary']>(null);
  const [conversionFailure, setConversionFailure] =
    useState<ExpedienteDetailBootstrap['conversionFailure']>(null);
  const [isRetryingConversion, setIsRetryingConversion] = useState(false);
  const [conversionRetryError, setConversionRetryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<DraftValues>({});
  // Lo que trajo el servidor en la última carga: define qué secciones tienen cambios sin guardar.
  const [savedDraft, setSavedDraft] = useState<DraftValues>({});
  const [savingSection, setSavingSection] = useState<SectionId | null>(null);
  const [operationalMetadata, setOperationalMetadata] =
    useState<ExpedienteOperationalMetadata | null>(null);
  const [transitionTarget, setTransitionTarget] = useState<ExpedienteStatus | ''>('');
  const [transitionReason, setTransitionReason] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionMessageTone, setActionMessageTone] = useState<'success' | 'error' | 'info'>('info');
  const [contactActionAvailable, setContactActionAvailable] = useState(false);
  const [lockedSections, setLockedSections] = useState<Set<SectionId>>(new Set());
  const [currentAttribution, setCurrentAttribution] =
    useState<ExpedienteDetailAttributionSummary | null>(null);
  const [responsibility, setResponsibility] = useState<ResponsibilitySnapshot | null>(null);
  const [tabStatus, setTabStatus] = useState<
    Record<'gestion' | 'seguimiento', 'idle' | 'loading' | 'loaded' | 'error'>
  >({ gestion: 'idle', seguimiento: 'idle' });
  const [tabErrors, setTabErrors] = useState<Record<'gestion' | 'seguimiento', string | null>>({
    gestion: null,
    seguimiento: null,
  });
  const [isPreparingInstallation, setIsPreparingInstallation] = useState(false);
  const {
    error: coordinationError,
    isSubmitting: isCoordinatingInstallation,
    submit: submitVisitRequest,
  } = useCrmVisitRequestAction();
  const {
    fieldWork: installationFieldWork,
    isLoading: isInstallationFieldWorkLoading,
    load: loadInstallationFieldWork,
  } = useCrmInstallationFieldWork(id, false, tenantScope);
  const hasActiveInstallationFieldWork = installationFieldWork.kind !== 'none';

  // Controla que el spinner de carga full-page solo se muestre en la carga inicial.
  // Las recargas posteriores (después de guardar) son silenciosas para no resetear el tab activo.
  const initialLoadDone = useRef(false);
  const bootstrapRequestRef = useRef<Promise<ExpedienteDetailBootstrap> | null>(null);
  const detailRequestRef = useRef<Promise<ExpedienteRecord> | null>(null);
  const detailExpedienteRef = useRef<ExpedienteRecord | null>(null);
  const activeExpedienteIdRef = useRef<string | null>(null);
  const activeExpedienteScopeRef = useRef<string | null>(null);
  const bootstrapDataConsentRevokedRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const tabRequestGenerationRef = useRef<Record<'gestion' | 'seguimiento', number>>({
    gestion: 0,
    seguimiento: 0,
  });

  const expediente = detailExpediente ?? bootstrapExpediente;
  const isPrivacyRestricted = expediente?.privacyRestricted !== false;

  const effectivePersonType = draftValues.personType || null;
  const departmentValue = draftValues['department'];
  const municipalityValue = draftValues['municipality'];

  useEffect(() => {
    if (departmentValue) {
      const currentDept = departmentValue;
      const validMunicipios = getMunicipiosByDepartamento(currentDept);
      if (municipalityValue && !validMunicipios.some((m) => m.value === municipalityValue)) {
        setDraftValues((prev) => ({ ...prev, municipality: '' }));
      }
    }
  }, [departmentValue, municipalityValue]);

  const currentUserDisplayName = getCurrentUserDisplayName(user);
  const canRetryConversion =
    permissionsStatus === 'ready' &&
    (user?.role === UserRole.ADMIN || user?.role === PlatformRole.SYSTEM_ADMIN) &&
    hasPermission(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE);
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
  const overallProgress = completeness?.overall ?? 0;
  const completedSections = sectionCompleteness.filter(
    (section) => section.percentage >= 100,
  ).length;
  const installationReadiness = completeness?.installationReadiness ?? null;
  const missingRequirements = completeness?.missingRequirements ?? [];
  const canCoordinateInstallationVisit =
    expediente &&
    canScheduleInstallation({
      status: expediente.status,
      overallProgress,
      canTransition: installationReadiness?.canTransition ?? false,
    });

  const applyBootstrap = useCallback((bootstrap: ExpedienteDetailBootstrap) => {
    bootstrapDataConsentRevokedRef.current = bootstrap.expediente.dataConsentRevoked;
    setBootstrapExpediente(bootstrap.expediente);
    setCompleteness(bootstrap.completeness);
    setPipelineRecommendation(bootstrap.pipelineRecommendation ?? null);
    setOperationalMetadata(bootstrap.operationalMetadata);
    setCurrentAttribution(bootstrap.currentAttribution);
    setResponsibility(bootstrap.responsibility);
    setSubscriberSummary(bootstrap.subscriberSummary);
    setConversionFailure(bootstrap.conversionFailure);
    setTransitionTarget((current) =>
      current && current !== bootstrap.expediente.status
        ? current
        : getSuggestedTransitionTarget(bootstrap.expediente.status),
    );
  }, []);

  const applyDetailExpediente = useCallback((detail: ExpedienteRecord, refreshDraft = true) => {
    const safeDetail: ExpedienteRecord = {
      ...detail,
      dataConsentRevoked: detail.dataConsentRevoked ?? bootstrapDataConsentRevokedRef.current,
    };
    detailExpedienteRef.current = safeDetail;
    setDetailExpediente(safeDetail);
    if (refreshDraft) {
      setDraftValues((current) => {
        const nextDraft = buildDraftValues(safeDetail, current);
        setSavedDraft(nextDraft);
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
    setTransitionTarget((current) =>
      current && current !== safeDetail.status
        ? current
        : getSuggestedTransitionTarget(safeDetail.status),
    );
  }, []);

  const loadBootstrapRequest = useCallback(
    (force = false): Promise<ExpedienteDetailBootstrap> => {
      if (!force && bootstrapRequestRef.current) {
        return bootstrapRequestRef.current;
      }

      let request: Promise<ExpedienteDetailBootstrap>;
      request = crmApi
        .getExpedienteBootstrap(id)
        .then((response) => response.data)
        .catch((requestError: unknown) => {
          if (bootstrapRequestRef.current === request) {
            bootstrapRequestRef.current = null;
          }
          throw requestError;
        });
      bootstrapRequestRef.current = request;
      return request;
    },
    [id],
  );

  const loadDetailRequest = useCallback(
    (force = false): Promise<ExpedienteRecord> => {
      if (!force && detailExpedienteRef.current) {
        return Promise.resolve(detailExpedienteRef.current);
      }
      if (!force && detailRequestRef.current) {
        return detailRequestRef.current;
      }

      let request: Promise<ExpedienteRecord>;
      request = crmApi
        .getExpediente(id)
        .then((response) => response.data)
        .finally(() => {
          if (detailRequestRef.current === request) {
            detailRequestRef.current = null;
          }
        });
      detailRequestRef.current = request;
      return request;
    },
    [id],
  );

  const invalidateStaleTabState = useCallback((preserveTab?: 'gestion' | 'seguimiento') => {
    setTabStatus((current) => {
      const next = { ...current };
      let changed = false;
      for (const tab of ['gestion', 'seguimiento'] as const) {
        if (tab !== preserveTab && current[tab] === 'loading') {
          next[tab] = 'idle';
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setTabErrors((current) => {
      const next = { ...current };
      if (preserveTab !== 'gestion') next.gestion = null;
      if (preserveTab !== 'seguimiento') next.seguimiento = null;
      return next;
    });
  }, []);

  const loadExpediente = useCallback(
    async (options?: {
      refreshDraft?: boolean;
      clearActionMessage?: boolean;
    }): Promise<boolean> => {
      const refreshDraft = options?.refreshDraft ?? true;
      const clearActionMessage = options?.clearActionMessage ?? true;
      const requestGeneration = ++requestGenerationRef.current;
      invalidateStaleTabState();
      const isCurrentRequest = () =>
        activeExpedienteIdRef.current === id &&
        activeExpedienteScopeRef.current === tenantScope &&
        requestGenerationRef.current === requestGeneration;
      const isInitial = !initialLoadDone.current;
      const hasLoadedDetail = Boolean(detailExpedienteRef.current);

      try {
        if (isInitial) setLoading(true);

        const bootstrapPromise = loadBootstrapRequest(!isInitial);
        const detailPromise = hasLoadedDetail ? loadDetailRequest(true) : null;
        const [bootstrapResult, detailResult] = await Promise.allSettled([
          bootstrapPromise,
          detailPromise ?? Promise.resolve<ExpedienteRecord | null>(null),
        ]);

        if (!isCurrentRequest()) {
          return false;
        }
        if (bootstrapResult.status === 'rejected') {
          throw bootstrapResult.reason;
        }
        if (detailResult.status === 'rejected') {
          throw detailResult.reason;
        }
        applyBootstrap(bootstrapResult.value);
        if (detailPromise && detailResult.value) {
          applyDetailExpediente(detailResult.value, refreshDraft);
        }

        setError(null);
        if (clearActionMessage) {
          setActionMessage(null);
        }
        return true;
      } catch (err) {
        if (!isCurrentRequest()) {
          return false;
        }
        if (isInitial) {
          setError('No fue posible cargar la oportunidad solicitada.');
        } else {
          setActionMessageTone('error');
          setActionMessage('No fue posible actualizar la información de la oportunidad.');
        }
        return false;
      } finally {
        if (isInitial && isCurrentRequest()) {
          setLoading(false);
          initialLoadDone.current = true;
        }
      }
    },
    [
      applyBootstrap,
      applyDetailExpediente,
      id,
      loadBootstrapRequest,
      loadDetailRequest,
      invalidateStaleTabState,
      tenantScope,
    ],
  );

  const handleTabChange = useCallback(
    (tabId: string) => {
      if (tabId !== 'gestion' && tabId !== 'seguimiento') {
        return;
      }

      const lazyTab = tabId as 'gestion' | 'seguimiento';
      if (tabStatus[lazyTab] === 'loaded' || tabStatus[lazyTab] === 'loading') {
        return;
      }
      setTabErrors((current) => ({ ...current, [lazyTab]: null }));
      setTabStatus((current) => ({ ...current, [lazyTab]: 'loading' }));
      const requestGeneration = ++requestGenerationRef.current;
      invalidateStaleTabState(lazyTab);
      tabRequestGenerationRef.current[lazyTab] = requestGeneration;
      const isCurrentTabRequest = () =>
        activeExpedienteIdRef.current === id &&
        activeExpedienteScopeRef.current === tenantScope &&
        requestGenerationRef.current === requestGeneration &&
        tabRequestGenerationRef.current[lazyTab] === requestGeneration;

      if (lazyTab === 'seguimiento') {
        setTabStatus((current) => ({ ...current, seguimiento: 'loaded' }));
        return;
      }

      const request = loadDetailRequest().then((detail) => {
        if (isCurrentTabRequest()) {
          applyDetailExpediente(detail);
        }
      });
      void request
        .then(() => {
          if (!isCurrentTabRequest()) return;
          setTabStatus((current) => ({ ...current, [lazyTab]: 'loaded' }));
        })
        .catch(() => {
          if (!isCurrentTabRequest()) return;
          setTabStatus((current) => ({ ...current, [lazyTab]: 'error' }));
          setTabErrors((current) => ({
            ...current,
            [lazyTab]: 'No fue posible cargar esta sección. Intenta de nuevo.',
          }));
        });
    },
    [applyDetailExpediente, id, invalidateStaleTabState, loadDetailRequest, tabStatus, tenantScope],
  );

  useEffect(() => {
    if (!id) return;

    if (activeExpedienteIdRef.current !== id || activeExpedienteScopeRef.current !== tenantScope) {
      requestGenerationRef.current += 1;
      activeExpedienteIdRef.current = id;
      activeExpedienteScopeRef.current = tenantScope;
      initialLoadDone.current = false;
      bootstrapRequestRef.current = null;
      detailRequestRef.current = null;
      detailExpedienteRef.current = null;
      setBootstrapExpediente(null);
      setDetailExpediente(null);
      setCompleteness(null);
      setPipelineRecommendation(null);
      setSubscriberSummary(null);
      setConversionFailure(null);
      setIsRetryingConversion(false);
      setConversionRetryError(null);
      setOperationalMetadata(null);
      setCurrentAttribution(null);
      setResponsibility(null);
      setDraftValues({});
      setSavedDraft({});
      setLockedSections(new Set());
      setSavingSection(null);
      setTransitionTarget('');
      setTransitionReason('');
      setActionMessage(null);
      setActionMessageTone('info');
      setTabStatus({ gestion: 'idle', seguimiento: 'idle' });
      setTabErrors({ gestion: null, seguimiento: null });
    }

    void loadExpediente();
  }, [id, loadExpediente, tenantScope]);

  useEffect(() => {
    if (!id || !canCoordinateInstallationVisit || detailExpediente) {
      return;
    }

    const requestGeneration = requestGenerationRef.current;
    void loadDetailRequest()
      .then((detail) => {
        if (
          activeExpedienteIdRef.current !== id ||
          requestGenerationRef.current !== requestGeneration
        ) {
          return;
        }
        applyDetailExpediente(detail, false);
      })
      .catch(() => undefined);
  }, [
    applyDetailExpediente,
    canCoordinateInstallationVisit,
    detailExpediente,
    id,
    loadDetailRequest,
  ]);

  const dirtySections = useMemo(
    () => getDirtySections(draftValues, savedDraft),
    [draftValues, savedDraft],
  );

  const handleDiscardSection = (section: SectionId) => {
    const fields = getSectionEditableFields(section);
    setDraftValues((current) => {
      const next = { ...current };
      for (const field of fields) {
        if (field in savedDraft) next[field] = savedDraft[field] ?? '';
        else delete next[field];
      }
      return next;
    });
  };

  const handleDraftChange = (field: string, value: string) => {
    setDraftValues((current) => {
      const nextValues = { ...current, [field]: value };

      if (field === 'personType') {
        return applyIdentificationDerivedDefaults(nextValues);
      }

      return nextValues;
    });
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
        markTimelineMutation();

        if (!(await loadExpediente())) {
          return;
        }
        setLockedSections((current) => new Set(current).add(section));
        setActionMessageTone('success');
        setActionMessage('Sección actualizada correctamente.');
      } catch (err) {
        setActionMessageTone('error');
        setActionMessage(getSafeCrmErrorMessage(err, 'No fue posible guardar la sección.'));
      } finally {
        setSavingSection(null);
      }

      return;
    }

    if (section === 'identification') {
      const validationMessage = getIdentificationValidationMessage(draftValues);

      if (validationMessage) {
        setActionMessageTone('error');
        setActionMessage(validationMessage);
        return;
      }
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

      if (field === 'interestedPlanId') {
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
      markTimelineMutation();
      if (!(await loadExpediente())) {
        return;
      }
      setLockedSections((current) => new Set(current).add(section));
      setActionMessageTone('success');
      setActionMessage('Sección actualizada correctamente.');
    } catch (err) {
      setActionMessageTone('error');
      setActionMessage(getSafeCrmErrorMessage(err, 'No fue posible guardar la sección.'));
    } finally {
      setSavingSection(null);
    }
  };

  const handleCoordinateInstallation = async () => {
    if (
      !expediente ||
      isCoordinatingInstallation ||
      isInstallationFieldWorkLoading ||
      isPreparingInstallation
    ) {
      return;
    }

    if (hasActiveInstallationFieldWork) {
      if (installationFieldWork.href) {
        router.push(installationFieldWork.href);
      }
      return;
    }

    if (!canCoordinateInstallationVisit) {
      return;
    }

    setIsPreparingInstallation(true);
    try {
      const detail = detailExpedienteRef.current ?? (await loadDetailRequest());
      const resolvedFieldWork = await loadInstallationFieldWork();

      if (resolvedFieldWork.kind !== 'none') {
        if (resolvedFieldWork.href) {
          router.push(resolvedFieldWork.href);
        }
        return;
      }

      await submitVisitRequest(
        {
          expedienteId: detail.id,
          customerLabel: detail.fullName,
          municipality: detail.municipality,
          address: detail.address,
          latitude: detail.latitude ?? null,
          longitude: detail.longitude ?? null,
        },
        'schedule-now',
      );
    } catch (err) {
      setActionMessageTone('error');
      setActionMessage(
        getSafeCrmErrorMessage(
          err,
          'No fue posible preparar la información para coordinar la visita.',
        ),
      );
    } finally {
      setIsPreparingInstallation(false);
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
      setActionMessage('Selecciona un estado diferente al actual para avanzar.');
      return;
    }

    try {
      setActionMessage(null);
      setContactActionAvailable(false);

      // No hay secciones con campos requeridos pre-transición que deban auto-persistirse.
      // Billing e instalación ya no son secciones del expediente.

      const response = await crmApi.transitionExpedienteStatus(id, {
        targetStatus,
        ...(transitionReason.trim() ? { reason: transitionReason.trim() } : {}),
      });
      markTimelineMutation();
      if (!(await loadExpediente({ clearActionMessage: false }))) {
        return;
      }
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
      setActionMessageTone('error');
      if (
        targetStatus === 'CLIENTE_ACTIVO' &&
        err instanceof ApiError &&
        err.status === 422 &&
        err.code === 'EXPEDIENTE_SUBSCRIBER_CONTACT_REQUIRED'
      ) {
        setActionMessage(
          'No se puede marcar como cliente activo: el suscriptor no tiene teléfono ni correo registrados.',
        );
        setContactActionAvailable(Boolean(subscriberSummary?.id));
        return;
      }
      if (
        targetStatus === 'LISTO_PARA_INSTALACION' &&
        err instanceof ApiError &&
        err.status === 422 &&
        err.code === 'EXPEDIENTE_DATA_AUTHORIZATION_REQUIRED'
      ) {
        setActionMessage(
          'Para pasar a Listo para instalación, registra la autorización de tratamiento de datos en Consentimientos.',
        );
        return;
      }
      if (err instanceof ApiError) {
        const missing: string[] = Array.isArray(
          (err as ApiError & { details?: { missingFields?: unknown[] } }).details?.missingFields,
        )
          ? ((err as ApiError & { details?: { missingFields?: string[] } }).details!
              .missingFields ?? [])
          : [];

        if (
          targetStatus === 'INSTALACION_AGENDADA' &&
          hasMissingOperationalRefsForInstallation(missing)
        ) {
          void handleCoordinateInstallation();
          return;
        }

        if (missing.length > 0) {
          const preview = missing.slice(0, 3).join(', ');
          const extra = missing.length > 3 ? ` y ${missing.length - 3} más` : '';
          setActionMessage(
            `No es posible avanzar al estado seleccionado. Faltantes: ${preview}${extra}.`,
          );
        } else {
          setActionMessage(getSafeCrmErrorMessage(err, 'No fue posible cambiar el estado.'));
        }
      } else {
        setActionMessage(getSafeCrmErrorMessage(err, 'No fue posible cambiar el estado.'));
      }
    }
  };

  const handleRetryConversion = async () => {
    if (!canRetryConversion || isRetryingConversion) {
      return;
    }

    setIsRetryingConversion(true);
    setConversionRetryError(null);
    let retryFailed = false;
    try {
      await crmApi.retryExpedienteConversion(id);
      markTimelineMutation();
    } catch {
      retryFailed = true;
    }

    const refreshed = await loadExpediente({ clearActionMessage: false });
    if (!refreshed) {
      setConversionRetryError('No fue posible actualizar la información de la oportunidad.');
    } else if (retryFailed) {
      setConversionRetryError('No fue posible reintentar la conversión. Intenta de nuevo.');
    }
    setIsRetryingConversion(false);
  };

  const handleReactivate = async () => {
    try {
      setActionMessage(null);
      await crmApi.reactivateExpediente(id);
      markTimelineMutation();
      if (!(await loadExpediente())) {
        return;
      }
      setActionMessage('Oportunidad reactivada correctamente.');
    } catch (err) {
      setActionMessage(getSafeCrmErrorMessage(err, 'No fue posible reactivar la oportunidad.'));
    }
  };

  const canManageAttribution = new Set(['ADMIN', 'SYSTEM_ADMIN']).has(user?.role ?? '');

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <PortalSkeletonBlock className="h-24 rounded-2xl" />
        <PortalSkeletonBlock className="h-40 rounded-2xl" />
        <PortalSkeletonBlock className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error || !expediente) {
    return (
      <div className="space-y-4">
        <PortalAlert
          variant="error"
          title="No fue posible cargar la oportunidad"
          description={error || 'Oportunidad no encontrada.'}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver
            </Button>
          }
        />
      </div>
    );
  }

  const tabVistaGeneral = (
    <div className="space-y-6">
      {actionMessage && (
        <PortalAlert
          variant={actionMessageTone}
          title={
            actionMessageTone === 'error'
              ? 'No fue posible completar la acción'
              : actionMessageTone === 'success'
                ? 'Acción completada'
                : 'Información de la oportunidad'
          }
          description={actionMessage}
          action={
            contactActionAvailable && subscriberSummary?.id ? (
              <Link
                href={`/dashboard/crm/subscribers/${subscriberSummary.id}`}
                className="inline-flex min-h-11 items-center font-medium text-iwana-secondary-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 dark:text-iwana-secondary-300"
              >
                Abrir ficha del suscriptor
              </Link>
            ) : undefined
          }
        />
      )}
      {coordinationError && (
        <PortalAlert
          variant="error"
          title="No fue posible coordinar la visita"
          description={coordinationError}
        />
      )}
      <FormStatus
        status={expediente.dataConsentRevoked ? 'error' : 'idle'}
        message={
          expediente.dataConsentRevoked
            ? 'El consentimiento de tratamiento de datos fue revocado.'
            : undefined
        }
      />
      {/*
        Vista general como tablero (2026-11-14): a la izquierda lo que hay que hacer (siguiente paso,
        avance por sección, cambio de estado); a la derecha lo que hay que saber (datos del caso y
        autorizaciones). El texto legal completo vive en el registro de la autorización, no aquí.
      */}
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <PortalPanel
            as="section"
            labelled
            id="programacion"
            eyebrow="Acción recomendada ahora"
            title={
              canCoordinateInstallationVisit || hasActiveInstallationFieldWork
                ? hasActiveInstallationFieldWork
                  ? 'Revisa el trabajo de instalación activo.'
                  : 'Coordina la visita de instalación para continuar.'
                : pipelineRecommendation?.suggestedStatus
                  ? `Avanzar a ${getStatusMeta(pipelineRecommendation.suggestedStatus).label}`
                  : 'Revisa el estado comercial para continuar la oportunidad.'
            }
            description={
              canCoordinateInstallationVisit && !hasActiveInstallationFieldWork
                ? 'Crea la solicitud de visita y elige si deseas agendar de una vez o dejarla en pendientes.'
                : (pipelineRecommendation?.recommendationReason ??
                  'Prioriza la siguiente acción operativa antes de continuar con ajustes secundarios.')
            }
            actions={
              pipelineRecommendation?.suggestedStatus ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() =>
                    handleTransition(pipelineRecommendation.suggestedStatus as ExpedienteStatus)
                  }
                  disabled={
                    pipelineRecommendation.suggestedStatus === 'LISTO_PARA_INSTALACION' &&
                    installationReadiness?.canTransition === false
                  }
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Aplicar sugerencia
                </Button>
              ) : undefined
            }
            contentClassName="space-y-4"
          >
            {installationReadiness ? (
              <PortalAlert
                variant={
                  installationReadiness.status === 'NOT_READY'
                    ? 'warning'
                    : installationReadiness.status === 'READY_WITH_PENDING'
                      ? 'info'
                      : 'success'
                }
                title={installationReadiness.title}
                description={installationReadiness.message}
              />
            ) : null}
            {pipelineRecommendation?.blockingRequirements.length ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  Bloqueantes para avanzar: {pipelineRecommendation.blockingRequirements.length}
                </p>
                <ul className="space-y-0.5">
                  {pipelineRecommendation.blockingRequirements.map((requirement) => (
                    <li
                      key={`${requirement.sectionKey}-${requirement.fieldKey}`}
                      className="text-sm text-red-700 dark:text-red-300"
                    >
                      • {requirement.sectionLabel}: {requirement.fieldLabel}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {missingRequirements.length > 0 ? (
              <div className="space-y-2">
                <p className="portal-eyebrow-muted">Pendientes principales</p>
                <div className="flex flex-wrap gap-2">
                  {missingRequirements.slice(0, 6).map((requirement) => (
                    <span
                      key={`${requirement.sectionKey}-${requirement.fieldKey}`}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300"
                    >
                      {requirement.sectionLabel}: {requirement.fieldLabel}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {pipelineRecommendation?.informationalRequirements.length ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Recomendado para cerrar mejor:{' '}
                {pipelineRecommendation.informationalRequirements.length} pendiente(s):{' '}
                {pipelineRecommendation.informationalRequirements
                  .map((requirement) => `${requirement.sectionLabel}: ${requirement.fieldLabel}`)
                  .join(' · ')}
                .
              </p>
            ) : null}
            {(canCoordinateInstallationVisit || hasActiveInstallationFieldWork) &&
            detailExpediente ? (
              <ExpedienteSchedulingActions
                expedienteId={detailExpediente.id}
                tenantScope={tenantScope}
                customerLabel={detailExpediente.fullName}
                municipality={detailExpediente.municipality}
                address={detailExpediente.address}
                sector={detailExpediente.neighborhood ?? null}
                latitude={detailExpediente.latitude ?? null}
                longitude={detailExpediente.longitude ?? null}
              />
            ) : null}
          </PortalPanel>

          <PortalPanel
            as="section"
            labelled
            eyebrow="Avance"
            title="Resumen de la oportunidad"
            description={`${completedSections}/${sectionCompleteness.length || 7} secciones completas`}
          >
            <ProgressMeter
              value={overallProgress}
              dimensions={sectionCompleteness.map((section) => ({
                label: section.label,
                value: section.percentage,
              }))}
            />
          </PortalPanel>

          <PortalPanel
            as="section"
            labelled
            eyebrow="Estado comercial"
            title="Acciones de estado"
            description="Cambia el estado comercial de forma controlada y registra un motivo cuando aplique."
          >
            <div className="grid gap-4 md:grid-cols-2 md:items-end">
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
              {/* Las acciones van en su propia fila: en la columna del tablero no caben junto a los campos. */}
              <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
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
                  onClick={() => void handleCoordinateInstallation()}
                  disabled={
                    isCoordinatingInstallation ||
                    isInstallationFieldWorkLoading ||
                    isPreparingInstallation ||
                    (!hasActiveInstallationFieldWork && !canCoordinateInstallationVisit) ||
                    (hasActiveInstallationFieldWork && !installationFieldWork.href)
                  }
                  loading={
                    isCoordinatingInstallation ||
                    isInstallationFieldWorkLoading ||
                    isPreparingInstallation
                  }
                >
                  <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
                  {getInstallationFieldWorkCtaLabel(installationFieldWork.kind)}
                </Button>
              </div>
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
          </PortalPanel>
        </div>

        <div className="min-w-0 space-y-6">
          <PortalPanel as="section" labelled eyebrow="Caso" title="Datos del caso">
            <PortalFieldList>
              <PortalFieldRow label="Estado actual">
                <Badge variant={getStatusMeta(expediente.status).variant}>
                  {getStatusMeta(expediente.status).label}
                </Badge>
              </PortalFieldRow>
              <PortalFieldRow label="Fuente">
                <span className="block text-right">
                  {currentAttribution?.actorName?.trim()
                    ? currentAttribution.actorName
                    : formatAcquisitionChannel(expediente.acquisitionChannel)}
                  {currentAttribution?.actorRole ? (
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {getPortalUserRoleLabel(currentAttribution.actorRole)}
                    </span>
                  ) : null}
                  {currentAttribution?.acquisitionChannel ? (
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {formatAcquisitionChannel(currentAttribution.acquisitionChannel)}
                    </span>
                  ) : null}
                </span>
              </PortalFieldRow>
              <PortalFieldRow label="Asesor responsable">
                <span className="block text-right">
                  {responsibility?.currentResponsibleUserId
                    ? (responsibility.currentResponsible?.name ?? 'Usuario asignado')
                    : 'Sin asesor asignado'}
                  {responsibility?.currentResponsible?.role ? (
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {getPortalUserRoleLabel(responsibility.currentResponsible.role)}
                    </span>
                  ) : null}
                </span>
              </PortalFieldRow>
              <PortalFieldRow label="Ubicación">
                <span className="block text-right">
                  {bootstrapExpediente?.hasLocation
                    ? 'Ubicación registrada'
                    : 'Sin ubicación registrada'}
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    La dirección exacta se consulta en Gestión.
                  </span>
                </span>
              </PortalFieldRow>
            </PortalFieldList>
          </PortalPanel>

          <ConsentsPanel
            expedienteId={expediente.id}
            subscriberId={subscriberSummary?.id ?? null}
            canReadSubscriberAuthorizations={
              canReadPrivacy && hasPermission(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
            }
          />
        </div>
      </div>
    </div>
  );

  const renderLazyTab = (tabId: 'gestion' | 'seguimiento', content: ReactNode): ReactNode => {
    if (tabStatus[tabId] === 'loading') {
      return (
        <div className="space-y-3" aria-busy="true" role="status" aria-live="polite">
          <PortalSkeletonBlock className="h-10 rounded-xl" />
          <PortalSkeletonBlock className="h-48 rounded-2xl" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cargando información operativa…
          </p>
        </div>
      );
    }

    if (tabStatus[tabId] === 'error') {
      return (
        <PortalAlert
          variant="error"
          title="No fue posible cargar esta sección"
          description={tabErrors[tabId] ?? 'Intenta de nuevo para continuar.'}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleTabChange(tabId)}
            >
              Reintentar
            </Button>
          }
        />
      );
    }

    return content;
  };

  const tabSecciones = detailExpediente ? (
    <ExpedienteSections
      tenantScope={tenantScope}
      expediente={detailExpediente}
      completeness={completeness}
      draftValues={draftValues}
      onDraftChange={handleDraftChange}
      onSaveSection={handleSaveSection}
      dirtySections={dirtySections}
      onDiscardSection={handleDiscardSection}
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
      actionMessage={actionMessage}
      actionMessageTone={actionMessageTone}
      onDocumentSupportSaved={async () => {
        markTimelineMutation();
        await loadExpediente();
      }}
    />
  ) : null;

  const tabSeguimiento = bootstrapExpediente ? (
    <SeguimientoTab
      expedienteId={bootstrapExpediente.id}
      tenantScope={tenantScope}
      timelineRevision={timelineRevision}
      expediente={bootstrapExpediente}
      canManageAttribution={canManageAttribution}
      originCreator={operationalMetadata?.createdBy ?? null}
      responsibility={responsibility}
      currentAttribution={currentAttribution}
      onSaved={async () => {
        await loadExpediente();
      }}
    />
  ) : null;

  const loadingTabId =
    tabStatus.gestion === 'loading'
      ? 'gestion'
      : tabStatus.seguimiento === 'loading'
        ? 'seguimiento'
        : null;

  return (
    <div className="space-y-6 pb-6">
      <ExpedienteHeader
        fullName={expediente.anonymizedAt ? '' : expediente.fullName}
        privacyRestricted={isPrivacyRestricted}
        anonymizedAt={expediente.anonymizedAt}
        anonymizedRequestId={expediente.anonymizedRequestId}
        canReadPrivacy={canReadPrivacy}
        status={expediente.status}
        overallProgress={overallProgress}
        subtitle="Gestión progresiva comercial y operativa."
        createdAt={expediente.createdAt}
        createdBy={createdByLabel !== 'Usuario no disponible' ? createdByLabel : null}
        acquisitionChannel={formatAcquisitionChannel(
          currentAttribution?.acquisitionChannel ?? expediente.acquisitionChannel,
        )}
      />
      {isPrivacyRestricted ? (
        <PortalAlert
          variant="warning"
          title="Datos bloqueados"
          description="La información personal está bloqueada y no se puede consultar ni editar desde esta oportunidad."
        />
      ) : (
        <>
          <ExpedienteConversionBanner
            status={expediente.status}
            subscriberSummary={subscriberSummary}
            conversionFailure={conversionFailure}
            canRetryConversion={canRetryConversion}
            isRetrying={isRetryingConversion}
            retryError={conversionRetryError}
            onRetryConversion={() => void handleRetryConversion()}
          />
          <ExpedienteTabsContainer
            key={id}
            defaultTab="vista-general"
            onTabChange={handleTabChange}
            loadingTabId={loadingTabId}
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
                content: renderLazyTab('gestion', tabSecciones),
              },
              {
                id: 'seguimiento',
                label: 'Seguimiento',
                icon: <Phone className="h-4 w-4" aria-hidden="true" />,
                content: renderLazyTab('seguimiento', tabSeguimiento),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
