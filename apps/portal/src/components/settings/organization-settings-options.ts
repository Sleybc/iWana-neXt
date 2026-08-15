import type { SelectOption } from '@iwana/ui';

export const ORGANIZATION_COUNTRY_OPTIONS: SelectOption[] = [
  { value: 'CO', label: 'Colombia' },
  { value: 'EC', label: 'Ecuador' },
  { value: 'MX', label: 'México' },
  { value: 'PE', label: 'Perú' },
  { value: 'US', label: 'Estados Unidos' },
];

export function countryOptionsWithCurrent(value?: string | null): SelectOption[] {
  const current = value?.trim().toUpperCase();
  if (!current || ORGANIZATION_COUNTRY_OPTIONS.some((option) => option.value === current)) {
    return ORGANIZATION_COUNTRY_OPTIONS;
  }
  return [...ORGANIZATION_COUNTRY_OPTIONS, { value: current, label: current }];
}
