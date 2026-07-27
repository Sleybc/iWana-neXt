'use client';

import { useCallback } from 'react';
import { inventoryApi, mapPickerSearchResponse } from '@/lib/api-client';
import { SearchablePicker, type SearchablePickerItem } from '@/components/shared/SearchablePicker';

interface InventoryItemPickerProps {
  id?: string;
  label?: string;
  value: string | null;
  selectedLabel?: string | null;
  selectedSublabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  /** Si se define, cierra el filtro `status` en el lookup F4. */
  status?: string;
  /** Mínimo de caracteres para disparar la búsqueda. Default 2. 0 = precarga al abrir. */
  minChars?: number | undefined;
  /** Debounce en ms antes de buscar. Default 300. */
  debounceMs?: number | undefined;
  onChange: (itemId: string | null, item: SearchablePickerItem | null) => void;
}

/**
 * Thin wrapper E-4 sobre `SearchablePicker`.
 * Typeahead vía `GET /inventory/items/search`.
 */
export function InventoryItemPicker({
  id,
  label = 'Producto',
  value,
  selectedLabel,
  selectedSublabel,
  placeholder = 'Buscar producto por nombre o SKU',
  disabled = false,
  status,
  minChars,
  debounceMs,
  onChange,
}: InventoryItemPickerProps) {
  const searchItems = useCallback(
    async (query: string, signal: AbortSignal) => {
      const response = await inventoryApi.searchItemsForPicker(
        { q: query, ...(status ? { status } : {}) },
        { signal },
      );
      return mapPickerSearchResponse(response);
    },
    [status],
  );

  const handleChange = useCallback(
    (item: SearchablePickerItem | null) => {
      onChange(item?.id ?? null, item);
    },
    [onChange],
  );

  return (
    <SearchablePicker
      id={id}
      label={label}
      resource={{ singular: 'producto', plural: 'productos' }}
      value={value}
      selectedItem={
        selectedLabel
          ? { label: selectedLabel, ...(selectedSublabel ? { sublabel: selectedSublabel } : {}) }
          : null
      }
      onChange={handleChange}
      onSearch={searchItems}
      placeholder={placeholder}
      disabled={disabled}
      {...(minChars !== undefined ? { minChars } : {})}
      {...(debounceMs !== undefined ? { debounceMs } : {})}
    />
  );
}
