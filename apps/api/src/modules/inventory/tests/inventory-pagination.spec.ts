import { BadRequestException } from '@nestjs/common';
import {
  buildDateIdNextCursor,
  buildSortNameIdNextCursor,
  clampInventoryLimit,
  decodeDateIdCursor,
  decodeSortNameIdCursor,
  encodeDateIdCursor,
  encodeSortNameIdCursor,
  INVENTORY_LIST_DEFAULT_LIMIT,
  INVENTORY_LIST_MAX_LIMIT,
  sliceDateIdDescPage,
} from '../../../common/pagination';

describe('inventory-pagination', () => {
  describe('clampInventoryLimit', () => {
    it('aplica default 20 si omiten limit', () => {
      expect(clampInventoryLimit(undefined)).toBe(INVENTORY_LIST_DEFAULT_LIMIT);
    });

    it('acota al máximo documentado', () => {
      expect(clampInventoryLimit(999)).toBe(INVENTORY_LIST_MAX_LIMIT);
    });

    it('respeta un limit válido', () => {
      expect(clampInventoryLimit(50)).toBe(50);
    });
  });

  describe('date+id cursor', () => {
    it('roundtrip encode/decode', () => {
      const d = new Date('2026-07-01T00:00:00.000Z');
      const encoded = encodeDateIdCursor(d, 'uuid-2');
      expect(decodeDateIdCursor(encoded)).toEqual({ d: d.toISOString(), i: 'uuid-2' });
    });

    it('buildDateIdNextCursor retorna cursor cuando hasNext', () => {
      const cursor = buildDateIdNextCursor(true, {
        date: new Date('2026-07-01T00:00:00.000Z'),
        id: 'uuid-3',
      });
      expect(cursor).toBeTruthy();
      expect(decodeDateIdCursor(cursor!)).toMatchObject({ i: 'uuid-3' });
    });

    it('rechaza cursor inválido', () => {
      expect(() => decodeDateIdCursor('%%%')).toThrow(BadRequestException);
    });
  });

  describe('sliceDateIdDescPage', () => {
    it('indica nextCursor cuando hay más ítems que el limit', () => {
      const rows = [
        { id: '1', createdAt: new Date('2026-07-03T00:00:00.000Z') },
        { id: '2', createdAt: new Date('2026-07-02T00:00:00.000Z') },
        { id: '3', createdAt: new Date('2026-07-01T00:00:00.000Z') },
      ];
      const { data, nextCursor } = sliceDateIdDescPage(rows, 2, (row) => row.createdAt);
      expect(data).toHaveLength(2);
      expect(nextCursor).toBeTruthy();
      expect(decodeDateIdCursor(nextCursor!)).toMatchObject({ i: '2' });
    });

    it('retorna nextCursor null en la última página', () => {
      const rows = [{ id: '1', createdAt: new Date('2026-07-03T00:00:00.000Z') }];
      const { data, nextCursor } = sliceDateIdDescPage(rows, 2, (row) => row.createdAt);
      expect(data).toHaveLength(1);
      expect(nextCursor).toBeNull();
    });
  });

  describe('sort+name+id cursor', () => {
    it('roundtrip encode/decode', () => {
      const encoded = encodeSortNameIdCursor(3, 'Fibra', 'uuid-9');
      expect(decodeSortNameIdCursor(encoded)).toEqual({ s: 3, n: 'Fibra', i: 'uuid-9' });
    });

    it('buildSortNameIdNextCursor retorna cursor cuando hasNext', () => {
      const cursor = buildSortNameIdNextCursor(true, {
        sortOrder: 1,
        name: 'CPE',
        id: 'uuid-cat',
      });
      expect(cursor).toBeTruthy();
      expect(decodeSortNameIdCursor(cursor!)).toEqual({ s: 1, n: 'CPE', i: 'uuid-cat' });
    });
  });
});
