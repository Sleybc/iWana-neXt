'use client';

import { useCallback } from 'react';
import { inventoryApi, mapPickerSearchResponse } from '@/lib/api-client';
import { SearchablePicker, type SearchablePickerItem } from '@/components/shared/SearchablePicker';

interface InventoryAssetPickerProps {
  id?: string;
  label?: string;
  value: string | null;
  selectedLabel?: string | null;
  selectedSublabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  /** Mínimo de caracteres para disparar la búsqueda. Default 2. 0 = precarga al abrir. */
  minChars?: number | undefined;
  /** Debounce en ms antes de buscar. Default 300. */
  debounceMs?: number | undefined;
  onChange: (assetId: string | null, item: SearchablePickerItem | null) => void;
}

/**
 * Thin wrapper E-4 sobre `SearchablePicker`.
 * Typeahead vía `GET /inventory/assets/search`.
 */
export function InventoryAssetPicker({
  id,
  label = 'Equipo con serial',
  value,
  selectedLabel,
  selectedSublabel,
  placeholder = 'Buscar por serial o etiqueta',
  disabled = false,
  minChars,
  debounceMs,
  onChange,
}: InventoryAssetPickerProps) {
  const searchAssets = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await inventoryApi.searchAssetsForPicker({ q: query }, { signal });
    return mapPickerSearchResponse(response);
  }, []);

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
      resource={{ singular: 'activo', plural: 'activos' }}
      value={value}
      selectedItem={
        selectedLabel
          ? { label: selectedLabel, ...(selectedSublabel ? { sublabel: selectedSublabel } : {}) }
          : null
      }
      onChange={handleChange}
      onSearch={searchAssets}
      placeholder={placeholder}
      disabled={disabled}
      {...(minChars !== undefined ? { minChars } : {})}
      {...(debounceMs !== undefined ? { debounceMs } : {})}
    />
  );
}
