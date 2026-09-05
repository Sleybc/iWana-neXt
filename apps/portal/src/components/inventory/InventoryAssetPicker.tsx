'use client';

import { useCallback, type ReactNode } from 'react';
import { SerializedAssetStatus } from '@iwana/shared';
import { inventoryApi, mapPickerSearchResponse } from '@/lib/api-client';
import { SearchablePicker, type SearchablePickerItem } from '@/components/shared/SearchablePicker';
import { formatSerializedAssetLabel } from './stock-issue-line-utils';
import { getSerializedAssetStatusLabel } from './inventory-labels';

/** Estados que un serial debe tener para salir (B2 S1: lista separada por comas). */
const PICKABLE_SERIAL_STATUSES = [
  SerializedAssetStatus.AVAILABLE,
  SerializedAssetStatus.AVAILABLE_REFURBISHED,
].join(',');

const SERIAL_PICKER_PAGE_SIZE = 50;

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
    async (query: string, signal: AbortSignal) => {
      const scopedItemId = itemId?.trim() ?? '';
      const scopedLocationId = locationId?.trim() ?? '';

      if (scopedItemId && scopedLocationId) {
        // La página por ítem + bodega es pequeña (seriales de un producto en una
        // bodega): se filtra en cliente para no depender de la semántica exacta
        // de `serialNumber` en el servidor (exacta vs parcial).
        const response = await inventoryApi.listAssets(
          {
            itemId: scopedItemId,
            locationId: scopedLocationId,
            status: PICKABLE_SERIAL_STATUSES,
            limit: SERIAL_PICKER_PAGE_SIZE,
          },
          undefined,
        );
        if (signal.aborted) {
          return { items: [], total: 0 };
        }
        const excluded = new Set(excludeIds ?? []);
        const needle = query.trim().toLowerCase();
        const items = response.data
          .filter((asset) => !excluded.has(asset.id))
          .filter((asset) => {
            if (!needle) {
              return true;
            }
            const haystack =
              `${asset.serialNumber ?? ''} ${asset.assetTag ?? ''} ${asset.id}`.toLowerCase();
            return haystack.includes(needle);
          })
          .map((asset) => ({
            id: asset.id,
            label: formatSerializedAssetLabel(asset),
            sublabel: getSerializedAssetStatusLabel(asset.currentStatus),
          }));
        return { items, total: response.meta.total };
      }

      const response = await inventoryApi.searchAssetsForPicker({ q: query }, { signal });
      return mapPickerSearchResponse(response);
    },
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
