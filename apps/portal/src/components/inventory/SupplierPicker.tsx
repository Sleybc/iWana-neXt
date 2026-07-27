'use client';

import { useCallback } from 'react';
import { purchasingApi, mapPickerSearchResponse, type PickerSearchItemDto } from '@/lib/api-client';
import { SearchablePicker, type SearchablePickerItem } from '@/components/shared/SearchablePicker';
import { getPartyStatusLabel } from './inventory-labels';

interface SupplierPickerProps {
  id?: string;
  label?: string;
  value: string | null;
  selectedLabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  onChange: (partyRefId: string | null, displayName: string | null) => void;
  onPreview?: (partyRefId: string) => void;
}

/**
 * Thin wrapper E-4 sobre `SearchablePicker`.
 * Typeahead vía `GET /purchasing/providers?search=` (list/search usable).
 * No usa `/purchasing/suppliers/lookup` — ese endpoint es lookup exacto por documento
 * para alta, no typeahead por nombre (gap F4 documentado).
 */
export function SupplierPicker({
  id,
  label = 'Proveedor',
  value,
  selectedLabel,
  placeholder = 'Buscar proveedor por nombre',
  disabled = false,
  onChange,
  onPreview,
}: SupplierPickerProps) {
  const searchSuppliers = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await purchasingApi.searchSuppliers({ search: query, page: 1 }, undefined, {
      signal,
    });

    const items: PickerSearchItemDto[] = response.data.map((option) => ({
      id: option.partyRefId,
      label: option.displayName,
      sublabel: getPartyStatusLabel(option.status),
    }));

    return mapPickerSearchResponse({ data: items, total: response.total });
  }, []);

  const handleChange = useCallback(
    (item: SearchablePickerItem | null) => {
      onChange(item?.id ?? null, item?.label ?? null);
      if (item) {
        onPreview?.(item.id);
      }
    },
    [onChange, onPreview],
  );

  return (
    <SearchablePicker
      id={id}
      label={label}
      resource={{ singular: 'proveedor', plural: 'proveedores' }}
      value={value}
      selectedItem={selectedLabel ? { label: selectedLabel } : null}
      onChange={handleChange}
      onSearch={searchSuppliers}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
