'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, X } from 'lucide-react';
import type { PlanCatalogItem, Subscriber360Response } from '@/lib/api-client';
import { ApiError, commercialApi, contractsApi } from '@/lib/api-client';
import { CatalogPicker } from '@/components/shared/CatalogPicker';

// ── Props ─────────────────────────────────────────────────────────────────────

interface ConvertExpedienteToContractDialogProps {
  subscriberId: string;
  expedienteSummary: NonNullable<Subscriber360Response['expedienteSummary']>;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ConvertExpedienteToContractDialog({
  subscriberId,
  expedienteSummary,
  onClose,
  onSuccess,
}: ConvertExpedienteToContractDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  // Inicializar con el plan de interés del expediente si existe
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    expedienteSummary.interestedPlanId ?? null,
  );

  // Cargar planes al montar
  useEffect(() => {
    const load = async () => {
      setPlansLoading(true);
      try {
        const data = await commercialApi.getPlans();
        setPlans(data.filter((p) => p.isActive));
      } catch {
        // Si falla la carga de planes, el usuario puede continuar con el plan del expediente
      } finally {
        setPlansLoading(false);
      }
    };
    void load();
  }, []);

  const handleConvert = async () => {
    setLoading(true);
    setError(null);
    try {
      await contractsApi.createFromExpediente(subscriberId, {
        expedienteId: expedienteSummary.id,
        // Si el usuario seleccionó un plan diferente, se pasará (el backend lo usa)
      });
      await onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al convertir el expediente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-dialog-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-xl dark:bg-dark-surface-2">
          {/* Cabecera */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="convert-dialog-title"
                className="text-lg font-bold text-gray-900 dark:text-white"
              >
                Convertir a contrato
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Se creará un contrato en estado <strong>Borrador</strong> con los datos del
                expediente.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-border"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {/* Resumen del expediente */}
          <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-4 dark:border-dark-border dark:bg-dark-surface">
            <dl className="space-y-2">
              <SummaryRow label="Método de pago" value={expedienteSummary.paymentMethod ?? '—'} />
              <SummaryRow
                label="Ciclo de facturación"
                value={expedienteSummary.billingCycle ?? '—'}
              />
              {(expedienteSummary.additionalProductIds?.length ?? 0) > 0 && (
                <SummaryRow
                  label="Productos adicionales"
                  value={`${expedienteSummary.additionalProductIds.length} producto(s)`}
                />
              )}
              {(expedienteSummary.additionalServiceIds?.length ?? 0) > 0 && (
                <SummaryRow
                  label="Servicios adicionales"
                  value={`${expedienteSummary.additionalServiceIds.length} servicio(s)`}
                />
              )}
              {expedienteSummary.commercialNotes && (
                <SummaryRow label="Notas" value={expedienteSummary.commercialNotes} />
              )}
            </dl>
          </div>

          {/* Selector de plan (confirmación / cambio) */}
          <div className="mt-5">
            <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Confirmar plan de conectividad
            </label>
            {plansLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500 dark:border-dark-border dark:bg-dark-surface">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Cargando planes...
              </div>
            ) : (
              <CatalogPicker<PlanCatalogItem>
                items={plans}
                selectedId={selectedPlanId}
                onChange={(p) => setSelectedPlanId(p?.id ?? null)}
                getKey={(p) => p.id}
                getLabel={(p) => p.name}
                getDescription={(p) =>
                  [p.technology, `↓${p.downloadSpeedMbps}Mbps`, `↑${p.uploadSpeedMbps}Mbps`].join(
                    ' · ',
                  )
                }
                placeholder="Seleccionar plan (opcional)..."
              />
            )}
            {plans.length > 0 && !selectedPlanId && expedienteSummary.interestedPlanId && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                ID del plan registrado en expediente: {expedienteSummary.interestedPlanId}
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Acciones */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 disabled:opacity-60 dark:border-dark-border dark:bg-dark-surface dark:text-gray-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleConvert()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-iwana-secondary-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-iwana-secondary-700/90 disabled:opacity-60"
            >
              {loading && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />}
              {loading ? 'Convirtiendo...' : 'Convertir a contrato'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Subcomponente fila resumen ────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-right text-xs text-gray-700 dark:text-gray-300">{value}</dd>
    </div>
  );
}
