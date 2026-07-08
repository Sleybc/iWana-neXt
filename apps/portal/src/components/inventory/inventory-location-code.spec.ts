import { StockLocationType } from '@iwana/shared';
import {
  formatStockLocationCode,
  getStockLocationTypeCodePrefix,
  parseStockLocationCodeSequence,
  resolveNextStockLocationCode,
} from './inventory-location-code';

describe('inventory-location-code', () => {
  it('maps each location type to a stable prefix', () => {
    expect(getStockLocationTypeCodePrefix(StockLocationType.MAIN_WAREHOUSE)).toBe('BOD');
    expect(getStockLocationTypeCodePrefix(StockLocationType.QUARANTINE)).toBe('CUA');
    expect(getStockLocationTypeCodePrefix(StockLocationType.MOBILE_TECHNICIAN)).toBe('MOV');
  });

  it('formats codes with a three-digit sequence', () => {
    expect(formatStockLocationCode('BOD', 1)).toBe('BOD-001');
    expect(formatStockLocationCode('MOV', 12)).toBe('MOV-012');
  });

  it('parses only matching prefixed sequences', () => {
    expect(parseStockLocationCodeSequence('MOV-003', 'MOV')).toBe(3);
    expect(parseStockLocationCodeSequence('TEC-01', 'MOV')).toBeNull();
    expect(parseStockLocationCodeSequence('MOV-01', 'MOV')).toBeNull();
  });

  it('resolves the next code from existing tenant codes for the selected type', () => {
    expect(
      resolveNextStockLocationCode(
        ['BOD-001', 'MOV-002', 'TEC-01'],
        StockLocationType.MAIN_WAREHOUSE,
      ),
    ).toBe('BOD-002');

    expect(
      resolveNextStockLocationCode(
        ['MOV-002', 'MOV-010', 'TEC-01'],
        StockLocationType.MOBILE_TECHNICIAN,
      ),
    ).toBe('MOV-011');

    expect(resolveNextStockLocationCode([], StockLocationType.QUARANTINE)).toBe('CUA-001');
  });
});
