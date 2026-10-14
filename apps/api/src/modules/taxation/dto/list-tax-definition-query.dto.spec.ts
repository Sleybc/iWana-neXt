import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TAXATION_LIST_DEFAULT_LIMIT } from '../../../common/pagination';
import { ListTaxDefinitionQueryDto } from './list-tax-definition-query.dto';

describe('ListTaxDefinitionQueryDto transforms', () => {
  it('uses the default limit when no value was supplied', () => {
    const dto = plainToInstance(ListTaxDefinitionQueryDto, {});

    expect(dto.limit).toBe(TAXATION_LIST_DEFAULT_LIMIT);
  });

  it('converts a numeric string limit and preserves a valid active flag', () => {
    const dto = plainToInstance(ListTaxDefinitionQueryDto, {
      limit: '12',
      isActive: 'true',
    });

    expect(dto.limit).toBe(12);
    expect(dto.isActive).toBe(true);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('converts false and leaves an unknown active flag for validation to reject', () => {
    const inactive = plainToInstance(ListTaxDefinitionQueryDto, { isActive: 'false' });
    const invalid = plainToInstance(ListTaxDefinitionQueryDto, { isActive: '1' });

    expect(inactive.isActive).toBe(false);
    expect(invalid.isActive).toBe('1');
    expect(validateSync(invalid).some((error) => error.property === 'isActive')).toBe(true);
  });
});
