import { StockLocationStatus, StockLocationType } from '@iwana/shared';
import type { StockLocationRecord } from '@/lib/api-client';
import {
  EMPTY_LOCATION_MATRIX_FILTERS,
  hasActiveLocationMatrixFilters,
  matchesLocationMatrixFilters,
} from './location-matrix-filters';

function buildLocation(overrides: Partial<StockLocationRecord> = {}): StockLocationRecord {
  return {
    id: 'loc-1',
    tenantId: 'tenant-1',
    code: 'BOD-001',
    name: 'Bodega principal',
    type: StockLocationType.MAIN_WAREHOUSE,
    status: StockLocationStatus.ACTIVE,
    responsibleRefId: null,
    maxCapacity: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('location-matrix-filters', () => {
  it('filtra ubicaciones inactivas o archivadas como grupo', () => {
    const inactive = buildLocation({
      id: 'loc-inactive',
      status: StockLocationStatus.INACTIVE,
    });
    const archived = buildLocation({
      id: 'loc-archived',
      status: StockLocationStatus.ARCHIVED,
    });
    const filters = {
      ...EMPTY_LOCATION_MATRIX_FILTERS,
      statusFilter: 'inactive_group' as const,
    };

    expect(matchesLocationMatrixFilters(inactive, filters, 0)).toBe(true);
    expect(matchesLocationMatrixFilters(archived, filters, 0)).toBe(true);
    expect(matchesLocationMatrixFilters(buildLocation(), filters, 0)).toBe(false);
  });

  it('filtra ubicaciones móviles por custodia', () => {
    const mobile = buildLocation({
      id: 'loc-mobile',
      type: StockLocationType.MOBILE_TECHNICIAN,
    });
    const filters = {
      ...EMPTY_LOCATION_MATRIX_FILTERS,
      custodyFilter: 'mobile' as const,
    };

    expect(matchesLocationMatrixFilters(mobile, filters, 0)).toBe(true);
    expect(matchesLocationMatrixFilters(buildLocation(), filters, 0)).toBe(false);
  });

  it('filtra ubicaciones con material disponible', () => {
    const filters = {
      ...EMPTY_LOCATION_MATRIX_FILTERS,
      stockFilter: 'withStock' as const,
    };

    expect(matchesLocationMatrixFilters(buildLocation(), filters, 10)).toBe(true);
    expect(matchesLocationMatrixFilters(buildLocation(), filters, 0)).toBe(false);
  });

  it('detecta filtros activos', () => {
    expect(hasActiveLocationMatrixFilters(EMPTY_LOCATION_MATRIX_FILTERS)).toBe(false);
    expect(
      hasActiveLocationMatrixFilters({
        ...EMPTY_LOCATION_MATRIX_FILTERS,
        statusFilter: StockLocationStatus.ACTIVE,
      }),
    ).toBe(true);
    expect(
      hasActiveLocationMatrixFilters({
        ...EMPTY_LOCATION_MATRIX_FILTERS,
        custodyFilter: 'mobile',
      }),
    ).toBe(true);
    expect(
      hasActiveLocationMatrixFilters({
        ...EMPTY_LOCATION_MATRIX_FILTERS,
        stockFilter: 'withStock',
      }),
    ).toBe(true);
  });
});
