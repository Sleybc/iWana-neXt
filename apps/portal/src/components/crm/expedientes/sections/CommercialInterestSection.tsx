'use client';

import { useCallback, useEffect, useState } from 'react';
import { Select } from '@iwana/ui';
import { commercialApi, mapPickerSearchResponse } from '@/lib/api-client';
import {
  SearchableMultiPicker,
  SearchablePicker,
  type SearchablePickerItem,
} from '@/components/shared/SearchablePicker';
import { CUSTOMER_SEGMENT_OPTIONS, EMPTY_VALUE, FIELD_LABELS } from './constants';
import type { DraftValues } from './types';
import {
  getCachedExpedienteResource,
  resolveExpedienteCacheScope,
} from '../expediente-detail-cache';

interface CommercialInterestSectionProps {
  tenantScope?: string;
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  saving: boolean;
  onSave: () => void;
}

function parseSelectedIds(rawValue: string | undefined): string[] {
  try {
    const parsed = JSON.parse(rawValue ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function planSublabel(plan: {
  technology: string;
  downloadSpeedMbps: number;
  uploadSpeedMbps: number;
}): string {
  return `${plan.technology} · ↓${plan.downloadSpeedMbps}Mbps · ↑${plan.uploadSpeedMbps}Mbps`;
}

/** Mismo formato que las opciones del listbox (`label — sublabel`): el input muestra la info del plan seleccionado. */
function planDisplayLabel(item: { label: string; sublabel?: string | null | undefined }): string {
  const sub = item.sublabel?.trim();
  return sub ? `${item.label} — ${sub}` : item.label;
}

export function CommercialInterestSection({
  tenantScope,
  draftValues,
  onChange,
  saving,
}: CommercialInterestSectionProps) {
  const resolvedTenantScope = tenantScope ?? resolveExpedienteCacheScope();
  const planId = draftValues.interestedPlanId?.trim() || null;
  const selectedProductIds = parseSelectedIds(draftValues.additionalProductIds);
  const selectedServiceIds = parseSelectedIds(draftValues.additionalServiceIds);

  const [selectedPlanItem, setSelectedPlanItem] = useState<Pick<
    SearchablePickerItem,
    'label' | 'sublabel'
  > | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<SearchablePickerItem[]>([]);
  const [selectedServices, setSelectedServices] = useState<SearchablePickerItem[]>([]);

  useEffect(() => {
    if (!planId) {
      setSelectedPlanItem(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const plan = await getCachedExpedienteResource(
          resolvedTenantScope,
          `catalog:plan:${planId}`,
          () => commercialApi.getPlanById(planId),
        );
        if (!cancelled) {
          setSelectedPlanItem({
            label: planDisplayLabel({ label: plan.name, sublabel: planSublabel(plan) }),
            sublabel: null,
          });
        }
      } catch {
        if (!cancelled) {
          setSelectedPlanItem({ label: planId });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [planId, resolvedTenantScope]);

  useEffect(() => {
    if (selectedProductIds.length === 0) {
      setSelectedProducts([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      const items = await Promise.all(
        selectedProductIds.map(async (id) => {
          try {
            const item = await getCachedExpedienteResource(
              resolvedTenantScope,
              `catalog:item:${id}`,
              () => commercialApi.getCatalogItemById(id),
            );
            return {
              id,
              label: item.name,
              sublabel: item.description ?? null,
            } satisfies SearchablePickerItem;
          } catch {
            return { id, label: id } satisfies SearchablePickerItem;
          }
        }),
      );
      if (!cancelled) {
        setSelectedProducts(items);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Solo re-hidratar cuando cambia el set de IDs persistidos en draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedProductIds es derivado de draft
  }, [draftValues.additionalProductIds, resolvedTenantScope]);

  useEffect(() => {
    if (selectedServiceIds.length === 0) {
      setSelectedServices([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      const items = await Promise.all(
        selectedServiceIds.map(async (id) => {
          try {
            const item = await getCachedExpedienteResource(
              resolvedTenantScope,
              `catalog:item:${id}`,
              () => commercialApi.getCatalogItemById(id),
            );
            return {
              id,
              label: item.name,
              sublabel: item.description ?? null,
            } satisfies SearchablePickerItem;
          } catch {
            return { id, label: id } satisfies SearchablePickerItem;
          }
        }),
      );
      if (!cancelled) {
        setSelectedServices(items);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedServiceIds es derivado de draft
  }, [draftValues.additionalServiceIds, resolvedTenantScope]);

  const searchPlans = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await commercialApi.searchPlansForPicker(
      { q: query, isActive: true },
      { signal },
    );
    return mapPickerSearchResponse(response);
  }, []);

  const searchProducts = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await commercialApi.searchAdditionalProductsForPicker(
      { q: query, isActive: true },
      { signal },
    );
    return mapPickerSearchResponse(response);
  }, []);

  const searchServices = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await commercialApi.searchAdditionalServicesForPicker(
      { q: query, isActive: true },
      { signal },
    );
    return mapPickerSearchResponse(response);
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          id="commercial-customerSegment"
          label={FIELD_LABELS.customerSegment!}
          value={draftValues.customerSegment ?? EMPTY_VALUE}
          onChange={(event) => onChange('customerSegment', event.target.value)}
          placeholder="Selecciona una opción"
          disabled={saving}
        >
          {CUSTOMER_SEGMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <SearchablePicker
          id="commercial-interestedPlanId"
          label={FIELD_LABELS.interestedPlanId}
          resource={{ singular: 'plan', plural: 'planes' }}
          value={planId}
          selectedItem={selectedPlanItem}
          onChange={(item) => {
            if (!item) {
              setSelectedPlanItem(null);
              onChange('interestedPlanId', '');
              return;
            }
            setSelectedPlanItem({ label: planDisplayLabel(item), sublabel: null });
            onChange('interestedPlanId', item.id);
          }}
          onSearch={searchPlans}
          minChars={0}
          placeholder="Buscar plan…"
          disabled={saving}
        />
      </div>

      <SearchableMultiPicker
        label={FIELD_LABELS.additionalProductIds}
        resource={{ singular: 'producto adicional', plural: 'productos adicionales' }}
        value={selectedProducts}
        onChange={(next) => {
          setSelectedProducts(next);
          onChange('additionalProductIds', JSON.stringify(next.map((item) => item.id)));
        }}
        onSearch={searchProducts}
        minChars={0}
        placeholder="Buscar producto adicional…"
        disabled={saving}
      />

      <SearchableMultiPicker
        label={FIELD_LABELS.additionalServiceIds}
        resource={{ singular: 'servicio adicional', plural: 'servicios adicionales' }}
        value={selectedServices}
        onChange={(next) => {
          setSelectedServices(next);
          onChange('additionalServiceIds', JSON.stringify(next.map((item) => item.id)));
        }}
        onSearch={searchServices}
        minChars={0}
        placeholder="Buscar servicio adicional…"
        disabled={saving}
      />
    </div>
  );
}
