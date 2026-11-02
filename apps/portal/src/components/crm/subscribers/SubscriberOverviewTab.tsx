'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Badge, Button, Input, cn } from '@iwana/ui';
import { ChevronRight, FileText, Pencil, Wifi, X } from 'lucide-react';
import {
  ApiError,
  crmApi,
  type ContractStatus,
  type Subscriber360Response,
} from '@/lib/api-client';
import {
  formatExpedienteStatus,
  getStatusBadgeVariant,
} from '@/components/crm/expedientes/expediente-ui';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import {
  CONTRACT_STATUS_META,
  formatContractAlias,
  formatSubscriberDate,
  formatSubscriberLocation,
} from './subscriber-ui';

type OverviewTabId = 'servicios' | 'datos' | 'cumplimiento';

interface SubscriberOverviewTabProps {
  subscriber360: Subscriber360Response;
  canReadPrivacy: boolean;
  onNavigate: (tabId: OverviewTabId) => void;
  /** Recarga la ficha sin desmontar las pestañas. */
  onReload: () => Promise<void>;
}

const termClassName = 'text-xs font-medium text-gray-500 dark:text-gray-400';
const valueClassName = 'mt-0.5 break-words text-sm text-gray-900 dark:text-white';
const emptyValueClassName = 'text-gray-500 dark:text-gray-400';

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

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className={termClassName}>{label}</dt>
      <dd className={valueClassName}>{children}</dd>
    </div>
  );
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

export function SubscriberOverviewTab({
  subscriber360,
  canReadPrivacy,
  onNavigate,
  onReload,
}: SubscriberOverviewTabProps) {
  const { subscriber, contracts, expedienteSummary } = subscriber360;
  const anonymizedAt = subscriber.anonymizedAt;
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

  const contactValue = (value: string | null | undefined, fallback: string) => {
    const display = privacyDisplayValue(anonymizedAt ? null : (value ?? null), { anonymizedAt });
    return value || anonymizedAt ? (
      display
    ) : (
      <span className={emptyValueClassName}>{fallback}</span>
    );
  };

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
      title="Servicios"
      description={
        statusCounts.length > 0
          ? statusCounts
              .map(({ status, count }) => pluralize(count, ...STATUS_COUNT_LABELS[status]))
              .join(' · ')
          : undefined
      }
      contentClassName="space-y-2"
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
        <>
          <ul className="divide-y divide-gray-100 dark:divide-dark-border">
            {serviceRows.map((contract) => {
              const meta = CONTRACT_STATUS_META[contract.status];
              const name = anonymizedAt
                ? 'Servicio'
                : formatContractAlias(contract.alias) || 'Servicio sin nombre';
              return (
                <li key={contract.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {contract.status === 'ACTIVE' && contract.billingCycleDay != null
                        ? `Ciclo día ${contract.billingCycleDay}`
                        : contract.status === 'DRAFT'
                          ? 'Pendiente de activar'
                          : `Desde ${formatSubscriberDate(contract.statusChangedAt ?? contract.createdAt)}`}
                    </p>
                  </div>
                  <Badge variant={meta.variant} className="shrink-0">
                    {meta.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
          {hiddenServices > 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Y {pluralize(hiddenServices, 'servicio más', 'servicios más')}.
            </p>
          ) : null}
          <GoToTab label="Ver servicios" onClick={() => onNavigate('servicios')} />
        </>
      )}
    </PortalPanel>
  );

  const contactPanel = (
    <PortalPanel as="section" labelled title="Contacto" contentClassName="space-y-2">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="Correo">{contactValue(subscriber.email, 'Sin correo')}</Field>
        <Field label="Teléfono">{contactValue(subscriber.phone, 'Sin teléfono')}</Field>
        <Field label="Ubicación" className="sm:col-span-2">
          {anonymizedAt
            ? privacyDisplayValue(null, { anonymizedAt })
            : formatSubscriberLocation(subscriber.city, subscriber.department)}
        </Field>
      </dl>
      <GoToTab label="Ver datos" onClick={() => onNavigate('datos')} />
    </PortalPanel>
  );

  const billingPanel = (
    <PortalPanel
      as="section"
      labelled
      title="Facturación"
      description={
        !expedienteSummary
          ? undefined
          : anonymizedAt
            ? 'Datos anonimizados: la facturación ya no se puede editar.'
            : 'Datos tomados de la oportunidad de origen.'
      }
      actions={
        canEditBilling && !billingEditing ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 gap-1.5"
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
          </Button>
        ) : undefined
      }
      contentClassName="space-y-3"
    >
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
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {BILLING_FIELDS.map(({ key, label }) => {
            const value = expedienteSummary[key];
            return (
              <Field
                key={key}
                label={label}
                className={key === 'fiscalName' ? 'sm:col-span-2' : undefined}
              >
                {key === 'fiscalName' && anonymizedAt
                  ? privacyDisplayValue(null, { anonymizedAt })
                  : value || <span className={emptyValueClassName}>Sin configurar</span>}
              </Field>
            );
          })}
        </dl>
      )}
    </PortalPanel>
  );

  const originPanel = (
    <PortalPanel
      as="section"
      labelled
      title="Oportunidad de origen"
      titleAddon={
        expedienteSummary ? (
          <Badge variant={getStatusBadgeVariant(expedienteSummary.status)}>
            {formatExpedienteStatus(expedienteSummary.status)}
          </Badge>
        ) : undefined
      }
      contentClassName="space-y-2"
    >
      {expedienteSummary ? (
        <>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field label="Creada">
              {expedienteSummary.createdAt ? (
                formatSubscriberDate(expedienteSummary.createdAt)
              ) : (
                <span className={emptyValueClassName}>Sin fecha</span>
              )}
            </Field>
            <Field label="Último cambio de estado">
              {expedienteSummary.statusChangedAt ? (
                formatSubscriberDate(expedienteSummary.statusChangedAt)
              ) : (
                <span className={emptyValueClassName}>Sin cambios</span>
              )}
            </Field>
          </dl>
          <div className="flex justify-end">
            <Link
              href={`/dashboard/crm/expedientes/${expedienteSummary.id}`}
              className={cn(portalInlineTextLinkClassName, 'gap-1')}
            >
              Abrir oportunidad de origen
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </>
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
    <PortalPanel as="section" labelled title="Privacidad">
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
      title="Privacidad"
      titleAddon={
        overdueRequests > 0 ? (
          <Badge variant="error">{pluralize(overdueRequests, 'vencida', 'vencidas')}</Badge>
        ) : undefined
      }
      contentClassName="space-y-2"
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="Tratamiento de datos">
          {treatmentAuthorization?.granted ? (
            `Autorizado el ${formatSubscriberDate(treatmentAuthorization.capturedAt)}`
          ) : treatmentAuthorization ? (
            `Revocado el ${formatSubscriberDate(treatmentAuthorization.capturedAt)}`
          ) : (
            <span className={emptyValueClassName}>Sin autorización registrada</span>
          )}
        </Field>
        <Field label="Solicitudes abiertas">
          {openRequests.length > 0 ? (
            pluralize(openRequests.length, 'solicitud', 'solicitudes')
          ) : (
            <span className={emptyValueClassName}>Ninguna</span>
          )}
        </Field>
      </dl>
      <GoToTab label="Ver cumplimiento" onClick={() => onNavigate('cumplimiento')} />
    </PortalPanel>
  ) : null;

  // Dos columnas independientes: cada una crece según su contenido, sin huecos por fila.
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        {servicesPanel}
        {contactPanel}
      </div>
      <div className="space-y-6">
        {billingPanel}
        {originPanel}
        {privacyPanel}
      </div>
    </div>
  );
}
