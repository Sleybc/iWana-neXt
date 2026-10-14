import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { COMMERCIAL_LIST_DEFAULT_LIMIT } from '../../../common/pagination';
import { CatalogQueryDto } from './catalog-query.dto';

describe('CatalogQueryDto', () => {
  it.each([
    ['true', true],
    ['1', true],
    [1, true],
    [true, true],
    ['false', false],
    ['0', false],
    [0, false],
    [false, false],
  ])('normaliza el filtro booleano %p a %p', (value, expected) => {
    const query = plainToInstance(CatalogQueryDto, {
      isActive: value,
      missingPrice: value,
      missingVatConcept: value,
    });

    expect(query.isActive).toBe(expected);
    expect(query.missingPrice).toBe(expected);
    expect(query.missingVatConcept).toBe(expected);
    expect(validateSync(query)).toHaveLength(0);
  });

  it('mantiene valores booleanos desconocidos para que la validación los rechace', () => {
    const query = plainToInstance(CatalogQueryDto, { missingVatConcept: 'yes' });

    expect(query.missingVatConcept).toBe('yes');
    expect(validateSync(query).map((error) => error.property)).toContain('missingVatConcept');
  });

  it('conserva el límite acotado predeterminado cuando se omiten los parámetros numéricos', () => {
    const query = plainToInstance(CatalogQueryDto, {});

    expect(query.page).toBeUndefined();
    expect(query.limit).toBe(COMMERCIAL_LIST_DEFAULT_LIMIT);
    expect(validateSync(query)).toHaveLength(0);
  });

  it('rechaza page y limit vacíos después de convertirse en cero', () => {
    const query = plainToInstance(CatalogQueryDto, { page: '', limit: '' });
    const invalidProperties = validateSync(query).map((error) => error.property);

    expect(query.page).toBe(0);
    expect(query.limit).toBe(0);
    expect(invalidProperties).toEqual(expect.arrayContaining(['page', 'limit']));
  });

  it('convierte page y limit numéricos de query string para paginación por página', () => {
    const query = plainToInstance(CatalogQueryDto, { page: '2', limit: '40' });

    expect(query.page).toBe(2);
    expect(query.limit).toBe(40);
    expect(validateSync(query)).toHaveLength(0);
  });
});
