'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { FormStatus, ModalLayer, overlayEdgeClassName, cn } from '@iwana/ui';
import type { Subscriber360Response } from '@/lib/api-client';
import { ApiError, commercialApi, contractsApi, mapPickerSearchResponse } from '@/lib/api-client';
import { usePortalModalDrawerBroadcast } from '@/components/shared/use-portal-modal-drawer-broadcast';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import { SearchablePicker, type SearchablePickerItem } from '@/components/shared/SearchablePicker';

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
  // Estos diálogos se montan/desmontan desde el padre, así que su apertura es su
  // propia presencia: se difunde `true` mientras vivan y el hook libera el estado
  // al desmontar. Sin esto el chrome queda bajo el velo pero NO inerte y el foco
  // escapa (mismo defecto que M9 corrigió en `PortalSidePeek`).
  usePortalModalDrawerBroadcast(true);

  const [error, setError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    expedienteSummary.interestedPlanId ?? null,
  );
  const [selectedPlanItem, setSelectedPlanItem] = useState<Pick<
    SearchablePickerItem,
    'label' | 'sublabel'
  > | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Escape, trampa de foco, foco inicial y retorno al disparador. Es
  // PRERREQUISITO del velo, no un extra: el velo dejó de ser un `<button>`
  // etiquetado, así que Escape y el botón «Cerrar» de la cabecera son el único
  // affordance de cierre para teclado y AT (contrato del velo §2). Escape
  // replica ese botón, que aquí cierra sin guarda.
  usePortalSideDrawerA11y(true, dialogRef, onClose);

  useEffect(() => {
    const planId = expedienteSummary.interestedPlanId;
    if (!planId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const plan = await commercialApi.getPlanById(planId);
        if (!cancelled) {
          setSelectedPlanItem({
            label: plan.name,
            sublabel: `${plan.technology} · ↓${plan.downloadSpeedMbps}Mbps · ↑${plan.uploadSpeedMbps}Mbps`,
          });
        }
      } catch {
        // El picker sigue usable; solo falta el label del plan del expediente.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expedienteSummary.interestedPlanId]);

  const searchPlans = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await commercialApi.searchPlansForPicker(
      { q: query, isActive: true },
      { signal },
    );
    return mapPickerSearchResponse(response);
  }, []);

  const handleConvert = async () => {
    setLoading(true);
    setError(null);
    try {
      await contractsApi.createFromExpediente(subscriberId, {
        expedienteId: expedienteSummary.id,
      });
      await onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible convertir la oportunidad.');
    } finally {
      setLoading(false);
    }
  };

  // Capa única ADR-075 **portalada a `document.body`** (enmienda C-DS-04 §2bis):
  // velo y diálogo comparten UNA capa `--z-modal`, por encima del chrome. El
  // velo vive dentro de la capa y el panel es hermano posterior posicionado:
  // pinta sobre el velo por orden de documento.
  //
  // Velo /40 → /45 (token `--color-veil`): el /40 fallaba WCAG 1.4.11 con
  // 2,85:1 entre el borde del panel blanco y el fondo velado.
  return (
    <ModalLayer align="center" className="p-4" onVeilClick={onClose}>
      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-dialog-title"
        className={cn(
          overlayEdgeClassName,
          'border relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl outline-none dark:bg-dark-surface-2',
        )}
      >
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
              Se creará un contrato en estado <strong>Borrador</strong> con los datos de la
              oportunidad.
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
          <SearchablePicker
            label="Confirmar plan de conectividad"
            resource={{ singular: 'plan', plural: 'planes' }}
            value={selectedPlanId}
            selectedItem={selectedPlanItem}
            onChange={(item) => {
              setSelectedPlanId(item?.id ?? null);
              setSelectedPlanItem(item ? { label: item.label, sublabel: item.sublabel } : null);
            }}
            onSearch={searchPlans}
            placeholder="Buscar plan (opcional)…"
            disabled={loading}
          />
        </div>

        {/* Error */}
        <FormStatus status={error ? 'error' : 'idle'} message={error ?? undefined} />

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
    </ModalLayer>
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
