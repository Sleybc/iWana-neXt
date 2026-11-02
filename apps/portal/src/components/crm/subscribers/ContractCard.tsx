'use client';

import {
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@iwana/ui';
import { useState } from 'react';
import {
  Archive,
  CalendarDays,
  ChevronRight,
  MapPin,
  MoreVertical,
  PauseCircle,
  PlayCircle,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { BillingCycleOption, Contract, ContractStatus } from '@/lib/api-client';
import { CONTRACT_STATUS_META, formatContractAlias, formatLocationLabel } from './subscriber-ui';
import { PrivacyAnonymizedBadge } from '@/components/privacy/PrivacyAnonymizedBadge';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import { formatLifecycleDate, lifecycleReasonLabel } from './subscriber-lifecycle-ui';
import { findBillingCycle, formatBillingDate } from './billing-cycle-ui';
import { useContractPlan } from './use-contract-plan';
import {
  PortalSkeletonBlock,
  portalInlineTextLinkClassName,
  portalWellClassName,
} from '@/components/shared/portal-ui';

// ── Colores y labels por estado ───────────────────────────────────────────────

// ── Acciones disponibles por estado ──────────────────────────────────────────

type TransitionAction = 'activate' | 'suspend' | 'reactivate' | 'terminate' | 'archive';

const ACTIONS_BY_STATUS: Record<
  ContractStatus,
  Array<{ label: string; action: TransitionAction; icon: React.ReactNode }>
> = {
  DRAFT: [
    {
      label: 'Activar',
      action: 'activate',
      icon: <PlayCircle className="h-3.5 w-3.5" aria-hidden />,
    },
  ],
  ACTIVE: [
    {
      label: 'Suspender',
      action: 'suspend',
      icon: <PauseCircle className="h-3.5 w-3.5" aria-hidden />,
    },
    {
      label: 'Terminar',
      action: 'terminate',
      icon: <XCircle className="h-3.5 w-3.5" aria-hidden />,
    },
  ],
  SUSPENDED: [
    {
      label: 'Reactivar',
      action: 'reactivate',
      icon: <PlayCircle className="h-3.5 w-3.5" aria-hidden />,
    },
    {
      label: 'Terminar',
      action: 'terminate',
      icon: <XCircle className="h-3.5 w-3.5" aria-hidden />,
    },
    {
      label: 'Archivar',
      action: 'archive',
      icon: <Archive className="h-3.5 w-3.5" aria-hidden />,
    },
  ],
  TERMINATED: [
    {
      label: 'Archivar',
      action: 'archive',
      icon: <Archive className="h-3.5 w-3.5" aria-hidden />,
    },
  ],
  ARCHIVED: [],
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ContractCardProps {
  contract: Contract;
  billingCycles?: BillingCycleOption[];
  billingCyclesLoading?: boolean;
  onTransition: (id: string, action: TransitionAction) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onViewDetail: (contract: Contract) => void;
  privacyRestricted?: boolean;
  anonymizedRequestId?: string | null;
  canReadPrivacy?: boolean;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ContractCard({
  contract,
  billingCycles = [],
  billingCyclesLoading = false,
  onTransition,
  onRemove,
  onViewDetail,
  privacyRestricted = false,
  anonymizedRequestId,
  canReadPrivacy = false,
}: ContractCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const statusMeta = CONTRACT_STATUS_META[contract.status];
  // «Activar» vive como botón visible en el pie del borrador; el menú no lo repite.
  const actions = ACTIONS_BY_STATUS[contract.status].filter((item) => item.action !== 'activate');

  const handleAction = async (action: TransitionAction) => {
    setMenuOpen(false);
    setBusy(true);
    try {
      await onTransition(contract.id, action);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setMenuOpen(false);
    setBusy(true);
    try {
      await onRemove(contract.id);
    } finally {
      setBusy(false);
    }
  };

  const plan = useContractPlan(contract);
  const isArchived = contract.status === 'ARCHIVED';
  const serviceName =
    privacyRestricted || contract.titularAnonymizedAt
      ? 'servicio'
      : formatContractAlias(contract.alias) || plan.name;

  const actionServiceName =
    privacyRestricted || contract.titularAnonymizedAt
      ? null
      : formatContractAlias(contract.alias) ||
        (plan.loading || plan.name === 'Plan no disponible' ? null : plan.name);
  const actionsLabel = actionServiceName
    ? `Acciones de ${actionServiceName}`
    : 'Acciones de este servicio';

  const locationLine = [
    formatLocationLabel(contract.installationCity),
    privacyDisplayValue(contract.titularAnonymizedAt ? null : contract.installationAddress, {
      anonymizedAt: contract.titularAnonymizedAt,
      emptyValue: contract.titularAnonymizedAt ? 'Anonimizado' : '',
    }),
  ]
    .filter(Boolean)
    .join(' · ');

  const nextCutoff = findBillingCycle(billingCycles, contract.billingCycleDay);

  return (
    <div
      id={`subscriber-contract-${contract.id}`}
      tabIndex={-1}
      className={cn(
        // Pozo dentro del panel «Servicios contratados»: sin sombra (nunca card sobre card).
        portalWellClassName,
        'relative flex h-full flex-col p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary',
        isArchived && 'opacity-70',
      )}
    >
      {/* Cabecera */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Alias */}
          <p className="truncate font-semibold text-gray-900 dark:text-white">
            {privacyDisplayValue(
              privacyRestricted || contract.titularAnonymizedAt
                ? null
                : formatContractAlias(contract.alias) || null,
              {
                privacyRestricted,
                anonymizedAt: contract.titularAnonymizedAt,
              },
            )}
          </p>
          <PrivacyAnonymizedBadge
            anonymizedAt={contract.titularAnonymizedAt}
            anonymizedRequestId={anonymizedRequestId}
            canReadPrivacy={canReadPrivacy}
          />
          {/* Plan */}
          <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">{plan.name}</p>
          {/* Mientras se resuelve el plan, skeleton con la forma del dato (no texto de espera). */}
          <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            {plan.downloadSpeedMbps !== undefined || plan.uploadSpeedMbps !== undefined ? (
              <>
                {plan.downloadSpeedMbps !== undefined && `↓ ${plan.downloadSpeedMbps} Mbps`}
                {plan.downloadSpeedMbps !== undefined &&
                  plan.uploadSpeedMbps !== undefined &&
                  ' · '}
                {plan.uploadSpeedMbps !== undefined && `↑ ${plan.uploadSpeedMbps} Mbps`}
              </>
            ) : plan.loading ? (
              <>
                <PortalSkeletonBlock className="h-4 w-32 rounded-md" />
                <span className="sr-only">Cargando velocidad</span>
              </>
            ) : (
              'Velocidad no disponible'
            )}
          </div>
          <div className="mt-1 text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-200">
            {plan.price !== undefined ? (
              `${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(plan.price)}/mes`
            ) : plan.loading ? (
              <>
                <PortalSkeletonBlock className="h-5 w-24 rounded-md" />
                <span className="sr-only">Cargando precio</span>
              </>
            ) : (
              'Precio no disponible'
            )}
          </div>
          {plan.priceFromCatalog ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">Precio actual del plan</p>
          ) : null}
        </div>

        {/* Badge estado */}
        <Badge variant={statusMeta.variant} className="shrink-0">
          {statusMeta.label}
        </Badge>

        {/* Menú de acciones */}
        {!privacyRestricted && !isArchived && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                className="min-h-11 min-w-11"
                aria-label={actionsLabel}
              >
                <MoreVertical className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8}>
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action.action}
                  className="min-h-11 gap-2"
                  onClick={() => void handleAction(action.action)}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
              {contract.status === 'DRAFT' && (
                <DropdownMenuItem
                  variant="danger"
                  className="min-h-11 gap-2"
                  onClick={() => void handleRemove()}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Eliminar borrador
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Detalles */}
      {privacyRestricted ? (
        <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-300">
          Datos bloqueados
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {contract.status === 'SUSPENDED' && (
            <div className="text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">
              <p>Suspendido el {formatLifecycleDate(contract.statusChangedAt)}</p>
              <p>Motivo: {lifecycleReasonLabel(contract.statusReasonCode)}</p>
            </div>
          )}
          {locationLine && (
            <DetailLine icon={<MapPin className="h-3.5 w-3.5" />} text={locationLine} />
          )}
          {contract.status === 'ACTIVE' &&
            (contract.billingCycleDay == null ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 sm:col-span-2">
                Sin ciclo de facturación
              </p>
            ) : (
              <>
                <DetailLine
                  icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />}
                  text={`Ciclo: día ${contract.billingCycleDay}`}
                />
                {billingCyclesLoading ? (
                  <div role="status">
                    <PortalSkeletonBlock className="h-4 w-40 rounded-md" />
                    <span className="sr-only">Cargando próximo corte</span>
                  </div>
                ) : (
                  <DetailLine
                    icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />}
                    text={`Próximo corte: ${nextCutoff ? formatBillingDate(nextCutoff.nextCutoffDate) : 'no disponible'}`}
                  />
                )}
              </>
            ))}
          {contract.status === 'DRAFT' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 sm:col-span-2">
              Pendiente de activar
            </p>
          )}
        </div>
      )}

      {/* Acciones rápidas, al pie de la tarjeta */}
      <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-3">
        {contract.status === 'DRAFT' && !privacyRestricted ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11 gap-1.5"
            disabled={busy}
            onClick={() => void handleAction('activate')}
          >
            <PlayCircle className="h-4 w-4" aria-hidden />
            Activar
          </Button>
        ) : null}
        <button
          type="button"
          onClick={() => onViewDetail(contract)}
          aria-label={`Ver detalle de ${serviceName}`}
          className={cn(portalInlineTextLinkClassName, 'gap-1')}
        >
          Ver detalle
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ── Subcomponente línea de detalle ────────────────────────────────────────────

function DetailLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <span className="shrink-0 text-gray-400 dark:text-gray-400">{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  );
}
