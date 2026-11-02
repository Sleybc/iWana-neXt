'use client';

import { CustomerSegment } from '@iwana/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ModalLayer, cn, overlayEdgeClassName } from '@iwana/ui';
import { ApiError, commercialApi, contractsApi, mapPickerSearchResponse } from '@/lib/api-client';
import type { Contract, PlanCatalogItem } from '@/lib/api-client';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { SearchablePicker, type SearchablePickerItem } from '@/components/shared/SearchablePicker';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import { useContractPlan } from './use-contract-plan';

type PlanSummary = Pick<
  ReturnType<typeof useContractPlan>,
  'name' | 'price' | 'technology' | 'downloadSpeedMbps' | 'uploadSpeedMbps'
>;

const TECHNOLOGY_LABELS: Record<string, string> = {
  FTTH: 'Fibra óptica',
  FIBER: 'Fibra óptica',
  WIRELESS: 'Inalámbrico',
  HFC: 'Cable híbrido',
};

/** Mantiene la misma lectura comercial en el detalle y la comparación. */
export function ContractPlanSummary({ plan }: { plan: PlanSummary }) {
  return (
    <div className="min-w-0 space-y-1 text-sm text-gray-700 dark:text-gray-300">
      <p className="break-words font-semibold text-gray-900 dark:text-white">{plan.name}</p>
      <p>
        {plan.technology && TECHNOLOGY_LABELS[plan.technology]
          ? `Tecnología: ${TECHNOLOGY_LABELS[plan.technology]}`
          : 'Tecnología no especificada'}
      </p>
      <p
        className="tabular-nums"
        aria-label={`Bajada: ${plan.downloadSpeedMbps ?? 'no disponible'} Mbps. Subida: ${plan.uploadSpeedMbps ?? 'no disponible'} Mbps`}
      >
        {plan.downloadSpeedMbps !== undefined && `↓ ${plan.downloadSpeedMbps} Mbps`}
        {plan.downloadSpeedMbps !== undefined && plan.uploadSpeedMbps !== undefined && ' · '}
        {plan.uploadSpeedMbps !== undefined && `↑ ${plan.uploadSpeedMbps} Mbps`}
        {plan.downloadSpeedMbps === undefined &&
          plan.uploadSpeedMbps === undefined &&
          'Velocidad no disponible'}
      </p>
      <p className="tabular-nums">
        {plan.price !== undefined
          ? `${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(plan.price)}/mes`
          : 'Precio no disponible'}
      </p>
    </div>
  );
}

async function searchPlans(query: string, signal: AbortSignal) {
  return mapPickerSearchResponse(
    await commercialApi.searchPlansForPicker({ q: query, isActive: true }, { signal }),
  );
}

interface Props {
  contract: Contract;
  customerSegment: CustomerSegment;
  onClose: () => void;
  onUpdated: (contract: Contract, changed: boolean) => void;
}

export function ChangeContractPlanDialog({ contract, customerSegment, onClose, onUpdated }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const currentPlan = useContractPlan(contract);
  const [selection, setSelection] = useState<SearchablePickerItem | null>(() =>
    contract.planId ? { id: contract.planId, label: currentPlan.name } : null,
  );
  const selectedItem = useMemo(
    () =>
      selection?.id === contract.planId ? { ...selection, label: currentPlan.name } : selection,
    [selection, contract.planId, currentPlan.name],
  );
  const [resolved, setResolved] = useState<PlanCatalogItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [detailError, setDetailError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);
  const close = () => {
    if (!saving) onClose();
  };
  usePortalSideDrawerA11y(true, panelRef, close);

  // La limpieza invalida respuestas anteriores incluso si la petición no admite abortar.
  useEffect(() => {
    setResolved(null);
    setDetailError(false);
    if (!selection || selection.id === contract.planId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      commercialApi.getPlanById(selection.id),
      commercialApi.getPlanPrice(selection.id, customerSegment).catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 404) return null;
        throw cause;
      }),
    ]).then(
      ([plan, price]) => {
        if (!cancelled) {
          const amount =
            price == null || String(price.basePrice).trim() === '' ? null : Number(price.basePrice);
          setResolved({
            ...plan,
            basePrice: amount != null && Number.isFinite(amount) && amount >= 0 ? amount : null,
          });
          setLoading(false);
        }
      },
      () => {
        if (!cancelled) {
          setDetailError(true);
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selection, contract.planId, customerSegment, retry]);

  const available = resolved?.id === selection?.id && resolved?.isActive;
  const hasPrice =
    resolved?.basePrice != null && Number.isFinite(resolved.basePrice) && resolved.basePrice >= 0;
  const canConfirm =
    available &&
    hasPrice &&
    !loading &&
    !detailError &&
    !saving &&
    !stale &&
    !priceChanged &&
    selection?.id !== contract.planId;

  async function confirm() {
    if (!canConfirm || !selection || resolved?.basePrice == null) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await contractsApi.changePlan(contract.id, {
        planId: selection.id,
        expectedUpdatedAt: contract.updatedAt,
        expectedMonthlyPrice: resolved.basePrice,
      });
      onUpdated(updated, true);
      onClose();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'CONTRACT_CHANGED') {
        setStale(true);
        setError(
          'El contrato cambió mientras lo revisabas. Actualiza los datos y revisa el plan antes de confirmar.',
        );
      } else if (cause instanceof ApiError && cause.code === 'PLAN_PRICE_CHANGED') {
        setPriceChanged(true);
        setError(
          'La tarifa del plan cambió. Actualiza el precio y revísalo antes de confirmar nuevamente.',
        );
      } else {
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'No fue posible cambiar el plan. Reintenta conservando tu selección.',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function reload() {
    setSaving(true);
    try {
      const updated = await contractsApi.getById(contract.id);
      onUpdated(updated, false);
      onClose();
    } catch {
      setError('No fue posible actualizar los datos. Reintenta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalLayer align="center" onVeilClick={close}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-contract-plan-title"
        aria-describedby="change-contract-plan-description"
        className={cn(
          overlayEdgeClassName,
          'relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-iwana-active outline-none dark:bg-dark-surface-2',
        )}
      >
        <div className="border-b border-gray-100 px-6 py-5 dark:border-dark-border">
          <h2
            id="change-contract-plan-title"
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            Cambiar plan
          </h2>
          <p
            id="change-contract-plan-description"
            className="mt-2 text-sm text-gray-600 dark:text-gray-300"
          >
            El nuevo plan se aplicará inmediatamente. Las facturas ya emitidas conservarán sus
            valores.
          </p>
        </div>
        <div className="space-y-5 overflow-y-auto px-6 py-5 md:overflow-visible">
          <section aria-labelledby="current-plan-title">
            <h3
              id="current-plan-title"
              className="mb-2 text-sm font-semibold text-gray-900 dark:text-white"
            >
              Plan actual
            </h3>
            <ContractPlanSummary plan={currentPlan} />
          </section>
          {currentPlan.loading ? (
            <div role="status" aria-label="Cargando plan actual">
              <PortalSkeletonBlock className="h-12 w-full" />
            </div>
          ) : (
            <SearchablePicker
              id="change-contract-plan-picker"
              resource={{ singular: 'plan', plural: 'planes' }}
              label="Nuevo plan"
              value={selection?.id ?? null}
              selectedItem={selectedItem}
              onSearch={searchPlans}
              disabled={saving || stale}
              onChange={(item) => {
                setSelection(item);
                setPriceChanged(false);
                setError(null);
              }}
            />
          )}
          {loading ? (
            <div role="status" aria-label="Cargando detalle del plan">
              <PortalSkeletonBlock className="h-20 w-full" />
            </div>
          ) : null}
          {detailError ? (
            <PortalAlert
              variant="error"
              title="No fue posible cargar el plan seleccionado"
              description="El plan actual se conserva. Reintenta para revisar el nuevo plan."
            />
          ) : null}
          {detailError ? (
            <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>
              Reintentar
            </Button>
          ) : null}
          {resolved && selection?.id === resolved.id && !loading ? (
            <section aria-labelledby="selected-plan-title">
              <h3
                id="selected-plan-title"
                className="mb-2 text-sm font-semibold text-gray-900 dark:text-white"
              >
                Plan seleccionado
              </h3>
              <ContractPlanSummary
                plan={{
                  name: resolved.name,
                  technology: resolved.technology,
                  price: resolved.basePrice ?? undefined,
                  downloadSpeedMbps: resolved.downloadSpeedMbps,
                  uploadSpeedMbps: resolved.uploadSpeedMbps,
                }}
              />
              {!available ? (
                <PortalAlert
                  variant="warning"
                  title="Este plan ya no está disponible. Elige otro."
                />
              ) : !hasPrice ? (
                <PortalAlert
                  variant="warning"
                  title="Este plan no tiene una tarifa vigente. Elige otro."
                />
              ) : null}
            </section>
          ) : null}
        </div>
        <div className="space-y-3 border-t border-gray-100 px-6 py-4 dark:border-dark-border">
          {error ? (
            <PortalAlert
              variant="error"
              title="No fue posible cambiar el plan"
              description={error}
              live="assertive"
            />
          ) : null}
          {priceChanged ? (
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setPriceChanged(false);
                setError(null);
                setResolved(null);
                setRetry((value) => value + 1);
              }}
            >
              Actualizar precio del plan
            </Button>
          ) : null}
          {stale ? (
            <Button
              variant="secondary"
              loading={saving}
              disabled={saving}
              onClick={() => void reload()}
            >
              Actualizar datos del contrato
            </Button>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="secondary" disabled={saving} onClick={close}>
              Cancelar
            </Button>
            <Button loading={saving} disabled={!canConfirm} onClick={() => void confirm()}>
              Confirmar cambio de plan
            </Button>
          </div>
        </div>
      </div>
    </ModalLayer>
  );
}
