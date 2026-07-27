import { createHash } from 'crypto';
import { hashDocumentNumber } from './hash-document.util';

describe('hashDocumentNumber', () => {
  it('produce hex SHA-256 determinista de 64 caracteres', () => {
    const digest = hashDocumentNumber('900123456');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(createHash('sha256').update('900123456', 'utf8').digest('hex'));
    expect(hashDocumentNumber('900123456')).toBe(digest);
  });

  it('no normaliza casing (paridad con subscribers)', () => {
    expect(hashDocumentNumber('AB12')).not.toBe(hashDocumentNumber('ab12'));
  });
});
