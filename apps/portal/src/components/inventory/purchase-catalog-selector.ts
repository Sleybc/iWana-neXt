import type { InventoryCatalogOptionRecord } from '@/lib/api-client';
import { getInventoryItemKindLabel } from './inventory-labels';

export function filterCatalogOptions(
  options: InventoryCatalogOptionRecord[],
  search: string,
): InventoryCatalogOptionRecord[] {
  const term = search.trim().toLowerCase();
  if (!term) {
    return options;
  }

  return options.filter(
    (option) =>
      option.sku.toLowerCase().includes(term) ||
      option.name.toLowerCase().includes(term) ||
      (option.supplierSku?.toLowerCase().includes(term) ?? false),
  );
}

export function buildCatalogSelectOptions(options: InventoryCatalogOptionRecord[]) {
  return [
    { value: '', label: 'Seleccionar producto' },
    ...options.map((option) => ({
      value: option.id,
      label: `${option.sku} — ${option.name} · ${option.categoryName} · ${getInventoryItemKindLabel(option.itemKind)}`,
    })),
  ];
}

export function resolveCatalogUnitOfMeasure(option: InventoryCatalogOptionRecord): string {
  return option.purchaseUnitOfMeasure?.trim() || option.unitOfMeasure;
}

export function resolveCatalogSupplierPrefill(
  option: InventoryCatalogOptionRecord,
  supplierLabels: Record<string, string> = {},
): { suggestedPartyRefId: string; suggestedPartyName: string } {
  if (!option.preferredSupplierRefId) {
    return { suggestedPartyRefId: '', suggestedPartyName: '' };
  }

  return {
    suggestedPartyRefId: option.preferredSupplierRefId,
    suggestedPartyName:
      option.preferredSupplierName ?? supplierLabels[option.preferredSupplierRefId] ?? '',
  };
}

export function buildCatalogBulkRowLabel(option: InventoryCatalogOptionRecord): string {
  return `${option.sku} - ${option.name}`;
}

export function resolveCatalogSupplierLabel(
  option: InventoryCatalogOptionRecord,
  supplierLabels: Record<string, string> = {},
): string {
  const prefill = resolveCatalogSupplierPrefill(option, supplierLabels);
  return prefill.suggestedPartyName || 'Sin proveedor sugerido';
}
