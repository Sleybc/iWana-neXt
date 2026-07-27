import { mergeUrlSearchParams, withSearchParams } from './merge-url-search-params';

describe('mergeUrlSearchParams', () => {
  it('fusiona y elimina claves vacías', () => {
    const current = new URLSearchParams('tab=items&page=2&search=foo');
    expect(
      mergeUrlSearchParams(current, {
        page: '3',
        search: null,
        size: '20',
      }),
    ).toBe('tab=items&page=3&size=20');
  });

  it('acepta string de query', () => {
    expect(mergeUrlSearchParams('a=1', { b: '2', a: '' })).toBe('b=2');
  });
});

describe('withSearchParams', () => {
  it('omite el ? si no hay query', () => {
    expect(withSearchParams('/dashboard/inventory', '')).toBe('/dashboard/inventory');
    expect(withSearchParams('/dashboard/inventory', 'tab=items')).toBe(
      '/dashboard/inventory?tab=items',
    );
  });
});
