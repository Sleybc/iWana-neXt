import { BadRequestException } from '@nestjs/common';
import {
  encodePayload,
  decodePayload,
  encodeDateIdCursor,
  decodeDateIdCursor,
  buildDateIdNextCursor,
  encodeNameIdCursor,
  decodeNameIdCursor,
  buildNameIdNextCursor,
  encodeCodeIdCursor,
  decodeCodeIdCursor,
  buildCodeIdNextCursor,
  encodeAuditCursor,
  decodeAuditCursor,
  dateIdDescCursorWhere,
  dateIdDescCursorParams,
  sortNameIdAscCursorWhere,
  sortNameIdAscCursorParams,
  encodeSortNameIdCursor,
  decodeSortNameIdCursor,
  encodeActiveNameIdCursor,
  decodeActiveNameIdCursor,
  encodeCategoryRankNameIdCursor,
  decodeCategoryRankNameIdCursor,
} from './cursor-codec';

describe('encodePayload / decodePayload', () => {
  it('codifica y decodifica ida y vuelta', () => {
    const cursor = encodePayload({ n: 'test', i: 'uuid-1' });
    const decoded = decodePayload(cursor);
    expect(decoded.n).toBe('test');
    expect(decoded.i).toBe('uuid-1');
  });

  it('decodePayload lanza BadRequestException para cursor inválido', () => {
    expect(() => decodePayload('not-base64!!!')).toThrow(BadRequestException);
  });

  it('decodePayload lanza para payload no-objeto', () => {
    const cursor = Buffer.from('"just a string"', 'utf8').toString('base64url');
    expect(() => decodePayload(cursor)).toThrow(BadRequestException);
  });
});

describe('DateId cursor', () => {
  it('encode/decode ida y vuelta', () => {
    const cursor = encodeDateIdCursor('2024-01-15T10:00:00.000Z', 'uuid-1');
    const decoded = decodeDateIdCursor(cursor);
    expect(decoded.d).toBe('2024-01-15T10:00:00.000Z');
    expect(decoded.i).toBe('uuid-1');
  });

  it('encodeDateIdCursor acepta Date', () => {
    const date = new Date('2024-06-01T12:00:00Z');
    const cursor = encodeDateIdCursor(date, 'uuid-2');
    const decoded = decodeDateIdCursor(cursor);
    expect(decoded.d).toBe('2024-06-01T12:00:00.000Z');
    expect(decoded.i).toBe('uuid-2');
  });

  it('buildDateIdNextCursor con hasNext=true y last', () => {
    const cursor = buildDateIdNextCursor(true, {
      date: '2024-01-01T00:00:00Z',
      id: 'abc',
    });
    expect(cursor).not.toBeNull();
    const decoded = decodeDateIdCursor(cursor!);
    expect(decoded.d).toBe('2024-01-01T00:00:00Z');
  });

  it('buildDateIdNextCursor null si !hasNext', () => {
    expect(buildDateIdNextCursor(false, { date: 'x', id: 'y' })).toBeNull();
  });

  it('buildDateIdNextCursor null si !last', () => {
    expect(buildDateIdNextCursor(true, undefined)).toBeNull();
  });

  it('dateIdDescCursorWhere genera SQL correcto', () => {
    const where = dateIdDescCursorWhere('item', 'created_at');
    expect(where).toContain('item.created_at < :invCursorDate');
    expect(where).toContain('item.id < :invCursorId');
  });

  it('dateIdDescCursorParams extrae parámetros del cursor', () => {
    const cursor = encodeDateIdCursor('2024-03-01T00:00:00.000Z', 'id-42');
    const params = dateIdDescCursorParams(cursor);
    expect(params.invCursorDate).toBe('2024-03-01T00:00:00.000Z');
    expect(params.invCursorId).toBe('id-42');
  });
});

describe('NameId cursor', () => {
  it('encode/decode ida y vuelta', () => {
    const cursor = encodeNameIdCursor('hola', 'uuid-1');
    const decoded = decodeNameIdCursor(cursor);
    expect(decoded.n).toBe('hola');
    expect(decoded.i).toBe('uuid-1');
  });

  it('buildNameIdNextCursor', () => {
    const cursor = buildNameIdNextCursor(true, { name: 'abc', id: '123' });
    expect(cursor).not.toBeNull();
    const decoded = decodeNameIdCursor(cursor!);
    expect(decoded.n).toBe('abc');
  });
});

describe('CodeId cursor', () => {
  it('encode/decode ida y vuelta', () => {
    const cursor = encodeCodeIdCursor('IVA19', 'uuid-1');
    const decoded = decodeCodeIdCursor(cursor);
    expect(decoded.c).toBe('IVA19');
    expect(decoded.i).toBe('uuid-1');
  });

  it('buildCodeIdNextCursor', () => {
    const cursor = buildCodeIdNextCursor(true, { code: 'RETE', id: 'x' });
    expect(cursor).not.toBeNull();
    const decoded = decodeCodeIdCursor(cursor!);
    expect(decoded.c).toBe('RETE');
  });
});

describe('SortNameId cursor', () => {
  it('encode/decode ida y vuelta', () => {
    const cursor = encodeSortNameIdCursor(5, 'test-name', 'uuid-x');
    const decoded = decodeSortNameIdCursor(cursor);
    expect(decoded.s).toBe(5);
    expect(decoded.n).toBe('test-name');
    expect(decoded.i).toBe('uuid-x');
  });

  it('sortNameIdAscCursorWhere genera SQL correcto', () => {
    const where = sortNameIdAscCursorWhere('cat');
    expect(where).toContain('cat.sort_order > :invCursorSort');
    expect(where).toContain('cat.id > :invCursorId');
  });

  it('sortNameIdAscCursorParams extrae correctamente', () => {
    const cursor = encodeSortNameIdCursor(3, 'cat-a', 'id-7');
    const params = sortNameIdAscCursorParams(cursor);
    expect(params.invCursorSort).toBe(3);
    expect(params.invCursorName).toBe('cat-a');
    expect(params.invCursorId).toBe('id-7');
  });
});

describe('ActiveNameId cursor', () => {
  it('encode/decode active=true', () => {
    const cursor = encodeActiveNameIdCursor(true, 'name', 'id');
    const decoded = decodeActiveNameIdCursor(cursor);
    expect(decoded.a).toBe(1);
    expect(decoded.n).toBe('name');
    expect(decoded.i).toBe('id');
  });

  it('encode/decode active=false', () => {
    const cursor = encodeActiveNameIdCursor(false, 'name', 'id');
    const decoded = decodeActiveNameIdCursor(cursor);
    expect(decoded.a).toBe(0);
  });
});

describe('CategoryRankNameId cursor', () => {
  it('encode/decode ida y vuelta', () => {
    const cursor = encodeCategoryRankNameIdCursor(10, 'cat-name', 'uuid-9');
    const decoded = decodeCategoryRankNameIdCursor(cursor);
    expect(decoded.r).toBe(10);
    expect(decoded.n).toBe('cat-name');
    expect(decoded.i).toBe('uuid-9');
  });
});

describe('Audit cursor (DEF-3)', () => {
  it('encode/decode con Date', () => {
    const cursor = encodeAuditCursor(new Date('2024-06-15T10:00:00Z'), 'audit-uuid');
    const decoded = decodeAuditCursor(cursor);
    expect(decoded.d).toBe('2024-06-15T10:00:00.000Z');
    expect(decoded.i).toBe('audit-uuid');
  });

  it('encode/decode con string ISO', () => {
    const cursor = encodeAuditCursor('2024-12-31T23:59:59.000Z', 'uuid-last');
    const decoded = decodeAuditCursor(cursor);
    expect(decoded.d).toBe('2024-12-31T23:59:59.000Z');
    expect(decoded.i).toBe('uuid-last');
  });

  it('decodeAuditCursor lanza para payload malformado', () => {
    const badCursor = encodePayload({ x: '1' }); // falta 'd' e 'i'
    expect(() => decodeAuditCursor(badCursor)).toThrow(BadRequestException);
  });
});
