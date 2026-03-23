'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@iwana/ui';
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
  CompletenessResult,
  crmApi,
  ExpedienteActivityItem,
  ExpedienteOperationalMetadata,
  ExpedienteRecord,
  ExpedienteStatus,
  ExpedienteTimelineChange,
} from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';

import {
  EXPEDIENTE_STATUS_META,
  formatCrmDate,
  formatCrmDateTime,
  formatExpedienteStatus,
} from '@/components/crm/expedientes/expediente-ui';
import { useAuth } from '@/components/auth/AuthProvider';
type SectionId = (typeof SECTIONS)[number]['id'];
type DraftValues = Record<string, string>;

const EMPTY_VALUE = '';

const FIELD_LABELS: Record<string, string> = {
  fullName: 'Nombre completo',
  documentType: 'Tipo de documento',
  documentNumber: 'Número de documento',
  phonePrimary: 'Teléfono principal',
  emailPrimary: 'Correo principal',
  address: 'Dirección',
  municipality: 'Municipio',
  department: 'Departamento',
  interestedPlanId: 'Plan de interés',
  source: 'Fuente de captación',
  coverageResult: 'Resultado de cobertura',
  feasibility: 'Factibilidad',
  identityVerified: 'Identidad verificada',
  paymentMethod: 'Método de pago',
  billingCycle: 'Ciclo de facturación',
  installationAddress: 'Dirección de instalación',
  siteContactName: 'Contacto en sitio',
};

const FIELD_PLACEHOLDERS: Record<string, string> = {
  fullName: 'Nombre o razón social',
  documentType: 'CC, NIT, CE...',
  documentNumber: 'Número del documento',
  phonePrimary: '3001234567',
  emailPrimary: 'cliente@empresa.co',
  address: 'Dirección principal',
  municipality: 'Municipio',
  department: 'Departamento',
  interestedPlanId: 'Plan o referencia comercial',
  source: 'Manual, referido, web...',
  coverageResult: 'Viable, parcial, sin cobertura...',
  feasibility: 'Observación de factibilidad',
  identityVerified: 'Sí / No / Pendiente',
  paymentMethod: 'Transferencia, PSE, efectivo...',
  billingCycle: 'Mensual, quincenal...',
  installationAddress: 'Dirección del punto a instalar',
  siteContactName: 'Nombre del responsable en sitio',
};

const SECTIONS = [
  {
    id: 'identification',
    label: 'Identificación',
    description: 'Datos base del titular o razón social.',
    icon: UserRound,
    fields: ['fullName', 'documentType', 'documentNumber'],
  },
  {
    id: 'contact',
    label: 'Contacto',
    description: 'Canales directos para seguimiento comercial.',
    icon: Phone,
    fields: ['phonePrimary', 'emailPrimary'],
  },
  {
    id: 'location',
    label: 'Ubicación',
    description: 'Referencia geográfica y dirección del potencial.',
    icon: MapPin,
    fields: ['address', 'municipality', 'department'],
  },
  {
    id: 'commercial_interest',
    label: 'Interés comercial',
    description: 'Plan deseado y origen de la oportunidad.',
    icon: BriefcaseBusiness,
    fields: ['interestedPlanId', 'source'],
  },
  {
    id: 'technical_feasibility',
    label: 'Viabilidad técnica',
    description: 'Resultado de cobertura y criterio de factibilidad.',
    icon: Wrench,
    fields: ['coverageResult', 'feasibility'],
  },
  {
    id: 'legal_consent',
    label: 'Consentimiento y validación',
    description: 'Asegura identidad y preparación legal del caso.',
    icon: ShieldCheck,
    fields: ['identityVerified'],
  },
  {
    id: 'billing',
    label: 'Facturación',
    description: 'Parámetros de pago y ciclo administrativo.',
    icon: Receipt,
    fields: ['paymentMethod', 'billingCycle'],
  },
  {
    id: 'installation',
    label: 'Instalación',
    description: 'Datos operativos para agendar y ejecutar el cierre.',
    icon: Hammer,
    fields: ['installationAddress', 'siteContactName'],
  },
] as const;

function buildDraftValues(expediente: ExpedienteRecord, previous: DraftValues = {}): DraftValues {
  return {
    ...previous,
    fullName: expediente.fullName ?? EMPTY_VALUE,
    documentType: expediente.documentType ?? EMPTY_VALUE,
    documentNumber: expediente.documentNumberEncrypted
      ? (previous.documentNumber ?? EMPTY_VALUE)
      : EMPTY_VALUE,
    phonePrimary: expediente.phonePrimaryEncrypted
      ? (previous.phonePrimary ?? EMPTY_VALUE)
      : EMPTY_VALUE,
    emailPrimary: expediente.emailPrimaryEncrypted
      ? (previous.emailPrimary ?? EMPTY_VALUE)
      : EMPTY_VALUE,
    address: expediente.address ?? EMPTY_VALUE,
    municipality: expediente.municipality ?? EMPTY_VALUE,
    department: expediente.department ?? EMPTY_VALUE,
    interestedPlanId: expediente.interestedPlanId ?? EMPTY_VALUE,
    source: expediente.source ?? EMPTY_VALUE,
    coverageResult: expediente.coverageResult ?? EMPTY_VALUE,
    feasibility: expediente.feasibility ?? EMPTY_VALUE,
    identityVerified: expediente.identityVerified ?? EMPTY_VALUE,
    paymentMethod: expediente.paymentMethod ?? EMPTY_VALUE,
    billingCycle: expediente.billingCycle ?? EMPTY_VALUE,
    installationAddress: expediente.installationAddress ?? EMPTY_VALUE,
    siteContactName: expediente.siteContactName ?? EMPTY_VALUE,
  };
}

function calculateSectionCompletion(fields: readonly string[], values: DraftValues): number {
  if (fields.length === 0) {
    return 0;
  }

  const completedFields = fields.filter((field) => values[field]?.trim()).length;
  return Math.round((completedFields / fields.length) * 100);
}

function getProtectedFieldHelper(expediente: ExpedienteRecord, field: string): string | undefined {
  if (field === 'documentNumber' && expediente.documentNumberEncrypted) {
    return 'Dato protegido ya registrado. Si escribes uno nuevo, reemplazará el valor actual.';
  }

  if (field === 'phonePrimary' && expediente.phonePrimaryEncrypted) {
    return 'Teléfono protegido ya registrado. Si lo editas, el valor actual se reemplazará.';
  }

  if (field === 'emailPrimary' && expediente.emailPrimaryEncrypted) {
    return 'Correo protegido ya registrado. Si lo editas, el valor actual se reemplazará.';
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

  useEffect(() => {
    if (!id) return;
    void loadExpediente();
  }, [id]);

  const loadExpediente = async () => {
    try {
      setLoading(true);
      const response = await crmApi.getExpediente(id);
      const timelineResponse = await crmApi.getExpedienteTimeline(id);

      setExpediente(response.data);
      setCompleteness(response.completeness);
      setDraftValues((current) => buildDraftValues(response.data, current));
      setTimeline(timelineResponse.data.changes ?? []);
      setRecentActivity(timelineResponse.data.activities ?? []);
      setOperationalMetadata(
        timelineResponse.data.metadata ?? {
          createdBy: { userId: null, name: null },
          lastEditedBy: { userId: null, name: null },
          lastActivityAt: null,
        },
      );
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

  const handleSaveSection = async (section: SectionId) => {
    const sectionDefinition = SECTIONS.find((item) => item.id === section);
    if (!sectionDefinition) return;

    const payload = sectionDefinition.fields.reduce<Record<string, unknown>>(
      (accumulator, field) => {
        const value = draftValues[field]?.trim();
        if (value) accumulator[field] = value;
        return accumulator;
      },
      {},
    );

    try {
      setSavingSection(section);
      setActionMessage(null);
      await crmApi.updateExpedienteSection(id, section, payload);
      await loadExpediente();
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

  const overallProgress = completeness?.overall ?? 0;

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
                    {expediente.source}
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
                  <span>Comercial: {completeness?.commercial ?? 0}%</span>
                  <span>Legal: {completeness?.legal ?? 0}%</span>
                  <span>Técnico: {completeness?.technical ?? 0}%</span>
                  <span>Operativo: {completeness?.operational ?? 0}%</span>
                </div>
                {actionMessage && (
                  <p className="mt-4 rounded-xl border border-iwana-primary/15 bg-iwana-primary/5 px-4 py-3 text-sm text-iwana-primary dark:border-iwana-primary-300/20 dark:bg-iwana-primary-400/10 dark:text-iwana-primary-200">
                    {actionMessage}
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
                  const sectionCompletion = calculateSectionCompletion(section.fields, draftValues);

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
                          <div className="grid gap-4 md:grid-cols-2">
                            {section.fields.map((field) => {
                              const protectedFieldHelper = getProtectedFieldHelper(
                                expediente,
                                field,
                              );

                              return (
                                <Input
                                  key={field}
                                  id={`${section.id}-${field}`}
                                  label={FIELD_LABELS[field] ?? field}
                                  value={draftValues[field] ?? EMPTY_VALUE}
                                  onChange={(event) => handleDraftChange(field, event.target.value)}
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
                  Fuente
                </p>
                <p className="mt-1 text-gray-900 dark:text-white">{expediente.source}</p>
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
