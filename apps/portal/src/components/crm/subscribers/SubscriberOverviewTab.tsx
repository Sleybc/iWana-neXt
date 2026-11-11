'use client';

import { useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Badge, Button, Input, cn } from '@iwana/ui';
import { ChevronRight, FileText, Pencil, Plus, Wifi, X } from 'lucide-react';
import { AccessPermissionKey, type BillingAccountStatement } from '@iwana/shared';
import {
  ApiError,
  crmApi,
  type Contract,
  type ContractStatus,
  type Subscriber360Response,
} from '@/lib/api-client';
import { usePermissions } from '@/components/access-control/permissions-context';
import { formatBillingMoney } from '@/components/billing/billing-copy';
import {
  formatExpedienteStatus,
  getStatusBadgeVariant,
} from '@/components/crm/expedientes/expediente-ui';
import {
  PortalAlert,
  PortalEmptyState,
  PortalFieldList,
  PortalFieldRow,
  PortalPanel,
  portalInlineTextLinkClassName,
  portalPanelDenseActionClassName,
} from '@/components/shared/portal-ui';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import {
  CONTRACT_STATUS_META,
  formatContractAlias,
  formatSubscriberDate,
  formatSubscriberLocation,
} from './subscriber-ui';
import { deriveSubscriberBadges } from './subscriber-badges';
import { SubscriberActivityCard } from './SubscriberActivityCard';
import { SubscriberIdentityCard } from './SubscriberIdentityCard';
import {
  SubscriberActiveTicketsCard,
  SubscriberNextChargeCard,
  SubscriberOpenVisitsCard,
} from './SubscriberOverviewCards';
import { useContractPlan } from './use-contract-plan';

const LocationPreviewMap = dynamic(() => import('./LocationPreviewMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-gray-100 dark:bg-dark-surface-3" />,
});

type OverviewTabId = 'servicios' | 'datos' | 'cumplimiento' | 'facturacion' | 'soporte';

interface SubscriberOverviewTabProps {
  subscriber360: Subscriber360Response;
  canReadPrivacy: boolean;
  onNavigate: (tabId: OverviewTabId) => void;
  /** Recarga la ficha sin desmontar las pestañas. */
  onReload: () => Promise<void>;
  /** Panel de estado de cuenta; lo arma la ficha solo si existe la pestaña Facturación. */
  accountSummary?: ReactNode;
  /** Estado de cuenta ya leído por la ficha; alimenta la insignia de deuda vencida. */
  statement?: BillingAccountStatement | null;
}

const termClassName = 'text-xs font-medium text-gray-500 dark:text-gray-400';
const emptyValueClassName = 'text-gray-500 dark:text-gray-400';
const bodyNoteClassName = 'pb-2 text-sm text-gray-500 dark:text-gray-400';

// Orden de lectura del resumen: lo vigente primero.
const SUMMARY_STATUSES: ContractStatus[] = ['ACTIVE', 'SUSPENDED', 'DRAFT', 'TERMINATED'];
const STATUS_COUNT_LABELS: Record<ContractStatus, [string, string]> = {
  ACTIVE: ['activo', 'activos'],
  SUSPENDED: ['suspendido', 'suspendidos'],
  DRAFT: ['borrador', 'borradores'],
  TERMINATED: ['terminado', 'terminados'],
  ARCHIVED: ['archivado', 'archivados'],
};
const MAX_SERVICE_ROWS = 3;
// Solicitudes de privacidad que aún esperan respuesta.
const OPEN_REQUEST_STATUSES = new Set(['RADICADA', 'INCOMPLETA', 'EN_TRAMITE', 'PRORROGADA']);

const BILLING_FIELDS = [
  {
    key: 'paymentMethod',
    label: 'Método de pago',
    placeholder: 'Transferencia, PSE, efectivo...',
  },
  {
    key: 'billingCycle',
    label: 'Ciclo de facturación',
    placeholder: 'Mensual, quincenal...',
  },
  {
    key: 'fiscalName',
    label: 'Nombre fiscal',
    placeholder: 'Razón fiscal para facturación',
  },
] as const;

type BillingDraft = Record<(typeof BILLING_FIELDS)[number]['key'], string>;

function mapError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'No fue posible completar la operación del suscriptor.';
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function GoToTab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onClick}
        className={cn(portalInlineTextLinkClassName, 'gap-1')}
      >
        {label}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

const STATUS_DOT_CLASS: Record<ContractStatus, string> = {
  ACTIVE: 'bg-success-500',
  SUSPENDED: 'bg-amber-500',
  DRAFT: 'bg-gray-400',
  TERMINATED: 'bg-error-500',
  ARCHIVED: 'bg-gray-400',
};

function ServiceRow({ contract, anonymized }: { contract: Contract; anonymized: boolean }) {
  const meta = CONTRACT_STATUS_META[contract.status];
  const plan = useContractPlan(contract);
  const name = anonymized
    ? 'Servicio'
    : formatContractAlias(contract.alias) || 'Servicio sin nombre';
  const planLine = [
    plan.name,
    ...(plan.price !== undefined ? [`${formatBillingMoney(plan.price)}/mes`] : []),
  ].join(' · ');
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{name}</p>
        <p className="truncate text-sm text-gray-600 dark:text-gray-300">{planLine}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {contract.status === 'ACTIVE' && contract.billingCycleDay != null
            ? `Ciclo día ${contract.billingCycleDay}`
            : contract.status === 'DRAFT'
              ? 'Pendiente de activar'
              : `Desde ${formatSubscriberDate(contract.statusChangedAt ?? contract.createdAt)}`}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
        <span
          aria-hidden="true"
          className={cn('h-2 w-2 rounded-full', STATUS_DOT_CLASS[contract.status])}
        />
        {meta.label}
      </span>
    </li>
  );
}

export function SubscriberOverviewTab({
  subscriber360,
  canReadPrivacy,
  onNavigate,
  onReload,
  accountSummary,
  statement = null,
}: SubscriberOverviewTabProps) {
  const { subscriber, contracts, expedienteSummary } = subscriber360;
  const anonymizedAt = subscriber.anonymizedAt;
  const { hasPermission } = usePermissions();
  const canReadBilling = hasPermission(AccessPermissionKey.BILLING_INVOICES_READ);
  const canReadTickets = hasPermission(AccessPermissionKey.ASSURANCE_TICKETS_READ);
  const canReadVisits = hasPermission(AccessPermissionKey.WFM_SCHEDULE_READ);
  // Mapa y documento con el mismo criterio con que hoy los muestra la pestaña Datos (CA-4).
  const personalVisible = !anonymizedAt && !subscriber.privacyRestricted;
  const mapCoordinates =
    personalVisible && subscriber.latitude != null && subscriber.longitude != null
      ? { latitude: Number(subscriber.latitude), longitude: Number(subscriber.longitude) }
      : null;
  const activeContract = contracts.find((contract) => contract.status === 'ACTIVE') ?? null;
  const badges = useMemo(
    () =>
      deriveSubscriberBadges({
        status: subscriber.status,
        vatTreatment: subscriber.vatTreatment,
        contactPending: subscriber.contactPending,
        pendingSignature: subscriber.pendingSignature,
        anonymizedAt,
        fiscalCompleteness: subscriber.fiscalCompleteness,
        serviceStatuses: contracts.map((contract) => contract.status),
        documentPaymentStates: statement?.documents.map((document) => document.paymentState),
      }),
    [subscriber, anonymizedAt, contracts, statement],
  );
  const canEditBilling =
    Boolean(expedienteSummary) && !subscriber.privacyRestricted && !anonymizedAt;

  const [billingEditing, setBillingEditing] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSuccess, setBillingSuccess] = useState('');
  const [billingDraft, setBillingDraft] = useState<BillingDraft>({
    paymentMethod: '',
    billingCycle: '',
    fiscalName: '',
  });

  // ── Servicios: conteo por estado y los primeros servicios vigentes ────────
  const visibleContracts = contracts.filter((contract) => contract.status !== 'ARCHIVED');
  const statusCounts = SUMMARY_STATUSES.map((status) => ({
    status,
    count: visibleContracts.filter((contract) => contract.status === status).length,
  })).filter(({ count }) => count > 0);
  const serviceRows = [...visibleContracts]
    .sort((a, b) => SUMMARY_STATUSES.indexOf(a.status) - SUMMARY_STATUSES.indexOf(b.status))
    .slice(0, MAX_SERVICE_ROWS);
  const hiddenServices = visibleContracts.length - serviceRows.length;

  // ── Privacidad: última autorización de tratamiento y solicitudes abiertas ─
  const treatmentAuthorization = subscriber360.habeasData
    .filter((authorization) => authorization.purpose === 'TRATAMIENTO_CONTRACTUAL')
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
  const openRequests = subscriber360.arcoRequests.filter((request) =>
    OPEN_REQUEST_STATUSES.has(request.status),
  );
  const overdueRequests = openRequests.filter((request) => request.isOverdue).length;

  async function saveBilling() {
    if (!expedienteSummary) return;
    const payload: Record<string, unknown> = {};
    for (const { key } of BILLING_FIELDS) {
      const value = billingDraft[key].trim();
      if (value) payload[key] = value;
    }
    setBillingSaving(true);
    setBillingError(null);
    setBillingSuccess('');
    try {
      await crmApi.updateExpedienteSection(expedienteSummary.id, 'billing', payload);
      await onReload();
      setBillingEditing(false);
      setBillingSuccess('Facturación guardada.');
    } catch (saveError) {
      setBillingError(mapError(saveError));
    } finally {
      setBillingSaving(false);
    }
  }

  const servicesPanel = (
    <PortalPanel
      as="section"
      labelled
      density="dense"
      title="Servicios"
      actions={
        personalVisible ? (
          <button
            type="button"
            aria-label="Agregar servicio"
            className={cn(portalPanelDenseActionClassName, 'gap-1')}
            onClick={() => onNavigate('servicios')}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar
          </button>
        ) : undefined
      }
    >
      {serviceRows.length === 0 ? (
        <PortalEmptyState
          embedded
          icon={Wifi}
          title="Aún no tiene servicios"
          description="Los servicios contratados aparecerán aquí con su estado y su ciclo."
          action={
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => onNavigate('servicios')}
            >
              Ir a Servicios
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {statusCounts.length > 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {statusCounts
                .map(({ status, count }) => pluralize(count, ...STATUS_COUNT_LABELS[status]))
                .join(' · ')}
            </p>
          ) : null}
          <ul className="divide-y divide-gray-100 dark:divide-dark-border">
            {serviceRows.map((contract) => (
              <ServiceRow
                key={contract.id}
                contract={contract}
                anonymized={Boolean(anonymizedAt)}
              />
            ))}
          </ul>
          {hiddenServices > 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Y {pluralize(hiddenServices, 'servicio más', 'servicios más')}.
            </p>
          ) : null}
          {mapCoordinates ? (
            <figure aria-label="Mapa del punto de servicio" className="space-y-1">
              <div className="h-44 overflow-hidden rounded-lg border border-gray-200 dark:border-dark-border">
                <LocationPreviewMap
                  latitude={mapCoordinates.latitude}
                  longitude={mapCoordinates.longitude}
                />
              </div>
              <figcaption className="text-xs text-gray-500 dark:text-gray-400">
                © Colaboradores de OpenStreetMap
              </figcaption>
            </figure>
          ) : null}
          <GoToTab label="Ver servicios" onClick={() => onNavigate('servicios')} />
        </div>
      )}
    </PortalPanel>
  );

  const billingPanel = (
    <PortalPanel
      as="section"
      labelled
      density="dense"
      title="Facturación"
      actions={
        canEditBilling && !billingEditing ? (
          <button
            type="button"
            className={cn(portalPanelDenseActionClassName, 'gap-1.5')}
            aria-label="Editar facturación"
            onClick={() => {
              setBillingDraft({
                paymentMethod: expedienteSummary?.paymentMethod ?? '',
                billingCycle: expedienteSummary?.billingCycle ?? '',
                fiscalName: expedienteSummary?.fiscalName ?? '',
              });
              setBillingError(null);
              setBillingSuccess('');
              setBillingEditing(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Editar
          </button>
        ) : undefined
      }
      contentClassName="space-y-3"
    >
      {expedienteSummary ? (
        <p className={bodyNoteClassName}>
          {anonymizedAt
            ? 'Datos anonimizados: la facturación ya no se puede editar.'
            : 'Datos tomados de la oportunidad de origen.'}
        </p>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          'text-sm font-medium text-emerald-700 dark:text-emerald-300',
          !billingSuccess && 'sr-only',
        )}
      >
        {billingSuccess}
      </p>
      {billingError && (
        <PortalAlert
          variant="error"
          live="assertive"
          title="No fue posible guardar la facturación"
          description={billingError}
        />
      )}
      {!expedienteSummary ? (
        <PortalEmptyState
          embedded
          icon={FileText}
          title="Facturación no disponible"
          description="Este suscriptor no tiene una oportunidad de origen de donde tomar los datos de facturación."
        />
      ) : billingEditing && canEditBilling ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {BILLING_FIELDS.map(({ key, label, placeholder }) => (
              <label
                key={key}
                className={cn('flex flex-col gap-1', key === 'fiscalName' && 'sm:col-span-2')}
              >
                <span className={termClassName}>{label}</span>
                <Input
                  disabled={billingSaving}
                  placeholder={placeholder}
                  type="text"
                  value={billingDraft[key]}
                  onChange={(event) =>
                    setBillingDraft((prev) => ({ ...prev, [key]: event.target.value }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={billingSaving}
              aria-label="Cancelar edición de facturación"
              onClick={() => setBillingEditing(false)}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Cancelar
            </Button>
            <Button
              type="button"
              className="min-h-11"
              aria-label="Guardar facturación"
              loading={billingSaving}
              onClick={() => void saveBilling()}
            >
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <PortalFieldList>
          {BILLING_FIELDS.map(({ key, label }) => {
            const value = expedienteSummary[key];
            return (
              <PortalFieldRow key={key} label={label}>
                {key === 'fiscalName' && anonymizedAt
                  ? privacyDisplayValue(null, { anonymizedAt })
                  : value || <span className={emptyValueClassName}>Sin configurar</span>}
              </PortalFieldRow>
            );
          })}
        </PortalFieldList>
      )}
    </PortalPanel>
  );

  const originPanel = (
    <PortalPanel
      as="section"
      labelled
      density="dense"
      title="Oportunidad de origen"
      titleAddon={
        expedienteSummary ? (
          <Badge variant={getStatusBadgeVariant(expedienteSummary.status)}>
            {formatExpedienteStatus(expedienteSummary.status)}
          </Badge>
        ) : undefined
      }
    >
      {expedienteSummary ? (
        <div className="space-y-2">
          <PortalFieldList>
            <PortalFieldRow label="Creada">
              {expedienteSummary.createdAt ? (
                formatSubscriberDate(expedienteSummary.createdAt)
              ) : (
                <span className={emptyValueClassName}>Sin fecha</span>
              )}
            </PortalFieldRow>
            <PortalFieldRow label="Último cambio de estado">
              {expedienteSummary.statusChangedAt ? (
                formatSubscriberDate(expedienteSummary.statusChangedAt)
              ) : (
                <span className={emptyValueClassName}>Sin cambios</span>
              )}
            </PortalFieldRow>
          </PortalFieldList>
          <div className="flex justify-end">
            <Link
              href={`/dashboard/crm/expedientes/${expedienteSummary.id}`}
              className={cn(portalInlineTextLinkClassName, 'gap-1')}
            >
              Abrir oportunidad de origen
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      ) : (
        <PortalEmptyState
          embedded
          icon={FileText}
          title="Sin oportunidad vinculada"
          description="Este suscriptor se registró sin pasar por una oportunidad comercial."
        />
      )}
    </PortalPanel>
  );

  const privacyPanel = subscriber360.privacyDetailsRestricted ? (
    <PortalPanel as="section" labelled density="dense" title="Privacidad">
      <PortalAlert
        variant="warning"
        title="No tienes acceso al detalle de privacidad"
        description="Tu perfil no permite consultar autorizaciones y solicitudes vinculadas."
      />
    </PortalPanel>
  ) : canReadPrivacy ? (
    <PortalPanel
      as="section"
      labelled
      density="dense"
      title="Privacidad"
      titleAddon={
        overdueRequests > 0 ? (
          <Badge variant="error">{pluralize(overdueRequests, 'vencida', 'vencidas')}</Badge>
        ) : undefined
      }
    >
      <div className="space-y-2">
        <PortalFieldList>
          <PortalFieldRow label="Tratamiento de datos">
            {treatmentAuthorization?.granted ? (
              `Autorizado el ${formatSubscriberDate(treatmentAuthorization.capturedAt)}`
            ) : treatmentAuthorization ? (
              `Revocado el ${formatSubscriberDate(treatmentAuthorization.capturedAt)}`
            ) : (
              <span className={emptyValueClassName}>Sin autorización registrada</span>
            )}
          </PortalFieldRow>
          <PortalFieldRow label="Solicitudes abiertas">
            {openRequests.length > 0 ? (
              pluralize(openRequests.length, 'solicitud', 'solicitudes')
            ) : (
              <span className={emptyValueClassName}>Ninguna</span>
            )}
          </PortalFieldRow>
        </PortalFieldList>
        <GoToTab label="Ver cumplimiento" onClick={() => onNavigate('cumplimiento')} />
      </div>
    </PortalPanel>
  ) : null;

  // Dos columnas (spec §3 A). En móvil se apilan en el mismo orden: izquierda y luego derecha.
  // Actividad (bloque D) cierra la columna izquierda.
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        {accountSummary}
        {servicesPanel}
        <SubscriberActivityCard
          subscriberId={subscriber.id}
          contracts={contracts}
          anonymized={Boolean(anonymizedAt)}
          restricted={subscriber.privacyRestricted}
          statement={statement}
          canReadBilling={canReadBilling}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <SubscriberIdentityCard
          subscriber={subscriber}
          badges={badges}
          hasOrigin={Boolean(expedienteSummary)}
          onOpenData={() => onNavigate('datos')}
        />
        {canReadBilling && !anonymizedAt ? (
          <SubscriberNextChargeCard
            contract={activeContract}
            onOpenBilling={() => onNavigate('facturacion')}
          />
        ) : null}
        {canReadVisits ? (
          <SubscriberOpenVisitsCard
            subscriberId={subscriber.id}
            onOpenSupport={() => onNavigate('soporte')}
          />
        ) : null}
        {canReadTickets ? (
          <SubscriberActiveTicketsCard
            subscriberId={subscriber.id}
            onOpenSupport={() => onNavigate('soporte')}
          />
        ) : null}
        {privacyPanel}
        {billingPanel}
        {originPanel}
      </div>
    </div>
  );
}
