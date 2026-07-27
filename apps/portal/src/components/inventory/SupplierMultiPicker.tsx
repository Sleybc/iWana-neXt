'use client';

import { useCallback } from 'react';
import { purchasingApi, mapPickerSearchResponse, type PickerSearchItemDto } from '@/lib/api-client';
import {
  SearchableMultiPicker,
  type SearchablePickerItem,
} from '@/components/shared/SearchablePicker';
import { getPartyStatusLabel } from './inventory-labels';

export interface SupplierMultiSelection {
  partyRefId: string;
  displayName: string;
}

interface SupplierMultiPickerProps {
  id?: string;
  label?: string;
  value: SupplierMultiSelection[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (selection: SupplierMultiSelection[]) => void;
}

/**
 * Thin wrapper E-4 sobre `SearchableMultiPicker`.
 * Typeahead vía list/search de proveedores (no lookup por documento).
 */
export function SupplierMultiPicker({
  id,
  label = 'Proveedores',
  value,
  placeholder = 'Buscar proveedor por nombre',
  disabled = false,
  onChange,
}: SupplierMultiPickerProps) {
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
    (next: SearchablePickerItem[]) => {
      onChange(next.map((item) => ({ partyRefId: item.id, displayName: item.label })));
    },
    [onChange],
  );

  return (
    <SearchableMultiPicker
      id={id}
      label={label}
      resource={{ singular: 'proveedor', plural: 'proveedores' }}
      value={value.map((entry) => ({ id: entry.partyRefId, label: entry.displayName }))}
      onChange={handleChange}
      onSearch={searchSuppliers}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
