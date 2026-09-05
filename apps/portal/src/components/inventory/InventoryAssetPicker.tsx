'use client';

import { useCallback, type ReactNode } from 'react';
import { inventoryApi } from '@/lib/api-client';
import { SearchablePicker, type SearchablePickerItem } from '@/components/shared/SearchablePicker';
import { searchPickableSerializedAssets } from './stock-issue-line-utils';

interface InventoryAssetPickerProps {
  id?: string;
  label?: ReactNode;
  value: string | null;
  selectedLabel?: string | null;
  selectedSublabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  /** Mínimo de caracteres para disparar la búsqueda. Default 2. 0 = precarga al abrir. */
  minChars?: number | undefined;
  /** Debounce en ms antes de buscar. Default 300. */
  debounceMs?: number | undefined;
  /**
   * Alcance S1: con ítem + bodega el lookup usa `GET /inventory/assets`
   * (ya filtra `itemId + locationId + status` tras B2) en vez del buscador
   * global `GET /inventory/assets/search`, que no conoce el contexto.
   */
  itemId?: string | null;
  locationId?: string | null;
  /** Seriales usados en otras líneas del borrador: nunca se ofrecen (regla S1). */
  excludeIds?: readonly string[] | undefined;
  onChange: (assetId: string | null, item: SearchablePickerItem | null) => void;
}

/**
 * Thin wrapper E-4 sobre `SearchablePicker`.
 * Sin alcance (`itemId`/`locationId`) conserva el typeahead global vía
 * `GET /inventory/assets/search`; con alcance consume `listAssets` por
 * ítem + bodega + estado disponible (decisión cerrada S1 con BE).
 * El lookup compartido vive en `searchPickableSerializedAssets` (mismo
 * contrato que el multiselector del panel de línea).
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
  itemId,
  locationId,
  excludeIds,
  onChange,
}: InventoryAssetPickerProps) {
  const searchAssets = useCallback(
    (query: string, signal: AbortSignal) =>
      searchPickableSerializedAssets({ itemId, locationId, excludeIds, query, signal }),
    [itemId, locationId, excludeIds],
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
