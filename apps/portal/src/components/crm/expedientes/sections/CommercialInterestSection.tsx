'use client';

import { Select } from '@iwana/ui';
import { EMPTY_VALUE, FIELD_LABELS } from './constants';
import type { DraftValues } from './types';
import type { AdditionalProduct, PlanCatalogItem } from '@/lib/api-client';

interface CommercialInterestSectionProps {
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  saving: boolean;
  onSave: () => void;
  planCatalog: PlanCatalogItem[];
  additionalProducts: AdditionalProduct[];
}

export function CommercialInterestSection({
  draftValues,
  onChange,
  planCatalog,
  additionalProducts,
}: CommercialInterestSectionProps) {
  const selectedProductIds: string[] = (() => {
    try {
      const raw = draftValues.additionalProductIds ?? '[]';
      return JSON.parse(raw);
    } catch {
      return [];
    }
  })();

  const handleProductCheckboxChange = (productId: string, checked: boolean) => {
    const newSelectedIds = checked
      ? [...selectedProductIds, productId]
      : selectedProductIds.filter((id) => id !== productId);
    onChange('additionalProductIds', JSON.stringify(newSelectedIds));
  };

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
        <div className="grid gap-2 rounded-[20px] border border-gray-100 bg-gray-50 p-4 shadow-[var(--shadow-iwana-card)] md:grid-cols-2 dark:border-dark-border dark:bg-dark-surface">
          {additionalProducts.map((product) => (
            <label
              key={product.id}
              className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-white dark:hover:bg-dark-surface-3"
            >
              <input
                type="checkbox"
                checked={selectedProductIds.includes(product.id)}
                onChange={(e) => handleProductCheckboxChange(product.id, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-iwana-primary accent-iwana-primary dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">{product.name}</span>
            </label>
          ))}
          {additionalProducts.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay productos comerciales activos para este tenant.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
