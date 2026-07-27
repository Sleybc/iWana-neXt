'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, FileText, Plus, Wifi } from 'lucide-react';
import type { Contract, ContractStatus, Subscriber360Response } from '@/lib/api-client';
import { ApiError, commercialApi, contractsApi } from '@/lib/api-client';
import { ContractCard } from './ContractCard';
import { ContractDetailDrawer } from './ContractDetailDrawer';
import { ConvertExpedienteToContractDialog } from './ConvertExpedienteToContractDialog';
import { CreateContractDialog } from './CreateContractDialog';

// ── Tipos y constantes ────────────────────────────────────────────────────────

type FilterChip = 'todos' | 'activos' | 'borradores' | 'suspendidos' | 'archivados';

const CHIP_LABELS: Record<FilterChip, string> = {
  todos: 'Todos',
  activos: 'Activos',
  borradores: 'Borradores',
  suspendidos: 'Suspendidos',
  archivados: 'Archivados',
};

const CHIP_STATUSES: Record<FilterChip, ContractStatus[] | null> = {
  todos: null, // null = todos excepto ARCHIVED (default)
  activos: ['ACTIVE'],
  borradores: ['DRAFT'],
  suspendidos: ['SUSPENDED'],
  archivados: ['ARCHIVED'],
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ServiciosTabProps {
  subscriber360: Subscriber360Response;
  onReload: () => Promise<void>;
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ServiciosTab({ subscriber360, onReload }: ServiciosTabProps) {
  const { subscriber, contracts, expedienteSummary } = subscriber360;

  const [activeChip, setActiveChip] = useState<FilterChip>('todos');
  const [showExpedientePanel, setShowExpedientePanel] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

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
    try {
      await contractsApi[action](id);
      await onReload();
    } catch (err) {
      setTransitionError(err instanceof ApiError ? err.message : 'Error al cambiar estado.');
    }
  };

  const handleRemove = async (id: string) => {
    setTransitionError(null);
    try {
      await contractsApi.remove(id);
      await onReload();
    } catch (err) {
      setTransitionError(err instanceof ApiError ? err.message : 'Error al eliminar contrato.');
    }
  };

  // ── Caso: sin contratos y con expediente con plan de interés ─────────────
  const canConvertFromExpediente =
    contracts.length === 0 && (expedienteSummary?.interestedPlanId ?? null) !== null;

  // ── Caso: sin contratos y sin expediente con plan ─────────────────────────
  const emptyNoExpediente = contracts.length === 0 && !canConvertFromExpediente;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Banner de error de transición */}
      {transitionError && (
        <div className="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span>{transitionError}</span>
          <button
            type="button"
            onClick={() => setTransitionError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
            aria-label="Cerrar error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Estado vacío — sin contratos, expediente con plan de interés */}
      {canConvertFromExpediente && (
        <div className="rounded-[20px] border border-iwana-secondary/40 bg-iwana-secondary/5 p-6 dark:border-iwana-secondary/30 dark:bg-iwana-secondary/10">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-iwana-secondary/20 text-iwana-secondary-700 dark:text-iwana-secondary-300">
              <FileText className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 dark:text-white">
                Hay interés comercial registrado
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                El expediente tiene un plan de interés. Puedes convertirlo en un contrato de
                servicio contratado.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowConvertDialog(true)}
              className="shrink-0 rounded-xl bg-iwana-secondary-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-iwana-secondary-700/90"
            >
              Convertir a contrato
            </button>
          </div>
        </div>
      )}

      {/* Estado vacío total */}
      {emptyNoExpediente && (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-gray-200 bg-white py-16 text-center dark:border-dark-border dark:bg-dark-surface-2">
          <Wifi className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" aria-hidden />
          <p className="font-medium text-gray-700 dark:text-gray-300">Sin servicios contratados</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Este suscriptor aún no tiene contratos registrados.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="mt-5 flex items-center gap-2 rounded-xl bg-iwana-secondary-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-iwana-secondary-700/90"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nuevo servicio
          </button>
        </div>
      )}

      {/* Lista de contratos */}
      {contracts.length > 0 && (
        <>
          {/* Chips de filtro */}
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(CHIP_LABELS) as FilterChip[]).map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setActiveChip(chip)}
                className={[
                  'rounded-full px-3.5 py-1 text-xs font-medium transition',
                  activeChip === chip
                    ? 'bg-iwana-secondary-700 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-surface dark:text-gray-300 dark:hover:bg-dark-border',
                ].join(' ')}
              >
                {CHIP_LABELS[chip]}
              </button>
            ))}
          </div>

          {/* Tarjetas */}
          <div className="space-y-3">
            {filteredContracts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500 dark:border-dark-border dark:text-gray-400">
                No hay contratos en este estado.
              </p>
            ) : (
              filteredContracts.map((contract) => (
                <ContractCard
                  key={contract.id}
                  contract={contract}
                  onTransition={handleTransition}
                  onRemove={handleRemove}
                  onViewDetail={setSelectedContract}
                />
              ))
            )}
          </div>

          {/* Botón agregar nuevo servicio */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-iwana-secondary-700 hover:text-iwana-secondary-700 dark:border-dark-border dark:bg-dark-surface dark:text-gray-300"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Agregar nuevo servicio
            </button>
          </div>
        </>
      )}

      {/* Panel colapsable — interés del expediente (solo lectura) */}
      {expedienteSummary && (
        <div className="rounded-[20px] border border-gray-100 bg-white shadow-[var(--shadow-sm)] dark:border-dark-border dark:bg-dark-surface-2">
          <button
            type="button"
            onClick={() => setShowExpedientePanel((prev) => !prev)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-dark-surface dark:text-gray-400">
              <FileText className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Interés comercial del expediente
            </span>
            {showExpedientePanel ? (
              <ChevronUp className="h-4 w-4 text-gray-400" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden />
            )}
          </button>

          {showExpedientePanel && (
            <div className="border-t border-gray-100 px-5 pb-5 pt-4 dark:border-dark-border">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ExpedienteField
                  label="Plan de interés"
                  value={resolvePlanName(expedienteSummary.interestedPlanId)}
                />
                {(expedienteSummary.additionalProductIds?.length ?? 0) > 0 && (
                  <ExpedienteField
                    label="Productos adicionales"
                    value={resolveProductNames(expedienteSummary.additionalProductIds)}
                  />
                )}
                {(expedienteSummary.additionalServiceIds?.length ?? 0) > 0 && (
                  <ExpedienteField
                    label="Servicios adicionales"
                    value={resolveServiceNames(expedienteSummary.additionalServiceIds)}
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
            </div>
          )}
        </div>
      )}

      {/* Drawer de detalle del contrato */}
      {selectedContract && (
        <ContractDetailDrawer
          contract={selectedContract}
          onClose={() => setSelectedContract(null)}
          onReload={async () => {
            await onReload();
          }}
          onRemove={async (id) => {
            await handleRemove(id);
          }}
        />
      )}

      {/* Diálogo crear nuevo contrato */}
      {showCreateDialog && (
        <CreateContractDialog
          subscriberId={subscriber.id}
          onClose={() => setShowCreateDialog(false)}
          onSuccess={async () => {
            setShowCreateDialog(false);
            await onReload();
          }}
        />
      )}

      {/* Diálogo convertir expediente a contrato */}
      {showConvertDialog && expedienteSummary && (
        <ConvertExpedienteToContractDialog
          subscriberId={subscriber.id}
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
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{value}</dd>
    </div>
  );
}
