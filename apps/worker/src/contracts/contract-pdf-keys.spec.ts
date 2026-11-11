import { createCipheriv, randomBytes } from 'node:crypto';
import { decryptObjectBuffer, encryptObjectBuffer } from '@iwana/storage';
import { decryptAesGcmText, loadContractPdfKeys } from './contract-pdf-keys';

const KEY_A = 'a1'.repeat(32);
const KEY_B = 'b2'.repeat(32);
const KEY_C = 'c3'.repeat(32);

function encryptText(plain: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${data.toString('hex')}`;
}

const env = (values: Record<string, string>) => (key: string) => values[key];

describe('loadContractPdfKeys', () => {
  it('usa PII_ENCRYPTION_KEY como activa y acepta las anteriores para leer', () => {
    const keys = loadContractPdfKeys(
      env({
        PII_ENCRYPTION_KEY: KEY_A,
        PII_ENCRYPTION_KEY_PREVIOUS: KEY_B,
        MFA_ENCRYPTION_KEY: KEY_C,
      }),
    );
    expect(keys.activeKey.toString('hex')).toBe(KEY_A);
    expect(keys.readKeys.map((key) => key.toString('hex'))).toEqual([KEY_A, KEY_B, KEY_C]);
  });

  it('fuera de producción cae a MFA_ENCRYPTION_KEY', () => {
    expect(loadContractPdfKeys(env({ MFA_ENCRYPTION_KEY: KEY_C })).activeKey.toString('hex')).toBe(
      KEY_C,
    );
  });

  it('en producción exige PII_ENCRYPTION_KEY y no lee con MFA', () => {
    expect(() =>
      loadContractPdfKeys(env({ NODE_ENV: 'production', MFA_ENCRYPTION_KEY: KEY_C })),
    ).toThrow(/PII_ENCRYPTION_KEY/u);
    const keys = loadContractPdfKeys(
      env({ NODE_ENV: 'production', PII_ENCRYPTION_KEY: KEY_A, MFA_ENCRYPTION_KEY: KEY_C }),
    );
    expect(keys.readKeys).toHaveLength(1);
  });
});

describe('cifrado del snapshot y del PDF', () => {
  it('descifra el formato de la API con la clave anterior tras una rotación', () => {
    const keys = loadContractPdfKeys(
      env({ PII_ENCRYPTION_KEY: KEY_A, PII_ENCRYPTION_KEY_PREVIOUS: KEY_B }),
    );
    expect(decryptAesGcmText(encryptText('{"a":1}', KEY_B), keys.readKeys)).toBe('{"a":1}');
    expect(() => decryptAesGcmText(encryptText('x', KEY_C), keys.readKeys)).toThrow();
    expect(() => decryptAesGcmText('no-cifrado', keys.readKeys)).toThrow(/formato/u);
  });

  it('el objeto cifrado no contiene el PDF en claro y detecta alteraciones', () => {
    const key = Buffer.from(KEY_A, 'hex');
    const pdf = Buffer.from('%PDF-1.7 contenido sintético');
    const blob = encryptObjectBuffer(pdf, key);
    expect(blob.includes(Buffer.from('%PDF'))).toBe(false);
    expect(decryptObjectBuffer(blob, [Buffer.from(KEY_B, 'hex'), key]).equals(pdf)).toBe(true);
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
    expect(() => decryptObjectBuffer(tampered, [key])).toThrow();
    expect(() => decryptObjectBuffer(Buffer.from('XXXX'), [key])).toThrow(/formato/u);
    expect(() => encryptObjectBuffer(pdf, Buffer.alloc(16))).toThrow(/32 bytes/u);
  });
});
