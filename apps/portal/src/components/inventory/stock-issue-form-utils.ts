import { StockIssueType, StockLocationType } from '@iwana/shared';
import type { StockLocationRecord } from '@/lib/api-client';

export function destinationTypeForIssue(type: StockIssueType): StockLocationType | null {
  switch (type) {
    case StockIssueType.TECHNICIAN_CUSTODY:
      return StockLocationType.MOBILE_TECHNICIAN;
    case StockIssueType.CREW_CUSTODY:
      return StockLocationType.MOBILE_CREW;
    case StockIssueType.OFFICE_REPLENISHMENT:
      return StockLocationType.OFFICE_STOCK;
    case StockIssueType.NODE_REPLENISHMENT:
      return StockLocationType.NODE_STOCK;
    case StockIssueType.WAREHOUSE_TO_WAREHOUSE:
      return null;
    case StockIssueType.SALE_DISPATCH:
    case StockIssueType.INTERNAL_CONSUMPTION:
    default:
      return null;
  }
}

export function allowedSourceTypesForIssue(_type: StockIssueType): StockLocationType[] {
  return [StockLocationType.MAIN_WAREHOUSE];
}

export function showDestinationForIssueType(type: StockIssueType): boolean {
  return type !== StockIssueType.SALE_DISPATCH && type !== StockIssueType.INTERNAL_CONSUMPTION;
}

export function getSourceCandidates(
  type: StockIssueType,
  locations: StockLocationRecord[],
): StockLocationRecord[] {
  const allowed = new Set(allowedSourceTypesForIssue(type));
  return locations.filter((loc) => allowed.has(loc.type));
}

export function getDestinationCandidates(
  type: StockIssueType,
  locations: StockLocationRecord[],
  sourceLocationId: string,
  destinationOptions: Map<StockLocationType, StockLocationRecord[]>,
): StockLocationRecord[] {
  if (!showDestinationForIssueType(type)) {
    return [];
  }

  if (type === StockIssueType.WAREHOUSE_TO_WAREHOUSE) {
    return locations.filter(
      (loc) =>
        [
          StockLocationType.OFFICE_STOCK,
          StockLocationType.NODE_STOCK,
          StockLocationType.QUARANTINE,
          StockLocationType.REPAIR,
        ].includes(loc.type) && loc.id !== sourceLocationId,
    );
  }

  const destinationType = destinationTypeForIssue(type);
  if (!destinationType) {
    return [];
  }

  return destinationOptions.get(destinationType) ?? [];
}
