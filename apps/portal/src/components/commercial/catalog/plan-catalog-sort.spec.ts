import { PLAN_CATALOG_COLUMN_IDS } from './plan-catalog-columns';
import {
  isPlanCatalogSortNumeric,
  planCatalogSortField,
  planCatalogSortLabel,
} from './plan-catalog-sort';

describe('plan-catalog-sort', () => {
  it('mapea cada columna de dato a un campo lógico y deja Acciones fuera', () => {
    expect(planCatalogSortField('plan')).toBe('name');
    expect(planCatalogSortField('speed')).toBe('downloadSpeedMbps');
    expect(planCatalogSortField('price')).toBe('basePrice');
    expect(planCatalogSortField('installation')).toBe('installationFee');
    expect(planCatalogSortField('status')).toBe('isActive');
    expect(planCatalogSortField('technology')).toBe('technology');
    expect(planCatalogSortField('description')).toBe('description');
    expect(planCatalogSortField('created')).toBe('createdAt');
    expect(planCatalogSortField('updated')).toBe('updatedAt');
    expect(planCatalogSortField('actions')).toBeNull();
  });

  it('cubre todas las columnas de dato del catálogo', () => {
    for (const id of PLAN_CATALOG_COLUMN_IDS) {
      expect(planCatalogSortField(id)).toBeTruthy();
    }
  });

  it('alinea a la derecha las columnas numéricas y de fecha', () => {
    expect(isPlanCatalogSortNumeric('speed')).toBe(true);
    expect(isPlanCatalogSortNumeric('price')).toBe(true);
    expect(isPlanCatalogSortNumeric('installation')).toBe(true);
    expect(isPlanCatalogSortNumeric('created')).toBe(true);
    expect(isPlanCatalogSortNumeric('updated')).toBe(true);
    expect(isPlanCatalogSortNumeric('plan')).toBe(false);
    expect(isPlanCatalogSortNumeric('actions')).toBe(false);
  });

  it('resuelve el rótulo visible a partir del campo lógico', () => {
    expect(planCatalogSortLabel('name')).toBe('Plan');
    expect(planCatalogSortLabel('basePrice')).toBe('Precio base');
    expect(planCatalogSortLabel('unknown')).toBe('unknown');
  });
});
