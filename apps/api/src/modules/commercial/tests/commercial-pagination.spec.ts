import { BadRequestException } from '@nestjs/common';
import {
  buildActiveNameIdNextCursor,
  buildDateIdNextCursor,
  buildNameIdNextCursor,
  clampCommercialLimit,
  COMMERCIAL_LIST_DEFAULT_LIMIT,
  COMMERCIAL_LIST_MAX_LIMIT,
  decodeActiveNameIdCursor,
  decodeCategoryRankNameIdCursor,
  decodeDateIdCursor,
  decodeNameIdCursor,
  encodeActiveNameIdCursor,
  encodeCategoryRankNameIdCursor,
  encodeDateIdCursor,
  encodeNameIdCursor,
} from '../../../common/pagination';

describe('commercial-pagination', () => {
  describe('clampCommercialLimit', () => {
    it('aplica default 20 si omiten limit', () => {
      expect(clampCommercialLimit(undefined)).toBe(COMMERCIAL_LIST_DEFAULT_LIMIT);
    });

    it('acota al máximo documentado', () => {
      expect(clampCommercialLimit(999)).toBe(COMMERCIAL_LIST_MAX_LIMIT);
    });

    it('respeta un limit válido', () => {
      expect(clampCommercialLimit(50)).toBe(50);
    });
  });

  describe('name+id cursor', () => {
    it('roundtrip encode/decode', () => {
      const encoded = encodeNameIdCursor('Plan Fibra', 'uuid-1');
      expect(decodeNameIdCursor(encoded)).toEqual({ n: 'Plan Fibra', i: 'uuid-1' });
    });

    it('buildNameIdNextCursor retorna null sin más páginas', () => {
      expect(buildNameIdNextCursor(false, { name: 'A', id: '1' })).toBeNull();
    });

    it('rechaza cursor inválido', () => {
      expect(() => decodeNameIdCursor('%%%')).toThrow(BadRequestException);
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
  });

  describe('active+name+id cursor', () => {
    it('roundtrip encode/decode', () => {
      const encoded = encodeActiveNameIdCursor(true, 'Router', 'uuid-a');
      expect(decodeActiveNameIdCursor(encoded)).toEqual({ a: 1, n: 'Router', i: 'uuid-a' });
    });

    it('buildActiveNameIdNextCursor retorna null sin más páginas', () => {
      expect(buildActiveNameIdNextCursor(false, { isActive: true, name: 'A', id: '1' })).toBeNull();
    });
  });

  describe('categoryRank+name+id cursor', () => {
    it('roundtrip encode/decode', () => {
      const encoded = encodeCategoryRankNameIdCursor(2, 'Box', 'uuid-c');
      expect(decodeCategoryRankNameIdCursor(encoded)).toEqual({ r: 2, n: 'Box', i: 'uuid-c' });
    });

    it('rechaza rank no entero', () => {
      const bad = Buffer.from(JSON.stringify({ r: 'x', n: 'A', i: '1' }), 'utf8').toString(
        'base64url',
      );
      expect(() => decodeCategoryRankNameIdCursor(bad)).toThrow(BadRequestException);
    });
  });
});
