import { createHash } from 'node:crypto';
import { hashOpaqueToken } from './hash-opaque-token.util';

describe('hashOpaqueToken', () => {
  it('es el SHA-256 hex del token, determinista y distinto del valor en claro', () => {
    const token = 'a1'.repeat(32);
    const expected = createHash('sha256').update(token).digest('hex');

    expect(hashOpaqueToken(token)).toBe(expected);
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
    expect(hashOpaqueToken(token)).not.toBe(token);
    expect(hashOpaqueToken(`${token}x`)).not.toBe(expected);
  });
});
