'use client';

import { Select } from '@iwana/ui';
import { MultiCatalogPicker } from '@/components/shared/CatalogPicker';
import type { AdditionalProduct, AdditionalService, PlanCatalogItem } from '@/lib/api-client';
import { EMPTY_VALUE, FIELD_LABELS } from './constants';
import type { DraftValues } from './types';

interface CommercialInterestSectionProps {
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  saving: boolean;
  onSave: () => void;
  planCatalog: PlanCatalogItem[];
  additionalProducts: AdditionalProduct[];
  additionalServices: AdditionalService[];
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

export function CommercialInterestSection({
  draftValues,
  onChange,
  planCatalog,
  additionalProducts,
  additionalServices,
}: CommercialInterestSectionProps) {
  const selectedProductIds = parseSelectedIds(draftValues.additionalProductIds);
  const selectedServiceIds = parseSelectedIds(draftValues.additionalServiceIds);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          id="commercial-interestedPlanId"
          label={FIELD_LABELS.interestedPlanId!}
          value={draftValues.interestedPlanId ?? EMPTY_VALUE}
          onChange={(event) => onChange('interestedPlanId', event.target.value)}
          placeholder="Selecciona un plan"
        >
          <option value="">Sin plan seleccionado</option>
          {planCatalog.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-2 dark:text-gray-500">
          {FIELD_LABELS.additionalProductIds}
        </label>
        <MultiCatalogPicker
          items={additionalProducts}
          selectedIds={selectedProductIds}
          onChange={(ids) => onChange('additionalProductIds', JSON.stringify(ids))}
          getKey={(product) => product.id}
          getLabel={(product) => product.name}
          getDescription={(product) => product.description ?? product.category}
          placeholder="Selecciona productos adicionales"
        />
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-2 dark:text-gray-500">
          {FIELD_LABELS.additionalServiceIds}
        </label>
        <MultiCatalogPicker
          items={additionalServices}
          selectedIds={selectedServiceIds}
          onChange={(ids) => onChange('additionalServiceIds', JSON.stringify(ids))}
          getKey={(service) => service.id}
          getLabel={(service) => service.name}
          getDescription={(service) => service.description ?? service.chargeType}
          placeholder="Selecciona servicios adicionales"
        />
      </div>
    </div>
  );
}
