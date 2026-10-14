import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TAXATION_LIST_DEFAULT_LIMIT } from '../../../common/pagination';
import { TaxType } from '@iwana/shared';
import { CreateTaxRuleDto, TaxRuleListQueryDto, UpdateTaxRuleDto } from './tax-rule.dto';

describe('TaxRule DTO validation and query transforms', () => {
  it.each([undefined, null])(
    'uses the default page size when limit is absent or null: %s',
    (limit) => {
      const dto = plainToInstance(TaxRuleListQueryDto, { limit });

      expect(dto.limit).toBe(TAXATION_LIST_DEFAULT_LIMIT);
      expect(validateSync(dto)).toHaveLength(0);
    },
  );

  it('rejects a blank limit after numeric conversion instead of accepting zero', () => {
    const dto = plainToInstance(TaxRuleListQueryDto, { limit: '' });

    expect(dto.limit).toBe(0);
    expect(validateSync(dto).some((error) => error.property === 'limit')).toBe(true);
  });

  it('converts a page-size query string into an integer', () => {
    const dto = plainToInstance(TaxRuleListQueryDto, { limit: '12' });

    expect(dto.limit).toBe(12);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts a valid tax rule and rejects a rate outside 0–100', () => {
    const valid = plainToInstance(CreateTaxRuleDto, {
      taxType: TaxType.IVA,
      ratePercentage: '19.00',
    });
    const invalid = plainToInstance(CreateTaxRuleDto, {
      taxType: TaxType.IVA,
      ratePercentage: '101',
    });

    expect(validateSync(valid)).toHaveLength(0);
    expect(validateSync(invalid).some((error) => error.property === 'ratePercentage')).toBe(true);
  });

  it('allows omitted optional update fields while validating a supplied active flag', () => {
    const omitted = plainToInstance(UpdateTaxRuleDto, {});
    const supplied = plainToInstance(UpdateTaxRuleDto, { isActive: false });

    expect(validateSync(omitted)).toHaveLength(0);
    expect(validateSync(supplied)).toHaveLength(0);
    expect(supplied.isActive).toBe(false);
  });
});
