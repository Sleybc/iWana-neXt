import { parsePlatformPageSize, PLATFORM_DEFAULT_PAGE_SIZE } from './platform-page-size';

describe('parsePlatformPageSize', () => {
  it('acepta 10, 20 y 50', () => {
    expect(parsePlatformPageSize('10')).toBe(10);
    expect(parsePlatformPageSize('20')).toBe(20);
    expect(parsePlatformPageSize('50')).toBe(50);
  });

  it('cae al valor por defecto si el valor no es válido', () => {
    expect(parsePlatformPageSize(null)).toBe(PLATFORM_DEFAULT_PAGE_SIZE);
    expect(parsePlatformPageSize('7')).toBe(PLATFORM_DEFAULT_PAGE_SIZE);
    expect(parsePlatformPageSize('100')).toBe(PLATFORM_DEFAULT_PAGE_SIZE);
  });
});
