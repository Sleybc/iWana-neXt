'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Plus, Wifi } from 'lucide-react';
import { Button } from '@iwana/ui';
import { AccessPermissionKey } from '@iwana/shared';
import type { LifecycleAction } from '@iwana/shared';
import type { Contract, ContractStatus, Subscriber360Response } from '@/lib/api-client';
import { ApiError, commercialApi, contractsApi } from '@/lib/api-client';
import { ContractCard } from './ContractCard';
import { ContractDetailDrawer } from './ContractDetailDrawer';
import { ConvertExpedienteToContractDialog } from './ConvertExpedienteToContractDialog';
import { CreateContractDialog } from './CreateContractDialog';
import { ActivateServiceDialog } from './ActivateServiceDialog';
import { useBillingCycles } from './use-billing-cycles';
import { usePermissions } from '@/components/access-control/permissions-context';
import {
  PortalAlert,
  PortalEmptyState,
  PortalFilterChip,
  PortalPanel,
  interactiveFocusClassName,
  portalWellClassName,
} from '@/components/shared/portal-ui';

// ── Tipos y constantes ────────────────────────────────────────────────────────

type FilterChip = 'todos' | 'activos' | 'borradores' | 'suspendidos' | 'terminados' | 'archivados';

const CHIP_LABELS: Record<FilterChip, string> = {
  todos: 'Todos',
  activos: 'Activos',
  borradores: 'Borradores',
  suspendidos: 'Suspendidos',
  terminados: 'Terminados',
  archivados: 'Archivados',
};

const CHIP_STATUSES: Record<FilterChip, ContractStatus[] | null> = {
  todos: null, // null = todos excepto ARCHIVED (default)
  activos: ['ACTIVE'],
  borradores: ['DRAFT'],
  suspendidos: ['SUSPENDED'],
  terminados: ['TERMINATED'],
  archivados: ['ARCHIVED'],
};

/** Parámetro de URL del filtro: recargar o compartir el enlace conserva el estado elegido. */
const FILTER_PARAM = 'estado';

function isFilterChip(value: string | null): value is FilterChip {
  return value !== null && Object.prototype.hasOwnProperty.call(CHIP_LABELS, value);
}

function readFilterFromUrl(): FilterChip {
  if (typeof window === 'undefined') return 'todos';
  const value = new URLSearchParams(window.location.search).get(FILTER_PARAM);
  return isFilterChip(value) ? value : 'todos';
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ServiciosTabProps {
  subscriber360: Subscriber360Response;
  onReload: () => Promise<void>;
  onOpenLifecycle: (action: LifecycleAction, contractId?: string) => void;
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ServiciosTab({ subscriber360, onReload, onOpenLifecycle }: ServiciosTabProps) {
  const { subscriber, contracts, expedienteSummary } = subscriber360;
  const { hasPermission } = usePermissions();
  const canReadPrivacy = hasPermission(AccessPermissionKey.PRIVACY_READ);
  const privacyRestricted = subscriber.privacyRestricted;

  const [activeChip, setActiveChipState] = useState<FilterChip>(readFilterFromUrl);
  // replaceState mantiene el historial limpio; Next.js lo sincroniza con useSearchParams, así
  // que cambiar de pestaña en la ficha conserva el filtro.
  const setActiveChip = (chip: FilterChip) => {
    setActiveChipState(chip);
    const url = new URL(window.location.href);
    if (chip === 'todos') url.searchParams.delete(FILTER_PARAM);
    else url.searchParams.set(FILTER_PARAM, chip);
    window.history.replaceState(window.history.state, '', url);
  };
  const [showExpedientePanel, setShowExpedientePanel] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [activatingContract, setActivatingContract] = useState<Contract | null>(null);
  const [activationFocusId, setActivationFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (
      !activationFocusId ||
      !contracts.some(
        (contract) => contract.id === activationFocusId && contract.status === 'ACTIVE',
      )
    )
      return;
    const card = document.getElementById(`subscriber-contract-${activationFocusId}`);
    if (card) {
      card.focus();
      setActivationFocusId(null);
    }
  }, [contracts, activationFocusId]);
  const billingCycles = useBillingCycles();
  const [transitionError, setTransitionError] = useState<{
    title: string;
    description: string;
    action?: 'dismiss';
  } | null>(null);

  // Resolución puntual por ID (sin soft-cap / prefetch de catálogo).
  const [planNameById, setPlanNameById] = useState<Record<string, string>>({});
  const [productNameById, setProductNameById] = useState<Record<string, string>>({});
  const [serviceNameById, setServiceNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    const planIds = new Set<string>();
    const productIds = new Set<string>();
    const serviceIds = new Set<string>();

    if (expedienteSummary?.interestedPlanId) {
      planIds.add(expedienteSummary.interestedPlanId);
    }
    for (const id of expedienteSummary?.additionalProductIds ?? []) {
      productIds.add(id);
    }
    for (const id of expedienteSummary?.additionalServiceIds ?? []) {
      serviceIds.add(id);
    }

    if (planIds.size === 0 && productIds.size === 0 && serviceIds.size === 0) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const planEntries = await Promise.all(
        [...planIds].map(async (id) => {
          try {
            const plan = await commercialApi.getPlanById(id);
            return [
              id,
              `${plan.name} (${plan.technology} · ${plan.downloadSpeedMbps}/${plan.uploadSpeedMbps} Mbps)`,
            ] as const;
          } catch {
            return [id, id] as const;
          }
        }),
      );

      const productEntries = await Promise.all(
        [...productIds].map(async (id) => {
          try {
            const item = await commercialApi.getCatalogItemById(id);
            return [id, item.name] as const;
          } catch {
            return [id, id] as const;
          }
        }),
      );

      const serviceEntries = await Promise.all(
        [...serviceIds].map(async (id) => {
          try {
            const item = await commercialApi.getCatalogItemById(id);
            return [id, item.name] as const;
          } catch {
            return [id, id] as const;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      setPlanNameById(Object.fromEntries(planEntries));
      setProductNameById(Object.fromEntries(productEntries));
      setServiceNameById(Object.fromEntries(serviceEntries));
    })();

    return () => {
      cancelled = true;
    };
  }, [expedienteSummary]);

  /** Resuelve un ID de plan a su nombre legible. */
  const resolvePlanName = (id: string | null): string => {
    if (!id) return '—';
    return planNameById[id] ?? id;
  };

  /** Resuelve una lista de IDs de productos a nombres legibles. */
  const resolveProductNames = (ids: string[]): string => {
    if (!ids.length) return '—';
    const names = ids.map((id) => productNameById[id]).filter(Boolean);
    return names.length ? names.join(', ') : '—';
  };

  /** Resuelve una lista de IDs de servicios a nombres legibles. */
  const resolveServiceNames = (ids: string[]): string => {
    if (!ids.length) return '—';
    const names = ids.map((id) => serviceNameById[id]).filter(Boolean);
    return names.length ? names.join(', ') : '—';
  };

  // ── Filtrado de contratos ─────────────────────────────────────────────────
  const filteredContracts = contracts.filter((c) => {
    const allowed = CHIP_STATUSES[activeChip];
    if (allowed === null) {
      // "Todos" excluye ARCHIVED por defecto
      return c.status !== 'ARCHIVED';
    }
    return allowed.includes(c.status);
  });

  // ── Acciones de transición ────────────────────────────────────────────────
  const handleTransition = async (
    id: string,
    action: 'activate' | 'suspend' | 'reactivate' | 'terminate' | 'archive',
  ) => {
    setTransitionError(null);
    if (action === 'activate') {
      const contract = contracts.find((item) => item.id === id);
      if (contract) setActivatingContract(contract);
      return;
    }
    if (action === 'suspend' || action === 'reactivate' || action === 'terminate') {
      onOpenLifecycle(
        action === 'suspend' ? 'SUSPEND' : action === 'reactivate' ? 'REACTIVATE' : 'TERMINATE',
        id,
      );
      return;
    }

    try {
      await contractsApi[action](id);
      await onReload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'SUBSCRIBER_CANCELLED') {
        setTransitionError({
          title: 'No puedes crear ni activar servicios',
          description: 'No puedes crear ni activar servicios para un suscriptor cancelado.',
          action: 'dismiss',
        });
        return;
      }
      const message = err instanceof ApiError ? err.message : 'Error al cambiar estado.';
      setTransitionError({
        title: 'No fue posible cambiar el servicio',
        description: message,
      });
    }
  };

  const handleRemove = async (id: string) => {
    setTransitionError(null);
    try {
      await contractsApi.remove(id);
      await onReload();
    } catch (err) {
      setTransitionError({
        title: 'No fue posible eliminar el borrador',
        description: err instanceof ApiError ? err.message : 'Error al eliminar el servicio.',
      });
    }
  };

  // ── Caso: sin contratos y con expediente con plan de interés ─────────────
  const canConvertFromExpediente =
    contracts.length === 0 && (expedienteSummary?.interestedPlanId ?? null) !== null;

  // ── Conteos por estado: solo se ofrecen los chips con servicios ──────────
  const chipCounts = Object.fromEntries(
    (Object.keys(CHIP_LABELS) as FilterChip[]).map((chip) => {
      const allowed = CHIP_STATUSES[chip];
      return [
        chip,
        contracts.filter((c) =>
          allowed === null ? c.status !== 'ARCHIVED' : allowed.includes(c.status),
        ).length,
      ];
    }),
  ) as Record<FilterChip, number>;
  const stateChips = (Object.keys(CHIP_LABELS) as FilterChip[]).filter(
    (chip) => chip !== 'todos' && chipCounts[chip] > 0,
  );
  // Con un solo estado el filtro no aporta nada: la fila se oculta.
  const showChips = stateChips.length > 1;

  const addServiceButton = (variant: 'primary' | 'secondary') => (
    <Button
      type="button"
      variant={variant}
      className="min-h-11 gap-1.5"
      onClick={() => setShowCreateDialog(true)}
    >
      <Plus className="h-4 w-4" aria-hidden />
      Agregar servicio
    </Button>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PortalPanel
        as="section"
        labelled
        title="Servicios contratados"
        description="Estado, plan y precio de cada servicio del suscriptor."
        actions={
          contracts.length > 0 && !privacyRestricted ? addServiceButton('secondary') : undefined
        }
        contentClassName="space-y-4"
      >
        {/* Hay servicios, pero ninguno vigente (el vacío ya lo dice cuando no hay ninguno). */}
        {contracts.length > 0 && subscriber.hasLiveContracts === false && (
          <PortalAlert
            variant="info"
            live="off"
            title="Sin servicios vigentes"
            description="Ningún servicio está activo ni suspendido."
          />
        )}
        {transitionError && (
          <PortalAlert
            variant="error"
            live="assertive"
            title={transitionError.title}
            description={transitionError.description}
            action={
              transitionError.action ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11"
                  onClick={() => setTransitionError(null)}
                >
                  Cerrar
                </Button>
              ) : undefined
            }
          />
        )}
        {billingCycles.error ? (
          <PortalAlert
            variant="error"
            title="No pudimos cargar los ciclos de facturación"
            action={
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={billingCycles.retry}
              >
                Reintentar
              </Button>
            }
          />
        ) : null}

        {/* Sin servicios: oportunidad con plan → crear con ese plan; si no, primer servicio. */}
        {contracts.length === 0 && privacyRestricted && (
          <PortalEmptyState
            embedded
            icon={Wifi}
            title="Los servicios de este suscriptor no se pueden consultar"
            description="Sus datos están bloqueados por una solicitud de privacidad."
          />
        )}
        {canConvertFromExpediente && !privacyRestricted && (
          <PortalEmptyState
            embedded
            icon={FileText}
            title="Hay un plan de interés listo para contratar"
            description={`${resolvePlanName(expedienteSummary?.interestedPlanId ?? null)} quedó registrado en la oportunidad. Crea el servicio con ese plan.`}
            action={
              <Button type="button" className="min-h-11" onClick={() => setShowConvertDialog(true)}>
                Crear servicio con este plan
              </Button>
            }
          />
        )}
        {contracts.length === 0 && !canConvertFromExpediente && !privacyRestricted && (
          <PortalEmptyState
            embedded
            icon={Wifi}
            title="Este suscriptor aún no tiene servicios"
            description="Agrega el primer servicio para empezar a prestarle internet y facturarle."
            action={addServiceButton('primary')}
          />
        )}

        {/* Interés de la oportunidad (solo lectura), solo antes del primer servicio. */}
        {expedienteSummary && !privacyRestricted && contracts.length === 0 && (
          <div className={portalWellClassName}>
            <button
              type="button"
              aria-expanded={showExpedientePanel}
              onClick={() => setShowExpedientePanel((prev) => !prev)}
              className={`flex min-h-11 w-full items-center gap-3 text-left ${interactiveFocusClassName}`}
            >
              <FileText className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
              <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                Interés comercial de la oportunidad
              </span>
              {showExpedientePanel ? (
                <ChevronUp className="h-4 w-4 text-gray-400" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden />
              )}
            </button>

            {showExpedientePanel && (
              <dl className="mt-3 grid grid-cols-1 gap-3 border-t border-gray-200 pt-3 sm:grid-cols-2 dark:border-dark-border">
                <ExpedienteField
                  label="Plan de interés"
                  value={resolvePlanName(expedienteSummary.interestedPlanId)}
                />
                {(expedienteSummary.additionalProductIds?.length ?? 0) > 0 && (
                  <ExpedienteField
                    label="Productos adicionales"
                    value={resolveProductNames(expedienteSummary.additionalProductIds ?? [])}
                  />
                )}
                {(expedienteSummary.additionalServiceIds?.length ?? 0) > 0 && (
                  <ExpedienteField
                    label="Servicios adicionales"
                    value={resolveServiceNames(expedienteSummary.additionalServiceIds ?? [])}
                  />
                )}
                {expedienteSummary.commercialNotes && (
                  <div className="sm:col-span-2">
                    <ExpedienteField
                      label="Notas comerciales"
                      value={expedienteSummary.commercialNotes}
                    />
                  </div>
                )}
              </dl>
            )}
          </div>
        )}

        {/* Lista de servicios */}
        {contracts.length > 0 && (
          <>
            {showChips && (
              <div
                role="group"
                aria-label="Filtrar servicios por estado"
                className="flex flex-wrap gap-2"
              >
                {(['todos', ...stateChips] as FilterChip[]).map((chip) => (
                  <PortalFilterChip
                    key={chip}
                    active={activeChip === chip}
                    onClick={() => setActiveChip(chip)}
                    count={chipCounts[chip]}
                    className="min-h-11"
                  >
                    {CHIP_LABELS[chip]}
                  </PortalFilterChip>
                ))}
              </div>
            )}

            {filteredContracts.length === 0 ? (
              <PortalEmptyState
                embedded
                title="No hay servicios en este estado"
                description={
                  activeChip === 'todos'
                    ? 'Todos los servicios de este suscriptor están archivados.'
                    : 'Cambia el filtro para ver los demás servicios.'
                }
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    onClick={() => setActiveChip(activeChip === 'todos' ? 'archivados' : 'todos')}
                  >
                    {activeChip === 'todos' ? 'Ver archivados' : 'Ver todos'}
                  </Button>
                }
              />
            ) : (
              // Dos columnas desde xl: con el sidebar, en lg cada tarjeta quedaría muy angosta.
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {filteredContracts.map((contract) => (
                  <ContractCard
                    key={contract.id}
                    contract={contract}
                    billingCycles={billingCycles.cycles}
                    billingCyclesLoading={billingCycles.loading}
                    onTransition={handleTransition}
                    onRemove={handleRemove}
                    onViewDetail={setSelectedContract}
                    privacyRestricted={privacyRestricted}
                    anonymizedRequestId={subscriber.anonymizedRequestId}
                    canReadPrivacy={canReadPrivacy}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </PortalPanel>

      {/* Drawer de detalle del contrato */}
      {selectedContract && (
        <ContractDetailDrawer
          contract={selectedContract}
          billingCycles={billingCycles.cycles}
          billingCyclesLoading={billingCycles.loading}
          billingCyclesError={billingCycles.error}
          onRetryBillingCycles={billingCycles.retry}
          customerSegment={subscriber.customerSegment}
          personType={subscriber.personType}
          privacyRestricted={privacyRestricted}
          anonymizedRequestId={subscriber.anonymizedRequestId}
          canReadPrivacy={canReadPrivacy}
          onClose={() => setSelectedContract(null)}
          onReload={async () => {
            await onReload();
          }}
          onContractUpdated={setSelectedContract}
          onOpenLifecycle={(action, contractId) => {
            setSelectedContract(null);
            onOpenLifecycle(action, contractId);
          }}
          onActivate={(contract) => {
            setSelectedContract(null);
            setActivatingContract(contract);
          }}
          onRemove={async (id) => {
            await handleRemove(id);
          }}
        />
      )}

      {activatingContract ? (
        <ActivateServiceDialog
          contract={activatingContract}
          onClose={() => setActivatingContract(null)}
          onSuccess={async () => {
            setActivationFocusId(activatingContract.id);
            setActiveChip('todos');
            setActivatingContract(null);
            await onReload();
          }}
        />
      ) : null}

      {/* Diálogo crear nuevo contrato */}
      {showCreateDialog && !privacyRestricted && (
        <CreateContractDialog
          subscriberId={subscriber.id}
          personType={subscriber.personType}
          onClose={() => setShowCreateDialog(false)}
          onSuccess={async () => {
            setShowCreateDialog(false);
            await onReload();
          }}
        />
      )}

      {/* Diálogo convertir expediente a contrato */}
      {showConvertDialog && expedienteSummary && !privacyRestricted && (
        <ConvertExpedienteToContractDialog
          subscriberId={subscriber.id}
          personType={subscriber.personType}
          expedienteSummary={expedienteSummary}
          onClose={() => setShowConvertDialog(false)}
          onSuccess={async () => {
            setShowConvertDialog(false);
            await onReload();
          }}
        />
      )}
    </div>
  );
}

// ── Subcomponente campo expediente ────────────────────────────────────────────

function ExpedienteField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{value}</dd>
    </div>
  );
}
