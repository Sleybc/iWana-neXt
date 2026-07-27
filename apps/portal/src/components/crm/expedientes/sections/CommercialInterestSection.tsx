'use client';

import { useCallback, useEffect, useState } from 'react';
import { commercialApi, mapPickerSearchResponse } from '@/lib/api-client';
import {
  SearchableMultiPicker,
  SearchablePicker,
  type SearchablePickerItem,
} from '@/components/shared/SearchablePicker';
import { FIELD_LABELS } from './constants';
import type { DraftValues } from './types';

interface CommercialInterestSectionProps {
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

export function CommercialInterestSection({
  draftValues,
  onChange,
  saving,
}: CommercialInterestSectionProps) {
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
        const plan = await commercialApi.getPlanById(planId);
        if (!cancelled) {
          setSelectedPlanItem({
            label: plan.name,
            sublabel: planSublabel(plan),
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
  }, [planId]);

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
            const item = await commercialApi.getCatalogItemById(id);
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
  }, [draftValues.additionalProductIds]);

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
            const item = await commercialApi.getCatalogItemById(id);
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
  }, [draftValues.additionalServiceIds]);

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
            setSelectedPlanItem({ label: item.label, sublabel: item.sublabel });
            onChange('interestedPlanId', item.id);
          }}
          onSearch={searchPlans}
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
        placeholder="Buscar servicio adicional…"
        disabled={saving}
      />
    </div>
  );
}
