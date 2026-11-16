import { createHash, generateKeyPairSync, sign } from 'node:crypto';

/**
 * Certificado X.509 autofirmado (EC P-256) generado en memoria para las pruebas del cliente de
 * UISP: sin dependencias ni `openssl`, sin claves versionadas. Sujeto y SAN `localhost` +
 * `127.0.0.1`. Solo para pruebas.
 */
export interface SelfSignedCertificate {
  keyPem: string;
  certPem: string;
  /** SHA-256 hex en minúsculas del DER, como `fingerprint256` de Node sin `:`. */
  sha256: string;
}

function length(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let value = n; value > 0; value >>= 8) bytes.unshift(value & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, ...content: Buffer[]): Buffer {
  const body = Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), length(body.length), body]);
}

const seq = (...items: Buffer[]) => tlv(0x30, ...items);

function oid(dotted: string): Buffer {
  const [a, b, ...rest] = dotted.split('.').map(Number);
  const bytes = [a! * 40 + b!];
  for (const component of rest) {
    const chunk: number[] = [component & 0x7f];
    for (let value = component >> 7; value > 0; value >>= 7) chunk.unshift(0x80 | (value & 0x7f));
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function utcTime(date: Date): Buffer {
  const pad = (n: number) => String(n).padStart(2, '0');
  const text =
    pad(date.getUTCFullYear() % 100) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z';
  return tlv(0x17, Buffer.from(text, 'ascii'));
}

function name(commonName: string): Buffer {
  return seq(tlv(0x31, seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from(commonName, 'utf8')))));
}

export function createSelfSignedCertificate(commonName = 'localhost'): SelfSignedCertificate {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const algorithm = seq(oid('1.2.840.10045.4.3.2'));
  const now = Date.now();
  const subjectAltName = seq(
    oid('2.5.29.17'),
    tlv(
      0x04,
      seq(tlv(0x82, Buffer.from(commonName, 'ascii')), tlv(0x87, Buffer.from([127, 0, 0, 1]))),
    ),
  );
  const tbs = seq(
    tlv(0xa0, tlv(0x02, Buffer.from([0x02]))),
    tlv(0x02, Buffer.from([0x01, ...Array.from({ length: 8 }, () => (Math.random() * 255) | 0)])),
    algorithm,
    name(commonName),
    seq(utcTime(new Date(now - 60_000)), utcTime(new Date(now + 24 * 3_600_000))),
    name(commonName),
    publicKey.export({ type: 'spki', format: 'der' }),
    tlv(0xa3, seq(subjectAltName)),
  );
  const signature = sign('sha256', tbs, privateKey);
  const der = seq(tbs, algorithm, tlv(0x03, Buffer.from([0x00]), signature));
  const base64 = der.toString('base64').replace(/(.{64})/gu, '$1\n');
  return {
    keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    certPem: `-----BEGIN CERTIFICATE-----\n${base64.trimEnd()}\n-----END CERTIFICATE-----\n`,
    sha256: createHash('sha256').update(der).digest('hex'),
  };
}
