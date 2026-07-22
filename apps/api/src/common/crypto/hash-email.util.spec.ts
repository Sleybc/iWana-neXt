import { hashEmail } from './hash-email.util';
import { looksLikeEncryptedAesGcm } from './aes-gcm.util';

describe('hashEmail', () => {
  it('normaliza mayúsculas y espacios alrededor', () => {
    expect(hashEmail('  User@Example.COM ')).toBe(hashEmail('user@example.com'));
  });

  it('produce hex SHA-256 de 64 caracteres', () => {
    const digest = hashEmail('usuario@empresa.test');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('looksLikeEncryptedAesGcm (consolidacion H-09)', () => {
  it('acepta iv:tag:ciphertext hex validos', () => {
    const iv = 'a'.repeat(24);
    const tag = 'b'.repeat(32);
    const ciphertext = 'cd'.repeat(8);
    expect(looksLikeEncryptedAesGcm(`${iv}:${tag}:${ciphertext}`)).toBe(true);
  });

  it('rechaza segmentos con longitud incorrecta', () => {
    expect(looksLikeEncryptedAesGcm(`${'a'.repeat(23)}:${'b'.repeat(32)}:abcd`)).toBe(false);
  });
});
