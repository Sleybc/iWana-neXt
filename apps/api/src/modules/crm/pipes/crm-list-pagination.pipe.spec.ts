import { BadRequestException } from '@nestjs/common';
import { MAX_LIMIT } from '../../../common/pagination/clamp-limit';
import { CrmListLimitPipe, CrmListPagePipe } from './crm-list-pagination.pipe';

describe('CrmListLimitPipe', () => {
  const pipe = new CrmListLimitPipe();

  it('capa limit=10000 a ≤100 (abuso R1 / H-1)', () => {
    expect(pipe.transform(10_000, { type: 'query' })).toBe(MAX_LIMIT);
    expect(MAX_LIMIT).toBe(100);
  });

  it('acepta límites válidos y omite vacío', () => {
    expect(pipe.transform(undefined, { type: 'query' })).toBeUndefined();
    expect(pipe.transform(20, { type: 'query' })).toBe(20);
    expect(pipe.transform('50', { type: 'query' })).toBe(50);
  });

  it('rechaza valores no enteros o < 1', () => {
    expect(() => pipe.transform(0, { type: 'query' })).toThrow(BadRequestException);
    expect(() => pipe.transform(1.5, { type: 'query' })).toThrow(BadRequestException);
    expect(() => pipe.transform('abc', { type: 'query' })).toThrow(BadRequestException);
  });
});

describe('CrmListPagePipe', () => {
  const pipe = new CrmListPagePipe();

  it('acepta page ≥ 1 y omite vacío', () => {
    expect(pipe.transform(undefined, { type: 'query' })).toBeUndefined();
    expect(pipe.transform(1, { type: 'query' })).toBe(1);
    expect(pipe.transform('3', { type: 'query' })).toBe(3);
  });

  it('acepta page en el límite superior MAX_PAGE=100', () => {
    expect(pipe.transform(100, { type: 'query' })).toBe(100);
  });

  it('rechaza page inválida', () => {
    expect(() => pipe.transform(0, { type: 'query' })).toThrow(BadRequestException);
  });

  it('rechaza page > MAX_PAGE (DEF-2 A6)', () => {
    expect(() => pipe.transform(101, { type: 'query' })).toThrow(BadRequestException);
    expect(() => pipe.transform(10_000, { type: 'query' })).toThrow(BadRequestException);
  });
});
