'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@iwana/ui';
import { AcquisitionChannel } from '@iwana/shared';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarCheck2,
  ChevronDown,
  ChevronRight,
  FileText,
  Hammer,
  History,
  Loader2,
  MapPin,
  Phone,
  Receipt,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Wrench,
} from 'lucide-react';
import {
  CreateAttributionDto,
  CompletenessResult,
  crmApi,
  ExpedienteActivityItem,
  InternalUser,
  ExpedienteOperationalMetadata,
  ExpedienteRecord,
  SalesAttributionRecord,
  ExpedienteStatus,
  ExpedienteTimelineChange,
  usersApi,
} from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';

import {
  ACQUISITION_CHANNEL_OPTIONS,
  DEPARTAMENTO_DEFAULT,
  DEPARTAMENTOS,
  DOCUMENT_TYPE_OPTIONS,
  EVALUATION_SOURCE_OPTIONS,
  EXPEDIENTE_STATUS_META,
  formatAcquisitionChannel,
  formatCrmDate,
  formatCrmDateTime,
  formatExpedienteStatus,
  getMunicipiosByDepartamento,
  TECHNICAL_CONFIDENCE_OPTIONS,
  TECHNICAL_VIABILITY_RESULT_OPTIONS,
  TECHNOLOGY_OPTION_OPTIONS,
} from '@/components/crm/expedientes/expediente-ui';
import { ExpedienteTabsContainer } from '@/components/crm/expedientes/ExpedienteTabsContainer';
import { useAuth } from '@/components/auth/AuthProvider';
type SectionId = (typeof SECTIONS)[number]['id'];
type DraftValues = Record<string, string>;
type CompletenessDimension = keyof Pick<
  CompletenessResult,
  'commercial' | 'legal' | 'technical' | 'operational'
>;
type SectionConfig = {
  id: string;
  label: string;
  description: string;
  icon: typeof UserRound;
  renderFields: readonly string[];
  payloadFields: readonly string[];
  completionFields: readonly string[];
};

const EMPTY_VALUE = '';

const FIELD_LABELS: Record<string, string> = {
  fullName: 'Nombre completo',
  personType: 'Tipo de persona',
  documentType: 'Tipo de documento',
  documentNumber: 'Número de documento',
  firstName: 'Nombres',
  lastName: 'Apellidos',
  companyName: 'Razón social',
  primaryContactName: 'Nombre del contacto principal',
  primaryContactRole: 'Cargo del contacto',
  phonePrimary: 'Teléfono principal',
  emailPrimary: 'Correo principal',
  altContactName: 'Nombre contacto alternativo',
  altContactPhone: 'Teléfono contacto alternativo',
  address: 'Dirección',
  municipality: 'Municipio',
  department: 'Departamento',
  neighborhood: 'Sector / Barrio',
  latitude: 'Latitud',
  longitude: 'Longitud',
  interestedPlanId: 'Plan de interés',
  additionalProductIds: 'Productos adicionales',
  acquisitionChannel: 'Canal de captación',
  sourceDetail: 'Detalle de origen',
  coverageResult: 'Resultado de cobertura',
  feasibility: 'Resultado de viabilidad',
  candidateTechnologies: 'Tecnologías candidatas',
  availableTechnology: 'Tecnología recomendada',
  technicalConfidence: 'Nivel de certeza',
  evaluationSource: 'Fuente de evaluación',
  technicalObservations: 'Observación técnica',
  identityVerified: 'Identidad verificada',
  paymentMethod: 'Método de pago',
  billingCycle: 'Ciclo de facturación',
  installationAddress: 'Dirección de instalación',
  siteContactName: 'Contacto en sitio',
};

const FIELD_PLACEHOLDERS: Record<string, string> = {
  fullName: 'Nombre o razón social',
  personType: 'Persona natural o jurídica',
  documentType: 'CC, NIT, CE...',
  documentNumber: 'Número del documento',
  firstName: 'Nombres del titular',
  lastName: 'Apellidos del titular',
  companyName: 'Nombre de la empresa',
  primaryContactName: 'Nombre del contacto',
  primaryContactRole: 'Gerente, representante...',
  phonePrimary: '3001234567',
  emailPrimary: 'cliente@empresa.co',
  altContactName: 'Nombre de quien puede contactar',
  altContactPhone: '3001234567',
  address: 'Dirección principal',
  municipality: 'Selecciona el municipio',
  department: 'Cundinamarca',
  neighborhood: 'Barrio o vereda',
  latitude: '4.7110',
  longitude: '-74.0721',
  interestedPlanId: 'Plan o referencia comercial',
  additionalProductIds: 'Productos adicionales',
  acquisitionChannel: 'Canal de adquisición',
  sourceDetail: 'Detalle de campaña u observación',
  coverageResult: 'Resultado preliminar de cobertura',
  feasibility: 'Selecciona el resultado técnico',
  technicalObservations: 'Explica brevemente el criterio técnico aplicado',
  identityVerified: 'Sí / No / Pendiente',
  paymentMethod: 'Transferencia, PSE, efectivo...',
  billingCycle: 'Mensual, quincenal...',
  installationAddress: 'Dirección del punto a instalar',
  siteContactName: 'Nombre del responsable en sitio',
};

const IDENTIFICATION_FIELDS_BASE = ['personType', 'documentType', 'documentNumber'] as const;
const IDENTIFICATION_FIELDS_NATURAL = [
  ...IDENTIFICATION_FIELDS_BASE,
  'firstName',
  'lastName',
] as const;
const IDENTIFICATION_FIELDS_JURIDICA = [
  ...IDENTIFICATION_FIELDS_BASE,
  'companyName',
  'primaryContactName',
  'primaryContactRole',
] as const;

function getIdentificationRelevantFields(personType: string | null | undefined): readonly string[] {
  if (personType === 'PERSONA_JURIDICA') {
    return IDENTIFICATION_FIELDS_JURIDICA;
  }
  return IDENTIFICATION_FIELDS_NATURAL;
}

function hasPersistedIdentificationData(values: DraftValues): boolean {
  const relevantFields = getIdentificationRelevantFields(values.personType);
  return relevantFields.some((field) => values[field]?.trim());
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'identification',
    label: 'Identificación',
    description: 'Datos base del titular o razón social.',
    icon: UserRound,
    renderFields: [...IDENTIFICATION_FIELDS_NATURAL, ...IDENTIFICATION_FIELDS_JURIDICA.slice(3)],
    payloadFields: [...IDENTIFICATION_FIELDS_NATURAL, ...IDENTIFICATION_FIELDS_JURIDICA.slice(3)],
    completionFields: [
      ...IDENTIFICATION_FIELDS_NATURAL,
      ...IDENTIFICATION_FIELDS_JURIDICA.slice(3),
    ],
  },
  {
    id: 'contact',
    label: 'Contacto',
    description: 'Canales directos para seguimiento comercial.',
    icon: Phone,
    renderFields: ['phonePrimary', 'emailPrimary', 'altContactName', 'altContactPhone'],
    payloadFields: ['phonePrimary', 'emailPrimary', 'altContactName', 'altContactPhone'],
    completionFields: ['phonePrimary', 'emailPrimary'],
  },
  {
    id: 'location',
    label: 'Ubicación',
    description: 'Referencia geográfica y dirección del potencial.',
    icon: MapPin,
    renderFields: [
      'department',
      'municipality',
      'address',
      'neighborhood',
      'latitude',
      'longitude',
    ],
    payloadFields: [
      'department',
      'municipality',
      'address',
      'neighborhood',
      'latitude',
      'longitude',
    ],
    completionFields: [
      'department',
      'municipality',
      'address',
      'neighborhood',
      'latitude',
      'longitude',
    ],
  },
  {
    id: 'commercial_interest',
    label: 'Interés comercial',
    description: 'Plan deseado y origen de la oportunidad.',
    icon: BriefcaseBusiness,
    renderFields: [
      'interestedPlanId',
      'additionalProductIds',
      'acquisitionChannel',
      'sourceDetail',
    ],
    payloadFields: [
      'interestedPlanId',
      'additionalProductIds',
      'acquisitionChannel',
      'sourceDetail',
    ],
    completionFields: ['interestedPlanId', 'acquisitionChannel'],
  },
  {
    id: 'technical_feasibility',
    label: 'Viabilidad técnica',
    description: 'Resultado técnico, alternativas y recomendación operativa.',
    icon: Wrench,
    renderFields: [
      'coverageResult',
      'feasibility',
      'candidateTechnologies',
      'availableTechnology',
      'technicalConfidence',
      'evaluationSource',
      'technicalObservations',
    ],
    payloadFields: [
      'coverageResult',
      'feasibility',
      'candidateTechnologies',
      'availableTechnology',
      'technicalConfidence',
      'evaluationSource',
      'technicalObservations',
    ],
    completionFields: [
      'feasibility',
      'candidateTechnologies',
      'availableTechnology',
      'technicalConfidence',
      'evaluationSource',
    ],
  },
  {
    id: 'legal_consent',
    label: 'Consentimiento y validación',
    description: 'Asegura identidad y preparación legal del caso.',
    icon: ShieldCheck,
    renderFields: ['identityVerified'],
    payloadFields: ['identityVerified'],
    completionFields: ['identityVerified'],
  },
  {
    id: 'billing',
    label: 'Facturación',
    description: 'Parámetros de pago y ciclo administrativo.',
    icon: Receipt,
    renderFields: ['paymentMethod', 'billingCycle'],
    payloadFields: ['paymentMethod', 'billingCycle'],
    completionFields: ['paymentMethod', 'billingCycle'],
  },
  {
    id: 'installation',
    label: 'Instalación',
    description: 'Datos operativos para agendar y ejecutar el cierre.',
    icon: Hammer,
    renderFields: ['installationAddress', 'siteContactName'],
    payloadFields: ['installationAddress', 'siteContactName'],
    completionFields: ['installationAddress', 'siteContactName'],
  },
];

const DIMENSION_SECTION_GROUPS: Record<CompletenessDimension, readonly SectionId[]> = {
  commercial: ['identification', 'contact', 'commercial_interest'],
  legal: ['legal_consent'],
  technical: ['location', 'technical_feasibility'],
  operational: ['billing', 'installation'],
};

function getSectionRenderFields(
  sectionId: SectionId,
  personType: string | null | undefined,
): readonly string[] {
  if (sectionId === 'identification') {
    return getIdentificationRelevantFields(personType);
  }

  const section = SECTIONS.find((current) => current.id === sectionId);
  return section?.renderFields ?? [];
}

function getSectionPayloadFields(
  sectionId: SectionId,
  personType: string | null | undefined,
): readonly string[] {
  if (sectionId === 'identification') {
    return getIdentificationRelevantFields(personType);
  }

  const section = SECTIONS.find((current) => current.id === sectionId);
  return section?.payloadFields ?? [];
}

function getSectionCompletionFields(
  sectionId: SectionId,
  personType: string | null | undefined,
): readonly string[] {
  if (sectionId === 'identification') {
    return getIdentificationRelevantFields(personType);
  }

  const section = SECTIONS.find((current) => current.id === sectionId);
  return section?.completionFields ?? [];
}

function buildDraftValues(expediente: ExpedienteRecord, previous: DraftValues = {}): DraftValues {
  return {
    ...previous,
    fullName: expediente.fullName ?? EMPTY_VALUE,
    personType: expediente.personType ?? EMPTY_VALUE,
    documentType: expediente.documentType ?? EMPTY_VALUE,
    documentNumber: expediente.documentNumber ?? previous.documentNumber ?? EMPTY_VALUE,
    firstName: expediente.firstName ?? EMPTY_VALUE,
    lastName: expediente.lastName ?? EMPTY_VALUE,
    companyName: expediente.companyName ?? EMPTY_VALUE,
    primaryContactName: expediente.primaryContactName ?? EMPTY_VALUE,
    primaryContactRole: expediente.primaryContactRole ?? EMPTY_VALUE,
    phonePrimary: expediente.phonePrimary ?? previous.phonePrimary ?? EMPTY_VALUE,
    emailPrimary: expediente.emailPrimary ?? previous.emailPrimary ?? EMPTY_VALUE,
    altContactName: expediente.altContactName ?? EMPTY_VALUE,
    altContactPhone: expediente.altContactPhone ?? previous.altContactPhone ?? EMPTY_VALUE,
    address: expediente.address ?? EMPTY_VALUE,
    municipality: expediente.municipality ?? EMPTY_VALUE,
    department: expediente.department ?? DEPARTAMENTO_DEFAULT,
    neighborhood: expediente.neighborhood ?? EMPTY_VALUE,
    latitude: expediente.latitude != null ? String(expediente.latitude) : EMPTY_VALUE,
    longitude: expediente.longitude != null ? String(expediente.longitude) : EMPTY_VALUE,
    interestedPlanId: expediente.interestedPlanId ?? EMPTY_VALUE,
    additionalProductIds: expediente.additionalProductIds
      ? JSON.stringify(expediente.additionalProductIds)
      : '[]',
    acquisitionChannel: expediente.acquisitionChannel ?? 'OTRO',
    sourceDetail: expediente.sourceDetail ?? EMPTY_VALUE,
    coverageResult: expediente.coverageResult ?? EMPTY_VALUE,
    feasibility: expediente.feasibility ?? EMPTY_VALUE,
    candidateTechnologies: expediente.candidateTechnologies?.join(',') ?? EMPTY_VALUE,
    availableTechnology: expediente.availableTechnology ?? EMPTY_VALUE,
    technicalConfidence: expediente.technicalConfidence ?? EMPTY_VALUE,
    evaluationSource: expediente.evaluationSource ?? EMPTY_VALUE,
    technicalObservations: expediente.technicalObservations ?? EMPTY_VALUE,
    identityVerified: expediente.identityVerified ?? EMPTY_VALUE,
    paymentMethod: expediente.paymentMethod ?? EMPTY_VALUE,
    billingCycle: expediente.billingCycle ?? EMPTY_VALUE,
    installationAddress: expediente.installationAddress ?? EMPTY_VALUE,
    siteContactName: expediente.siteContactName ?? EMPTY_VALUE,
  };
}

function getCandidateTechnologiesFromDraft(values: DraftValues): string[] {
  const rawValue = values.candidateTechnologies ?? EMPTY_VALUE;
  return rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function calculateSectionCompletion(fields: readonly string[], values: DraftValues): number {
  if (fields.length === 0) {
    return 0;
  }

  const completedFields = fields.filter((field) => values[field]?.trim()).length;
  return Math.round((completedFields / fields.length) * 100);
}

function calculateDimensionCompletion(
  sectionIds: readonly SectionId[],
  sectionCompletionById: Record<string, number>,
): number {
  if (sectionIds.length === 0) {
    return 0;
  }

  return Math.round(
    sectionIds.reduce((sum, sectionId) => sum + (sectionCompletionById[sectionId] ?? 0), 0) /
      sectionIds.length,
  );
}

function getProtectedFieldHelper(expediente: ExpedienteRecord, field: string): string | undefined {
  if (field === 'phonePrimary' && expediente.phonePrimaryEncrypted) {
    return 'Teléfono protegido ya registrado. Si lo editas, el valor actual se reemplazará.';
  }

  if (field === 'emailPrimary' && expediente.emailPrimaryEncrypted) {
    return 'Correo protegido ya registrado. Si lo editas, el valor actual se reemplazará.';
  }

  if (field === 'altContactPhone' && expediente.altContactPhoneEncrypted) {
    return 'Teléfono protegido ya registrado. Si lo editas, el valor actual se reemplazará.';
  }

  return undefined;
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

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.displayName || null;
}

function getActivityTitle(activity: ExpedienteActivityItem): string {
  switch (activity.type) {
    case 'CREATED':
      return 'Oportunidad creada';
    case 'SECTION_UPDATED':
      return `Se actualizó ${activity.sectionLabel ?? 'una sección'}`;
    case 'STATUS_CHANGED':
      return activity.toStatus ? formatExpedienteStatus(activity.toStatus) : 'Cambio de estado';
    default:
      return 'Actividad registrada';
  }
}

function getActivityDescription(activity: ExpedienteActivityItem): string {
  switch (activity.type) {
    case 'CREATED':
      return `Registro inicial generado por ${getActorLabel(activity.actor?.name)}.`;
    case 'SECTION_UPDATED':
      return `${getActorLabel(activity.actor?.name)} guardó información operativa y comercial.`;
    case 'STATUS_CHANGED':
      if (activity.fromStatus && activity.toStatus) {
        return `Desde ${formatExpedienteStatus(activity.fromStatus)} por ${getActorLabel(activity.actor?.name)}.`;
      }

      return `Cambio aplicado por ${getActorLabel(activity.actor?.name)}.`;
    default:
      return `Actividad registrada por ${getActorLabel(activity.actor?.name)}.`;
  }
}

export default function ExpedienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const id = params?.id as string;

  const [expediente, setExpediente] = useState<ExpedienteRecord | null>(null);
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<SectionId>('identification');
  const [error, setError] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<DraftValues>({});
  const [savingSection, setSavingSection] = useState<SectionId | null>(null);
  const [timeline, setTimeline] = useState<ExpedienteTimelineChange[]>([]);
  const [recentActivity, setRecentActivity] = useState<ExpedienteActivityItem[]>([]);
  const [operationalMetadata, setOperationalMetadata] =
    useState<ExpedienteOperationalMetadata | null>(null);
  const [transitionTarget, setTransitionTarget] = useState<ExpedienteStatus>('NUEVO_POTENCIAL');
  const [transitionReason, setTransitionReason] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lockedSections, setLockedSections] = useState<Set<SectionId>>(new Set());
  const [currentAttribution, setCurrentAttribution] = useState<SalesAttributionRecord | null>(null);
  const [attributionHistory, setAttributionHistory] = useState<SalesAttributionRecord[]>([]);
  const [attributionForm, setAttributionForm] = useState<CreateAttributionDto>({
    actorId: '',
    acquisitionChannel: AcquisitionChannel.OTRO,
    notes: '',
    reattributionReason: '',
  });
  const [attributionUsers, setAttributionUsers] = useState<InternalUser[]>([]);
  const [loadingAttributionUsers, setLoadingAttributionUsers] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [savingAttribution, setSavingAttribution] = useState(false);

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

  const sectionCompletionById = SECTIONS.reduce<Record<string, number>>((accumulator, section) => {
    const completionFields = getSectionCompletionFields(
      section.id as SectionId,
      effectivePersonType,
    );
    accumulator[section.id] = calculateSectionCompletion(completionFields, draftValues);
    return accumulator;
  }, {});

  const sectionsOverallProgress =
    SECTIONS.length > 0
      ? Math.round(
          SECTIONS.reduce((sum, section) => sum + (sectionCompletionById[section.id] ?? 0), 0) /
            SECTIONS.length,
        )
      : 0;

  const sectionDimensionSnapshot = {
    commercial: calculateDimensionCompletion(
      DIMENSION_SECTION_GROUPS.commercial,
      sectionCompletionById,
    ),
    legal: calculateDimensionCompletion(DIMENSION_SECTION_GROUPS.legal, sectionCompletionById),
    technical: calculateDimensionCompletion(
      DIMENSION_SECTION_GROUPS.technical,
      sectionCompletionById,
    ),
    operational: calculateDimensionCompletion(
      DIMENSION_SECTION_GROUPS.operational,
      sectionCompletionById,
    ),
  };

  const completenessSnapshot = {
    commercial: Math.max(
      completeness?.commercial ?? expediente?.completenessCommercial ?? 0,
      sectionDimensionSnapshot.commercial,
    ),
    legal: Math.max(
      completeness?.legal ?? expediente?.completenessLegal ?? 0,
      sectionDimensionSnapshot.legal,
    ),
    technical: Math.max(
      completeness?.technical ?? expediente?.completenessTechnical ?? 0,
      sectionDimensionSnapshot.technical,
    ),
    operational: Math.max(
      completeness?.operational ?? expediente?.completenessOperational ?? 0,
      sectionDimensionSnapshot.operational,
    ),
    overall: completeness?.overall ?? 0,
  };

  useEffect(() => {
    if (!id) return;
    void loadExpediente();
  }, [id]);

  const loadExpediente = async () => {
    try {
      setLoading(true);
      const response = await crmApi.getExpediente(id);
      const timelineResponse = await crmApi.getExpedienteTimeline(id);
      const currentAttributionResponse = await crmApi.getAttribution(id);
      const attributionHistoryResponse = await crmApi.getAttributionHistory(id);

      setExpediente(response.data);
      setCompleteness(response.completeness);
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
      setAttributionForm((current) => ({
        ...current,
        acquisitionChannel:
          (response.data.acquisitionChannel as CreateAttributionDto['acquisitionChannel']) ??
          'OTRO',
      }));
      setTransitionTarget(response.data.status);
      setError(null);
      setActionMessage(null);
    } catch (err) {
      console.error(err);
      setError('No fue posible cargar la oportunidad solicitada.');
    } finally {
      setLoading(false);
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

      return {
        ...current,
        candidateTechnologies: nextValues.join(','),
      };
    });
  };

  const handleSaveSection = async (section: SectionId) => {
    if (section === 'technical_feasibility') {
      const technicalPayload = {
        coverageResult: draftValues.coverageResult?.trim() || null,
        feasibility: draftValues.feasibility?.trim() || null,
        candidateTechnologies: getCandidateTechnologiesFromDraft(draftValues),
        availableTechnology: draftValues.availableTechnology?.trim() || null,
        technicalConfidence: draftValues.technicalConfidence?.trim() || null,
        evaluationSource: draftValues.evaluationSource?.trim() || null,
        technicalObservations: draftValues.technicalObservations?.trim() || null,
      };

      if (technicalPayload.feasibility === 'VIABLE') {
        if (
          technicalPayload.candidateTechnologies.length === 0 ||
          !technicalPayload.availableTechnology ||
          !technicalPayload.technicalConfidence ||
          !technicalPayload.evaluationSource
        ) {
          setActionMessage(
            'Para Viable debes registrar tecnologías candidatas, tecnología recomendada, nivel de certeza y fuente de evaluación.',
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
          setActionMessage(
            'Para Validación técnica requerida debes registrar tecnologías candidatas, nivel de certeza, fuente y observación técnica.',
          );
          return;
        }
      }

      if (technicalPayload.feasibility === 'NOT_VIABLE') {
        if (!technicalPayload.evaluationSource || !technicalPayload.technicalObservations) {
          setActionMessage(
            'Para No viable debes registrar fuente de evaluación y observación técnica.',
          );
          return;
        }
      }

      try {
        setSavingSection(section);
        setActionMessage(null);
        await crmApi.updateExpedienteSection(id, section, technicalPayload);
        await loadExpediente();
        setLockedSections((current) => new Set(current).add(section));
        setActionMessage('Sección actualizada correctamente.');
      } catch (err) {
        console.error(err);
        setActionMessage(err instanceof Error ? err.message : 'No fue posible guardar la sección.');
      } finally {
        setSavingSection(null);
      }

      return;
    }

    const fieldsToSend = getSectionPayloadFields(section, effectivePersonType);

    const payload = fieldsToSend.reduce<Record<string, unknown>>((accumulator, field) => {
      const value = draftValues[field]?.trim();
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
      setActionMessage(null);
      await crmApi.updateExpedienteSection(id, section, payload);
      await loadExpediente();
      setLockedSections((current) => new Set(current).add(section));
      setActionMessage('Sección actualizada correctamente.');
    } catch (err) {
      console.error(err);
      setActionMessage(err instanceof Error ? err.message : 'No fue posible guardar la sección.');
    } finally {
      setSavingSection(null);
    }
  };

  const handleTransition = async (targetStatus = transitionTarget) => {
    try {
      setActionMessage(null);
      await crmApi.transitionExpedienteStatus(id, {
        targetStatus,
        ...(transitionReason.trim() ? { reason: transitionReason.trim() } : {}),
      });
      await loadExpediente();
      setTransitionReason('');
      setActionMessage('Transición aplicada correctamente.');
    } catch (err) {
      console.error(err);
      setActionMessage(err instanceof Error ? err.message : 'No fue posible cambiar el estado.');
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

  const selectedAttributionActor = attributionUsers.find(
    (candidate) => candidate.id === attributionForm.actorId,
  );

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

  const handleCreateAttribution = async () => {
    if (!attributionForm.actorId.trim()) {
      setActionMessage('Debes seleccionar el actor originador.');
      return;
    }

    if (!selectedAttributionActor) {
      setActionMessage('Selecciona un usuario válido para el actor originador.');
      return;
    }

    if (currentAttribution && !attributionForm.reattributionReason?.trim()) {
      setActionMessage('La reatribución exige motivo.');
      return;
    }

    try {
      setSavingAttribution(true);
      const payload: CreateAttributionDto = {
        actorId: attributionForm.actorId.trim(),
        acquisitionChannel: attributionForm.acquisitionChannel,
      };

      const notes = attributionForm.notes?.trim();
      if (notes) {
        payload.notes = notes;
      }

      const reattributionReason = attributionForm.reattributionReason?.trim();
      if (reattributionReason) {
        payload.reattributionReason = reattributionReason;
      }

      await crmApi.createAttribution(id, payload);
      setAttributionForm((current) => ({ ...current, notes: '', reattributionReason: '' }));
      setActionMessage('Atribución comercial actualizada correctamente.');
      await loadExpediente();
    } catch (err) {
      console.error(err);
      setActionMessage(
        err instanceof Error ? err.message : 'No fue posible guardar la atribución.',
      );
    } finally {
      setSavingAttribution(false);
    }
  };

  const handleRevokeAttribution = async () => {
    if (!revokeReason.trim()) {
      setActionMessage('La revocación exige motivo.');
      return;
    }

    try {
      setSavingAttribution(true);
      await crmApi.revokeAttribution(id, revokeReason.trim());
      setRevokeReason('');
      setActionMessage('Atribución revocada correctamente.');
      await loadExpediente();
    } catch (err) {
      console.error(err);
      setActionMessage(
        err instanceof Error ? err.message : 'No fue posible revocar la atribución.',
      );
    } finally {
      setSavingAttribution(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin text-iwana-primary" aria-hidden="true" />
        Cargando oportunidad...
      </div>
    );
  }

  if (error || !expediente) {
    return (
      <div className="space-y-4 p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {error || 'Oportunidad no encontrada.'}
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

  const overallProgress = Math.max(completenessSnapshot.overall, sectionsOverallProgress);

  return (
    <div className="space-y-6 pb-6">
      <PageHeader
        title={expediente.fullName}
        subtitle={`Oportunidad ${expediente.id.slice(0, 8).toUpperCase()} · Gestión progresiva comercial y operativa.`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/dashboard/crm/expedientes')}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver al listado
            </Button>
            <Badge variant={EXPEDIENTE_STATUS_META[expediente.status].variant}>
              {EXPEDIENTE_STATUS_META[expediente.status].label}
            </Badge>
          </div>
        }
      />

      <div className="px-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-iwana-primary" aria-hidden="true" />
                Resumen de la oportunidad
              </CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sigue la completitud del caso y avanza el pipeline sin salir de la oportunidad.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Estado actual
                  </p>
                  <div className="mt-2">
                    <Badge variant={EXPEDIENTE_STATUS_META[expediente.status].variant}>
                      {EXPEDIENTE_STATUS_META[expediente.status].label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Fuente
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {formatAcquisitionChannel(expediente.acquisitionChannel)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {expediente.sourceDetail || 'Sin detalle de origen'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Municipio
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {expediente.municipality || 'Sin municipio'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Asesor asignado
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {expediente.assignedTo || 'Sin asignar'}
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
                  <span>Completitud general</span>
                  <span className="font-medium">{overallProgress}%</span>
                </div>
                <progress
                  value={overallProgress}
                  max={100}
                  className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-value]:bg-iwana-primary dark:[&::-webkit-progress-bar]:bg-dark-surface-4 dark:[&::-webkit-progress-value]:bg-iwana-secondary [&::-moz-progress-bar]:bg-iwana-primary dark:[&::-moz-progress-bar]:bg-iwana-secondary"
                />
                <div className="mt-3 grid gap-3 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2 xl:grid-cols-4">
                  <span>Comercial: {completenessSnapshot.commercial}%</span>
                  <span>Legal: {completenessSnapshot.legal}%</span>
                  <span>Técnico: {completenessSnapshot.technical}%</span>
                  <span>Operativo: {completenessSnapshot.operational}%</span>
                </div>
                {actionMessage && (
                  <p className="mt-4 rounded-xl border border-iwana-primary/15 bg-iwana-primary/5 px-4 py-3 text-sm text-iwana-primary dark:border-iwana-primary-300/20 dark:bg-iwana-primary-400/10 dark:text-iwana-primary-200">
                    {actionMessage}
                  </p>
                )}
                {expediente.dataConsentRevoked && (
                  <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                    El consentimiento de tratamiento de datos fue revocado.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Secciones de la oportunidad</CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Completa las ocho zonas de la oportunidad según avance el caso.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100 dark:divide-dark-border">
                {SECTIONS.map((section) => {
                  const Icon = section.icon;
                  const isExpanded = expandedSection === section.id;
                  const isLocked = lockedSections.has(section.id);
                  const renderFields = getSectionRenderFields(
                    section.id as SectionId,
                    effectivePersonType,
                  );
                  const sectionCompletion = sectionCompletionById[section.id] ?? 0;

                  return (
                    <section key={section.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSection(isExpanded ? ('' as SectionId) : section.id)
                        }
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-dark-surface-3"
                      >
                        <span className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-iwana-primary/10 dark:bg-iwana-primary/20">
                            <Icon
                              className="h-4 w-4 text-iwana-primary dark:text-iwana-primary-300"
                              aria-hidden="true"
                            />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-medium text-gray-900 dark:text-white">
                              {section.label}
                            </span>
                            <span className="block text-sm text-gray-500 dark:text-gray-400">
                              {section.description}
                            </span>
                          </span>
                        </span>
                        <span className="flex items-center gap-3">
                          <Badge
                            variant={
                              sectionCompletion >= 100
                                ? 'success'
                                : sectionCompletion >= 50
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {sectionCompletion}%
                          </Badge>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                          )}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50 px-5 py-5 dark:border-dark-border dark:bg-dark-surface-3/60">
                          {isLocked && section.id === 'identification' ? (
                            <div className="space-y-4">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    Tipo de persona
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                    {draftValues.personType === 'PERSONA_JURIDICA'
                                      ? 'Persona jurídica'
                                      : 'Persona natural'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    Tipo de documento
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                    {draftValues.documentType || 'No registrado'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    Número de documento
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                    {draftValues.documentNumber || 'No registrado'}
                                  </p>
                                </div>
                                {draftValues.personType === 'PERSONA_JURIDICA' ? (
                                  <>
                                    <div>
                                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Razón social
                                      </p>
                                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                        {draftValues.companyName || 'No registrado'}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Contacto principal
                                      </p>
                                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                        {draftValues.primaryContactName || 'No registrado'}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Cargo del contacto
                                      </p>
                                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                        {draftValues.primaryContactRole || 'No registrado'}
                                      </p>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div>
                                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Nombres
                                      </p>
                                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                        {draftValues.firstName || 'No registrado'}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Apellidos
                                      </p>
                                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                        {draftValues.lastName || 'No registrado'}
                                      </p>
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => {
                                    setLockedSections((current) => {
                                      const next = new Set(current);
                                      next.delete(section.id);
                                      return next;
                                    });
                                  }}
                                >
                                  Editar identificación
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {section.id === 'identification' ? (
                                <div className="space-y-4">
                                  {/* Primera fila: 3 columnas */}
                                  <div className="grid gap-4 md:grid-cols-3">
                                    <div>
                                      <label
                                        htmlFor="personType"
                                        className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                                      >
                                        {FIELD_LABELS.personType}
                                      </label>
                                      <select
                                        id="personType"
                                        value={draftValues.personType ?? EMPTY_VALUE}
                                        onChange={(event) =>
                                          handleDraftChange('personType', event.target.value)
                                        }
                                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                                      >
                                        <option value="">Selecciona el tipo de persona</option>
                                        <option value="PERSONA_NATURAL">Persona natural</option>
                                        <option value="PERSONA_JURIDICA">Persona jurídica</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label
                                        htmlFor="documentType"
                                        className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                                      >
                                        {FIELD_LABELS.documentType}
                                      </label>
                                      <select
                                        id="documentType"
                                        value={draftValues.documentType ?? EMPTY_VALUE}
                                        onChange={(e) =>
                                          handleDraftChange('documentType', e.target.value)
                                        }
                                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                                      >
                                        <option value="">Selecciona el tipo</option>
                                        {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <Input
                                      id="documentNumber"
                                      label={FIELD_LABELS.documentNumber!}
                                      value={draftValues.documentNumber ?? EMPTY_VALUE}
                                      onChange={(event) =>
                                        handleDraftChange('documentNumber', event.target.value)
                                      }
                                      placeholder={FIELD_PLACEHOLDERS.documentNumber!}
                                    />
                                  </div>
                                  {effectivePersonType === 'PERSONA_JURIDICA' ? (
                                    <div className="grid gap-4 md:grid-cols-3">
                                      <Input
                                        id="companyName"
                                        label={FIELD_LABELS.companyName!}
                                        value={draftValues.companyName ?? EMPTY_VALUE}
                                        onChange={(event) =>
                                          handleDraftChange('companyName', event.target.value)
                                        }
                                        placeholder={FIELD_PLACEHOLDERS.companyName!}
                                      />
                                      <Input
                                        id="primaryContactName"
                                        label={FIELD_LABELS.primaryContactName!}
                                        value={draftValues.primaryContactName ?? EMPTY_VALUE}
                                        onChange={(event) =>
                                          handleDraftChange(
                                            'primaryContactName',
                                            event.target.value,
                                          )
                                        }
                                        placeholder={FIELD_PLACEHOLDERS.primaryContactName!}
                                      />
                                      <Input
                                        id="primaryContactRole"
                                        label={FIELD_LABELS.primaryContactRole!}
                                        value={draftValues.primaryContactRole ?? EMPTY_VALUE}
                                        onChange={(event) =>
                                          handleDraftChange(
                                            'primaryContactRole',
                                            event.target.value,
                                          )
                                        }
                                        placeholder={FIELD_PLACEHOLDERS.primaryContactRole!}
                                      />
                                    </div>
                                  ) : (
                                    <div className="grid gap-4 md:grid-cols-2">
                                      <Input
                                        id="firstName"
                                        label={FIELD_LABELS.firstName!}
                                        value={draftValues.firstName ?? EMPTY_VALUE}
                                        onChange={(event) =>
                                          handleDraftChange('firstName', event.target.value)
                                        }
                                        placeholder={FIELD_PLACEHOLDERS.firstName!}
                                      />
                                      <Input
                                        id="lastName"
                                        label={FIELD_LABELS.lastName!}
                                        value={draftValues.lastName ?? EMPTY_VALUE}
                                        onChange={(event) =>
                                          handleDraftChange('lastName', event.target.value)
                                        }
                                        placeholder={FIELD_PLACEHOLDERS.lastName!}
                                      />
                                    </div>
                                  )}
                                </div>
                              ) : section.id === 'technical_feasibility' ? (
                                <div className="space-y-4">
                                  <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                      <label
                                        htmlFor={`${section.id}-coverageResult`}
                                        className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                                      >
                                        {FIELD_LABELS.coverageResult}
                                      </label>
                                      <Input
                                        id={`${section.id}-coverageResult`}
                                        value={draftValues.coverageResult ?? EMPTY_VALUE}
                                        onChange={(event) =>
                                          handleDraftChange('coverageResult', event.target.value)
                                        }
                                        placeholder={FIELD_PLACEHOLDERS.coverageResult}
                                      />
                                    </div>
                                    <div>
                                      <label
                                        htmlFor={`${section.id}-feasibility`}
                                        className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                                      >
                                        {FIELD_LABELS.feasibility}
                                      </label>
                                      <select
                                        id={`${section.id}-feasibility`}
                                        value={draftValues.feasibility ?? EMPTY_VALUE}
                                        onChange={(event) =>
                                          handleDraftChange('feasibility', event.target.value)
                                        }
                                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                                      >
                                        <option value="">Selecciona el resultado técnico</option>
                                        {TECHNICAL_VIABILITY_RESULT_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>

                                  <div>
                                    <p className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                                      {FIELD_LABELS.candidateTechnologies}
                                    </p>
                                    <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-2 dark:border-dark-border dark:bg-dark-surface-3">
                                      {TECHNOLOGY_OPTION_OPTIONS.map((option) => {
                                        const selectedValues =
                                          getCandidateTechnologiesFromDraft(draftValues);
                                        const checked = selectedValues.includes(option.value);

                                        return (
                                          <label
                                            key={option.value}
                                            className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={(event) =>
                                                handleCandidateTechnologyToggle(
                                                  option.value,
                                                  event.target.checked,
                                                )
                                              }
                                              className="h-4 w-4 rounded border-gray-300 text-iwana-primary accent-iwana-primary"
                                            />
                                            {option.label}
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-3">
                                    <div>
                                      <label
                                        htmlFor={`${section.id}-availableTechnology`}
                                        className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                                      >
                                        {FIELD_LABELS.availableTechnology}
                                      </label>
                                      <select
                                        id={`${section.id}-availableTechnology`}
                                        value={draftValues.availableTechnology ?? EMPTY_VALUE}
                                        onChange={(event) =>
                                          handleDraftChange(
                                            'availableTechnology',
                                            event.target.value,
                                          )
                                        }
                                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                                      >
                                        <option value="">Selecciona la recomendada</option>
                                        {TECHNOLOGY_OPTION_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label
                                        htmlFor={`${section.id}-technicalConfidence`}
                                        className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                                      >
                                        {FIELD_LABELS.technicalConfidence}
                                      </label>
                                      <select
                                        id={`${section.id}-technicalConfidence`}
                                        value={draftValues.technicalConfidence ?? EMPTY_VALUE}
                                        onChange={(event) =>
                                          handleDraftChange(
                                            'technicalConfidence',
                                            event.target.value,
                                          )
                                        }
                                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                                      >
                                        <option value="">Selecciona el nivel</option>
                                        {TECHNICAL_CONFIDENCE_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label
                                        htmlFor={`${section.id}-evaluationSource`}
                                        className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                                      >
                                        {FIELD_LABELS.evaluationSource}
                                      </label>
                                      <select
                                        id={`${section.id}-evaluationSource`}
                                        value={draftValues.evaluationSource ?? EMPTY_VALUE}
                                        onChange={(event) =>
                                          handleDraftChange('evaluationSource', event.target.value)
                                        }
                                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                                      >
                                        <option value="">Selecciona la fuente</option>
                                        {EVALUATION_SOURCE_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>

                                  <div>
                                    <label
                                      htmlFor={`${section.id}-technicalObservations`}
                                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                                    >
                                      {FIELD_LABELS.technicalObservations}
                                    </label>
                                    <textarea
                                      id={`${section.id}-technicalObservations`}
                                      value={draftValues.technicalObservations ?? EMPTY_VALUE}
                                      onChange={(event) =>
                                        handleDraftChange(
                                          'technicalObservations',
                                          event.target.value,
                                        )
                                      }
                                      rows={4}
                                      placeholder={FIELD_PLACEHOLDERS.technicalObservations}
                                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                                    />
                                    {(draftValues.feasibility === 'VALIDATION_REQUIRED' ||
                                      draftValues.feasibility === 'NOT_VIABLE') && (
                                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                        Describe brevemente el criterio técnico para justificar el
                                        estado seleccionado.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="grid gap-4 md:grid-cols-2">
                                  {renderFields
                                    .filter((field) => field !== 'personType')
                                    .map((field) => {
                                      const protectedFieldHelper = getProtectedFieldHelper(
                                        expediente,
                                        field,
                                      );

                                      if (section.id === 'contact' && field === 'altContactName') {
                                        return (
                                          <div key={field} className="md:col-span-2 space-y-4">
                                            <div className="border-t border-gray-200 pt-4 dark:border-dark-border" />
                                            <Input
                                              id={`${section.id}-${field}`}
                                              label={FIELD_LABELS[field] ?? field}
                                              value={draftValues[field] ?? EMPTY_VALUE}
                                              onChange={(event) =>
                                                handleDraftChange(field, event.target.value)
                                              }
                                              maxLength={160}
                                              placeholder={
                                                FIELD_PLACEHOLDERS[field] ??
                                                `Ingresa ${FIELD_LABELS[field] ?? field}`
                                              }
                                            />
                                          </div>
                                        );
                                      }

                                      if (field === 'altContactPhone') {
                                        return (
                                          <Input
                                            key={field}
                                            id={`${section.id}-${field}`}
                                            type="tel"
                                            maxLength={10}
                                            pattern="3[0-9]{9}"
                                            label={FIELD_LABELS[field] ?? field}
                                            value={draftValues[field] ?? EMPTY_VALUE}
                                            onChange={(event) =>
                                              handleDraftChange(field, event.target.value)
                                            }
                                            placeholder={
                                              FIELD_PLACEHOLDERS[field] ??
                                              `Ingresa ${FIELD_LABELS[field] ?? field}`
                                            }
                                            {...(protectedFieldHelper
                                              ? { helperText: protectedFieldHelper }
                                              : {})}
                                          />
                                        );
                                      }

                                      if (field === 'department') {
                                        return (
                                          <div key={field}>
                                            <label
                                              htmlFor={`${section.id}-${field}`}
                                              className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                                            >
                                              {FIELD_LABELS[field]}
                                            </label>
                                            <select
                                              id={`${section.id}-${field}`}
                                              value={draftValues[field] ?? DEPARTAMENTO_DEFAULT}
                                              onChange={(e) =>
                                                handleDraftChange(field, e.target.value)
                                              }
                                              disabled
                                              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-100 px-3 text-sm text-gray-500 dark:border-dark-border dark:bg-dark-surface-4 dark:text-gray-400"
                                            >
                                              {DEPARTAMENTOS.map((depto) => (
                                                <option key={depto.value} value={depto.value}>
                                                  {depto.label}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        );
                                      }

                                      if (field === 'municipality') {
                                        const currentDept =
                                          draftValues['department'] ?? DEPARTAMENTO_DEFAULT;
                                        const municipios = getMunicipiosByDepartamento(currentDept);
                                        return (
                                          <div key={field}>
                                            <label
                                              htmlFor={`${section.id}-${field}`}
                                              className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                                            >
                                              {FIELD_LABELS[field]}
                                            </label>
                                            <select
                                              id={`${section.id}-${field}`}
                                              value={draftValues[field] ?? EMPTY_VALUE}
                                              onChange={(e) =>
                                                handleDraftChange(field, e.target.value)
                                              }
                                              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                                            >
                                              <option value="">Selecciona el municipio</option>
                                              {municipios.map((muni) => (
                                                <option key={muni.value} value={muni.value}>
                                                  {muni.label}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        );
                                      }

                                      if (field === 'latitude' || field === 'longitude') {
                                        return (
                                          <Input
                                            key={field}
                                            id={`${section.id}-${field}`}
                                            type="number"
                                            step="0.0000001"
                                            label={FIELD_LABELS[field]!}
                                            value={draftValues[field] ?? EMPTY_VALUE}
                                            onChange={(event) =>
                                              handleDraftChange(field, event.target.value)
                                            }
                                            placeholder={FIELD_PLACEHOLDERS[field]!}
                                          />
                                        );
                                      }

                                      if (field === 'additionalProductIds') {
                                        // Parse selected IDs from draft value (stored as JSON array string)
                                        const selectedIds: string[] = (() => {
                                          try {
                                            const raw = draftValues[field] ?? '[]';
                                            return JSON.parse(raw);
                                          } catch {
                                            return [];
                                          }
                                        })();

                                        const defaultProducts = [
                                          {
                                            id: 'default-tvbox',
                                            name: 'TvBox',
                                            category: 'ENTERTAINMENT',
                                          },
                                          {
                                            id: 'default-decoder',
                                            name: 'Decodificador adicional',
                                            category: 'ENTERTAINMENT',
                                          },
                                          {
                                            id: 'default-camaras',
                                            name: 'Cámaras de seguridad',
                                            category: 'SECURITY',
                                          },
                                          {
                                            id: 'default-dvr',
                                            name: 'DVR / NVR',
                                            category: 'SECURITY',
                                          },
                                          {
                                            id: 'default-alarma',
                                            name: 'Alarma residencial',
                                            category: 'SECURITY',
                                          },
                                          {
                                            id: 'default-router',
                                            name: 'Router WiFi mesh',
                                            category: 'CONNECTIVITY',
                                          },
                                          {
                                            id: 'default-extensor',
                                            name: 'Extensor de cobertura',
                                            category: 'CONNECTIVITY',
                                          },
                                          {
                                            id: 'default-ip',
                                            name: 'IP estática',
                                            category: 'CONNECTIVITY',
                                          },
                                          {
                                            id: 'default-soporte',
                                            name: 'Soporte prioritario',
                                            category: 'BUSINESS',
                                          },
                                          {
                                            id: 'default-linea',
                                            name: 'Línea telefónica adicional',
                                            category: 'BUSINESS',
                                          },
                                        ];

                                        const handleCheckboxChange = (
                                          productId: string,
                                          checked: boolean,
                                        ) => {
                                          let newSelectedIds: string[];
                                          if (checked) {
                                            newSelectedIds = [...selectedIds, productId];
                                          } else {
                                            newSelectedIds = selectedIds.filter(
                                              (id) => id !== productId,
                                            );
                                          }
                                          handleDraftChange(field, JSON.stringify(newSelectedIds));
                                        };

                                        return (
                                          <div key={field} className="space-y-3">
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                                              {FIELD_LABELS[field]}
                                            </label>
                                            <div className="grid gap-2 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface-2 p-3">
                                              {defaultProducts.map((product) => (
                                                <label
                                                  key={product.id}
                                                  className="flex items-center gap-2 cursor-pointer"
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(product.id)}
                                                    onChange={(e) =>
                                                      handleCheckboxChange(
                                                        product.id,
                                                        e.target.checked,
                                                      )
                                                    }
                                                    className="h-4 w-4 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary"
                                                  />
                                                  <span className="text-sm text-gray-700 dark:text-gray-200">
                                                    {product.name}
                                                  </span>
                                                </label>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      }

                                      if (field === 'acquisitionChannel') {
                                        return (
                                          <div key={field}>
                                            <label
                                              htmlFor={`${section.id}-${field}`}
                                              className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                                            >
                                              {FIELD_LABELS[field]}
                                            </label>
                                            <select
                                              id={`${section.id}-${field}`}
                                              value={draftValues[field] ?? AcquisitionChannel.OTRO}
                                              onChange={(event) =>
                                                handleDraftChange(field, event.target.value)
                                              }
                                              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                                            >
                                              {ACQUISITION_CHANNEL_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                  {option.label}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        );
                                      }

                                      return (
                                        <Input
                                          key={field}
                                          id={`${section.id}-${field}`}
                                          label={FIELD_LABELS[field] ?? field}
                                          value={draftValues[field] ?? EMPTY_VALUE}
                                          onChange={(event) =>
                                            handleDraftChange(field, event.target.value)
                                          }
                                          placeholder={
                                            FIELD_PLACEHOLDERS[field] ??
                                            `Ingresa ${FIELD_LABELS[field] ?? field}`
                                          }
                                          {...(protectedFieldHelper
                                            ? { helperText: protectedFieldHelper }
                                            : {})}
                                        />
                                      );
                                    })}
                                </div>
                              )}
                              <div className="mt-4 flex justify-end">
                                <Button
                                  type="button"
                                  loading={savingSection === section.id}
                                  onClick={() => handleSaveSection(section.id)}
                                >
                                  {savingSection === section.id
                                    ? 'Guardando sección...'
                                    : 'Guardar sección'}
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acciones de pipeline</CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Transiciona el caso o agenda instalación desde la misma consola operativa.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto_auto] lg:items-end">
                <div>
                  <label
                    htmlFor="transition-target"
                    className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                  >
                    Estado destino
                  </label>
                  <select
                    id="transition-target"
                    value={transitionTarget}
                    onChange={(event) =>
                      setTransitionTarget(event.target.value as ExpedienteStatus)
                    }
                    className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                  >
                    {Object.entries(EXPEDIENTE_STATUS_META).map(([status, meta]) => (
                      <option key={status} value={status}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  id="transition-reason"
                  label="Motivo"
                  value={transitionReason}
                  onChange={(event) => setTransitionReason(event.target.value)}
                  placeholder="Motivo de transición, descarte o ajuste"
                />
                <Button type="button" onClick={() => handleTransition()}>
                  Cambiar estado
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleTransition('INSTALACION_AGENDADA')}
                >
                  <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
                  Programar instalación
                </Button>
              </div>

              {expediente.status === 'DESCARTADO' && (
                <div className="mt-4 flex justify-start">
                  <Button type="button" variant="ghost" onClick={handleReactivate}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Reactivar oportunidad
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gestión operativa</CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Contactos, consentimientos y verificaciones de cobertura del expediente.
              </p>
            </CardHeader>
            <CardContent>
              <ExpedienteTabsContainer expedienteId={expediente.id} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-iwana-secondary-700" aria-hidden="true" />
                Actividad reciente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 text-sm text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
                  Aún no hay actividad registrada. Aquí verás secciones guardadas y cambios de
                  estado.
                </p>
              ) : (
                recentActivity.slice(0, 5).map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm dark:border-dark-border dark:bg-dark-surface-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {getActivityTitle(activity)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {getActivityDescription(activity)}
                        </p>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatCrmDateTime(activity.occurredAt)}
                      </span>
                    </div>
                    {activity.reason && (
                      <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                        {activity.reason}
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metadata operativa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Creado
                </p>
                <p className="mt-1 text-gray-900 dark:text-white">
                  {formatCrmDate(expediente.createdAt)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Creado por
                </p>
                <p className="mt-1 text-gray-900 dark:text-white">{createdByLabel}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Actualizado
                </p>
                <p className="mt-1 text-gray-900 dark:text-white">
                  {formatCrmDate(expediente.updatedAt)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Última edición por
                </p>
                <p className="mt-1 text-gray-900 dark:text-white">{lastEditedByLabel}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Última actividad
                </p>
                <p className="mt-1 text-gray-900 dark:text-white">
                  {operationalMetadata?.lastActivityAt
                    ? formatCrmDateTime(operationalMetadata.lastActivityAt)
                    : 'Sin actividad reciente'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Canal de captación
                </p>
                <p className="mt-1 text-gray-900 dark:text-white">
                  {formatAcquisitionChannel(expediente.acquisitionChannel)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {expediente.sourceDetail || 'Sin detalle de origen'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Atribución comercial</CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Originador actual e historial de reatribuciones del expediente.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-gray-100 px-4 py-3 dark:border-dark-border">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Originador actual
                </p>
                {currentAttribution ? (
                  <div className="mt-2 space-y-1 text-sm text-gray-900 dark:text-white">
                    <p>{currentAttribution.actorName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Rol: {currentAttribution.actorRole}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Canal: {formatAcquisitionChannel(currentAttribution.acquisitionChannel)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Fecha: {formatCrmDateTime(currentAttribution.attributedAt)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Sin atribución activa.
                  </p>
                )}
              </div>

              {canManageAttribution && (
                <div className="space-y-3 rounded-xl border border-gray-100 p-4 dark:border-dark-border">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Reatribuir originador
                  </p>
                  <div>
                    <label
                      htmlFor="attribution-actor-id"
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      Actor originador
                    </label>
                    <select
                      id="attribution-actor-id"
                      value={attributionForm.actorId}
                      onChange={(event) => {
                        const actorId = event.target.value;
                        setAttributionForm((current) => ({
                          ...current,
                          actorId,
                        }));
                      }}
                      disabled={loadingAttributionUsers}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300 dark:disabled:bg-dark-surface-4"
                    >
                      <option value="">
                        {loadingAttributionUsers
                          ? 'Cargando usuarios activos...'
                          : 'Selecciona un usuario activo'}
                      </option>
                      {sortedAttributionUsers.map((candidate) => {
                        const fullName = [candidate.firstName, candidate.lastName]
                          .filter(Boolean)
                          .join(' ')
                          .trim();
                        const label = fullName || candidate.email || 'Usuario sin nombre';

                        return (
                          <option key={candidate.id} value={candidate.id}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Usuario responsable de originar la oportunidad. El sistema guarda su
                      identificador único internamente para trazabilidad de incentivos y auditoría.
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="attribution-channel"
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      Canal de captación
                    </label>
                    <select
                      id="attribution-channel"
                      value={attributionForm.acquisitionChannel}
                      onChange={(event) =>
                        setAttributionForm((current) => ({
                          ...current,
                          acquisitionChannel: event.target
                            .value as CreateAttributionDto['acquisitionChannel'],
                        }))
                      }
                      className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                    >
                      {ACQUISITION_CHANNEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    id="attribution-notes"
                    label="Notas (opcional)"
                    value={attributionForm.notes ?? ''}
                    onChange={(event) =>
                      setAttributionForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="Contexto de la atribución"
                  />
                  <Input
                    id="attribution-reattribution-reason"
                    label="Motivo de reatribución"
                    value={attributionForm.reattributionReason ?? ''}
                    onChange={(event) =>
                      setAttributionForm((current) => ({
                        ...current,
                        reattributionReason: event.target.value,
                      }))
                    }
                    placeholder="Obligatorio cuando ya existe atribución activa"
                  />
                  <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Explica por qué el expediente cambia de originador. Este motivo queda en el
                    historial como evidencia de auditoría de la reatribución.
                  </p>
                  <Button
                    type="button"
                    loading={savingAttribution}
                    onClick={handleCreateAttribution}
                  >
                    Guardar atribución
                  </Button>
                  {currentAttribution && (
                    <div className="space-y-2 rounded-xl border border-gray-100 p-3 dark:border-dark-border">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Revocar atribución actual
                      </p>
                      <Input
                        id="attribution-revoke-reason"
                        label="Motivo de revocación"
                        value={revokeReason}
                        onChange={(event) => setRevokeReason(event.target.value)}
                        placeholder="Motivo obligatorio"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        loading={savingAttribution}
                        onClick={handleRevokeAttribution}
                      >
                        Revocar atribución
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {!canManageAttribution && (
                <p className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
                  Tu rol puede consultar originador e historial, pero no editar atribuciones. La
                  edición está habilitada para ADMIN y SYSTEM_ADMIN.
                </p>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Historial</p>
                {attributionHistory.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Aún no hay historial de atribuciones.
                  </p>
                ) : (
                  attributionHistory.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-gray-100 px-4 py-3 text-sm dark:border-dark-border"
                    >
                      <p className="font-medium text-gray-900 dark:text-white">{item.actorName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {item.actorRole} · {formatAcquisitionChannel(item.acquisitionChannel)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatCrmDateTime(item.attributedAt)}
                      </p>
                      {item.revokedAt && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Revocado: {formatCrmDateTime(item.revokedAt)} ·{' '}
                          {item.revokedReason || 'Sin motivo'}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historial del pipeline</CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Aquí solo se muestran cambios de estado comerciales de la oportunidad.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {timeline.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Aún no hay cambios de estado registrados.
                </p>
              ) : (
                timeline.map((change) => (
                  <div key={change.id} className="relative pl-5">
                    <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-iwana-primary dark:bg-iwana-secondary" />
                    <div className="rounded-xl border border-gray-100 px-4 py-3 dark:border-dark-border">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {formatExpedienteStatus(change.toStatus)}
                        </p>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatCrmDateTime(change.changedAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Estado previo: {formatExpedienteStatus(change.fromStatus)}
                      </p>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Ejecutado por {getActorLabel(change.actor?.name)}
                      </p>
                      {change.reason && (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                          Motivo: {change.reason}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
