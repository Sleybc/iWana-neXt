import { buildPageMeta, buildCursorMeta } from './build-page-meta';
import type { ListMeta } from '@iwana/shared';

describe('buildPageMeta', () => {
  it('construye meta básica con total, page y limit', () => {
    const meta = buildPageMeta({ total: 100, page: 2, limit: 20 });
    expect(meta).toMatchObject({
      nextCursor: null,
      total: 100,
      totalIsEstimate: false,
      page: 2,
      limit: 20,
      totalPages: 5,
      hasMore: true,
      mode: 'page',
    });
  });

  it('hasMore=false en la última página', () => {
    const meta = buildPageMeta({ total: 100, page: 5, limit: 20 });
    expect(meta.hasMore).toBe(false);
    expect(meta.totalPages).toBe(5);
  });

  it('totalPages=0 cuando total=0', () => {
    const meta = buildPageMeta({ total: 0, page: 1, limit: 20 });
    expect(meta.totalPages).toBe(0);
    expect(meta.hasMore).toBe(false);
  });

  it('hasMore=true cuando hay página siguiente', () => {
    const meta = buildPageMeta({ total: 101, page: 5, limit: 20 });
    expect(meta.hasMore).toBe(true);
    expect(meta.totalPages).toBe(6);
  });

  it('randomAccess=true por defecto', () => {
    const meta = buildPageMeta({ total: 50, page: 1, limit: 20 });
    expect(meta.capabilities.randomAccess).toBe(true);
  });

  it('randomAccess respeta el parámetro', () => {
    const meta = buildPageMeta({
      total: 50,
      page: 1,
      limit: 20,
      randomAccess: false,
    });
    expect(meta.capabilities.randomAccess).toBe(false);
  });

  it('sortableFields vacío por defecto', () => {
    const meta = buildPageMeta({ total: 50, page: 1, limit: 20 });
    expect(meta.capabilities.sortableFields).toEqual([]);
  });

  it('sortableFields respeta el parámetro', () => {
    const meta = buildPageMeta({
      total: 50,
      page: 1,
      limit: 20,
      sortableFields: ['name', 'createdAt'],
    });
    expect(meta.capabilities.sortableFields).toEqual(['name', 'createdAt']);
  });

  it('sort=null por defecto (sin sortBy/sortDir)', () => {
    const meta = buildPageMeta({ total: 50, page: 1, limit: 20 });
    expect(meta.sort).toBeNull();
  });

  it('sort refleja el orden aplicado', () => {
    const meta = buildPageMeta({
      total: 50,
      page: 1,
      limit: 20,
      sortBy: 'name',
      sortDir: 'asc',
    });
    expect(meta.sort).toEqual({ by: 'name', dir: 'asc' });
  });

  it('sortBy sin sortDir produce sort=null', () => {
    const meta = buildPageMeta({
      total: 50,
      page: 1,
      limit: 20,
      sortBy: 'name',
    });
    expect(meta.sort).toBeNull();
  });

  it('totalIsEstimate=false por defecto', () => {
    const meta = buildPageMeta({ total: 50, page: 1, limit: 20 });
    expect(meta.totalIsEstimate).toBe(false);
  });
});

describe('buildCursorMeta', () => {
  it('construye meta para modo cursor', () => {
    const meta = buildCursorMeta({
      nextCursor: 'eyJkIjoiMjAyNC0wMS0wMSJ9',
      total: 500,
      limit: 50,
    });
    expect(meta).toMatchObject({
      nextCursor: 'eyJkIjoiMjAyNC0wMS0wMSJ9',
      total: 500,
      totalIsEstimate: false,
      page: null,
      limit: 50,
      totalPages: null,
      hasMore: true,
      mode: 'cursor',
      capabilities: { randomAccess: false, sortableFields: [] },
      sort: null,
    });
  });

  it('hasMore=false cuando nextCursor es null', () => {
    const meta = buildCursorMeta({
      nextCursor: null,
      total: 20,
      limit: 50,
    });
    expect(meta.hasMore).toBe(false);
  });

  it('totalIsEstimate respeta el parámetro', () => {
    const meta = buildCursorMeta({
      nextCursor: 'abc123',
      total: 10000,
      limit: 50,
      totalIsEstimate: true,
    });
    expect(meta.totalIsEstimate).toBe(true);
  });
});
