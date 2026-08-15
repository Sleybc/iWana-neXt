import { DiscountType } from '@iwana/shared';
import { ValidateBy, type ValidationOptions } from 'class-validator';

/** Monto ≥ 0 con hasta 2 decimales. */
export const NON_NEGATIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

/** Porcentaje 0–100 con hasta 2 decimales. */
export const PERCENTAGE_0_100_PATTERN = /^(?:100(?:\.0{1,2})?|(?:0|[1-9]\d?)(?:\.\d{1,2})?)$/;

type DiscountCarrier = { discountType?: DiscountType };

/**
 * `discountValue` ≥ 0; si `discountType` es PERCENTAGE, además 0–100.
 */
export function IsCommercialDiscountValue(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isCommercialDiscountValue',
      validator: {
        validate(value: unknown, args): boolean {
          if (typeof value !== 'string') return false;
          if (!NON_NEGATIVE_DECIMAL_PATTERN.test(value)) return false;
          const object = args?.object as DiscountCarrier | undefined;
          if (object?.discountType === DiscountType.PERCENTAGE) {
            return PERCENTAGE_0_100_PATTERN.test(value);
          }
          return true;
        },
        defaultMessage: () => 'discountValue debe ser ≥ 0 (y 0–100 si el tipo es porcentual)',
      },
    },
    validationOptions,
  );
}
