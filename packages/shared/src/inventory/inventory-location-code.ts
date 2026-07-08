import { StockLocationType } from '../enums/inventory/stock-location-type.enum';

export const STOCK_LOCATION_TYPE_CODE_PREFIXES: Record<StockLocationType, string> = {
  [StockLocationType.MAIN_WAREHOUSE]: 'BOD',
  [StockLocationType.MOBILE_TECHNICIAN]: 'MOV',
  [StockLocationType.MOBILE_CREW]: 'CRW',
  [StockLocationType.CUSTOMER_SITE]: 'CLI',
  [StockLocationType.OFFICE_STOCK]: 'OFI',
  [StockLocationType.NODE_STOCK]: 'NOD',
  [StockLocationType.QUARANTINE]: 'CUA',
  [StockLocationType.REPAIR]: 'REP',
  [StockLocationType.SCRAP]: 'SCR',
  [StockLocationType.INTERNAL_CONSUMPTION]: 'INT',
};

const LOCATION_CODE_PATTERN = /^([A-Z]{2,3})-(\d{3})$/;

export function getStockLocationTypeCodePrefix(type: StockLocationType): string {
  return STOCK_LOCATION_TYPE_CODE_PREFIXES[type];
}

export function formatStockLocationCode(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(3, '0')}`;
}

export function parseStockLocationCodeSequence(code: string, prefix: string): number | null {
  const match = code.match(LOCATION_CODE_PATTERN);
  if (!match || match[1] !== prefix) {
    return null;
  }

  const sequence = Number.parseInt(match[2] ?? '', 10);
  return Number.isFinite(sequence) ? sequence : null;
}

export function resolveNextStockLocationCode(
  existingCodes: readonly string[],
  type: StockLocationType,
  offset = 0,
): string {
  const prefix = getStockLocationTypeCodePrefix(type);
  let maxSequence = 0;

  for (const code of existingCodes) {
    const sequence = parseStockLocationCodeSequence(code, prefix);
    if (sequence != null && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  return formatStockLocationCode(prefix, maxSequence + 1 + offset);
}
