import {
  deriveCategoryCode,
  deriveLegibleCategoryPrefix,
  resolveCategoryCreateValues,
  suggestCategoryCodePrefix,
  tokenizeCategoryName,
} from './inventory-category-code';

describe('inventory-category-code', () => {
  describe('tokenizeCategoryName', () => {
    it('tokenizes accents, spaces and ignores stopwords', () => {
      expect(tokenizeCategoryName('Consumibles de Fibra Óptica')).toEqual([
        'CONSUMIBLES',
        'FIBRA',
        'OPTICA',
      ]);
    });
  });

  describe('deriveLegibleCategoryPrefix', () => {
    it('builds base plus distinctive prefix for family categories', () => {
      expect(deriveLegibleCategoryPrefix('Consumibles FO')).toBe('CFO');
      expect(deriveLegibleCategoryPrefix('Consumibles RD')).toBe('CRD');
    });

    it('uses initials for three or more tokens', () => {
      expect(deriveLegibleCategoryPrefix('Consumibles Radio Enlace')).toBe('CRE');
    });

    it('truncates single-token names to a readable short prefix', () => {
      expect(deriveLegibleCategoryPrefix('Networking')).toBe('NET');
    });
  });

  describe('suggestCategoryCodePrefix', () => {
    it('returns legible unique prefixes for similar category names', () => {
      const taken = new Set(['CFO']);

      expect(suggestCategoryCodePrefix('Consumibles RD', taken)).toBe('CRD');
    });
  });

  describe('resolveCategoryCreateValues', () => {
    it('derives legible code and prefix from name', () => {
      expect(resolveCategoryCreateValues('Consumibles FO', '')).toEqual({
        code: 'CONSUMIBLESFO',
        codePrefix: 'CFO',
      });
    });

    it('deduplicates auto-suggested prefix when a similar one is taken', () => {
      expect(resolveCategoryCreateValues('Consumibles RD', '', new Set(['CFO']), true)).toEqual({
        code: 'CONSUMIBLESRD',
        codePrefix: 'CRD',
      });
    });
  });

  describe('deriveCategoryCode', () => {
    it('derives full internal code from name', () => {
      expect(deriveCategoryCode('Consumibles FO')).toBe('CONSUMIBLESFO');
    });
  });
});
