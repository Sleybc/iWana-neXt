import {
  clampPickerSearchLimit,
  escapePickerLikePattern,
  normalizePickerQuery,
  PICKER_SEARCH_DEFAULT_LIMIT,
  PICKER_SEARCH_MAX_LIMIT,
} from './picker-search';

describe('picker-search helpers', () => {
  it('clampPickerSearchLimit usa default 20 y no supera 20', () => {
    expect(clampPickerSearchLimit(undefined)).toBe(PICKER_SEARCH_DEFAULT_LIMIT);
    expect(clampPickerSearchLimit(100)).toBe(PICKER_SEARCH_MAX_LIMIT);
    expect(clampPickerSearchLimit(5)).toBe(5);
  });

  it('normalizePickerQuery recorta y colapsa espacios', () => {
    expect(normalizePickerQuery('  plan   fibra  ')).toBe('plan fibra');
    expect(normalizePickerQuery(null)).toBe('');
    expect(normalizePickerQuery('   ')).toBe('');
  });

  it('escapePickerLikePattern escapa % _ y backslash', () => {
    expect(escapePickerLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });
});
