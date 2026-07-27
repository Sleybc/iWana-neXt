'use client';

import { useCallback } from 'react';
import { inventoryApi, mapPickerSearchResponse } from '@/lib/api-client';
import { SearchablePicker, type SearchablePickerItem } from '@/components/shared/SearchablePicker';

interface InventoryLocationPickerProps {
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
  onChange: (locationId: string | null, item: SearchablePickerItem | null) => void;
}

/**
 * Thin wrapper E-4 sobre `SearchablePicker`.
 * Typeahead vía `GET /inventory/locations/search`.
 * Nota: el lookup F4 no filtra por `type`; la validación de tipo la hace el backend al guardar.
 */
export function InventoryLocationPicker({
  id,
  label = 'Bodega',
  value,
  selectedLabel,
  selectedSublabel,
  placeholder = 'Buscar bodega por nombre o código',
  disabled = false,
  status,
  minChars,
  debounceMs,
  onChange,
}: InventoryLocationPickerProps) {
  const searchLocations = useCallback(
    async (query: string, signal: AbortSignal) => {
      const response = await inventoryApi.searchLocationsForPicker(
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
      resource={{ singular: 'bodega', plural: 'bodegas' }}
      value={value}
      selectedItem={
        selectedLabel
          ? { label: selectedLabel, ...(selectedSublabel ? { sublabel: selectedSublabel } : {}) }
          : null
      }
      onChange={handleChange}
      onSearch={searchLocations}
      placeholder={placeholder}
      disabled={disabled}
      {...(minChars !== undefined ? { minChars } : {})}
      {...(debounceMs !== undefined ? { debounceMs } : {})}
    />
  );
}
