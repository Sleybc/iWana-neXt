import { randomBytes } from 'node:crypto';
import { configProblems } from './check-config';

describe('check-config', () => {
  it('con una configuración incompleta nombra las claves sin mostrar valores', () => {
    const secret = 'valor-que-no-debe-verse';
    const problems = configProblems({
      NODE_ENV: 'production',
      CORS_ORIGIN: `https://${secret}.example/`,
      PORTAL_URL: `http://${secret}.example`,
      MFA_ENCRYPTION_KEY: secret,
      PII_HASH_KEY: secret,
      DB_PORT: secret,
      COOKIE_SECURE: secret,
      INTERNAL_QUEUE_SIGNING_KEY: secret,
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^CORS_ORIGIN: /u),
        expect.stringMatching(/^PORTAL_URL: /u),
        expect.stringMatching(/^JWT_PRIVATE_KEY: /u),
        expect.stringMatching(/^DB_PORT: /u),
      ]),
    );
    expect(problems.join('\n')).not.toContain(secret);
  });

  const complete = (): Record<string, string> => ({
    NODE_ENV: 'production',
    DB_NAME: 'iwana_test',
    DB_USER: 'iwana_app_test',
    DB_PASSWORD: 'not-a-real-password',
    REDIS_PASSWORD: 'test-only-redis-password',
    INTERNAL_QUEUE_SIGNING_KEY: randomBytes(32).toString('base64'),
    JWT_PRIVATE_KEY: 'test-only-private-key-material',
    JWT_PUBLIC_KEY: 'test-only-public-key-material',
    EXECUTION_ORDER_IDEMPOTENCY_SECRET: randomBytes(32).toString('hex'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    PII_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    PII_HASH_KEY: randomBytes(32).toString('hex'),
    STORAGE_DRIVER: 'minio',
    S3_PUBLIC_ENDPOINT: 'https://archivos.example.test',
    S3_ACCESS_KEY_ID: 'test-only-access-key-id',
    S3_SECRET_ACCESS_KEY: 'test-only-secret-access-key',
    TYPESENSE_HOST: 'typesense',
    TYPESENSE_API_KEY: 'test-only-typesense-key',
    COOKIE_SECURE: 'true',
    CORS_ORIGIN: 'https://consola.example,https://portal.example',
    FRONTEND_URL: 'https://consola.example',
    PORTAL_URL: 'https://portal.example',
  });

  it('una configuración válida no tiene problemas', () => {
    expect(configProblems(complete())).toEqual([]);
  });

  it('un fallo entre variables lleva su motivo', () => {
    expect(configProblems({ ...complete(), PORTAL_URL: 'https://consola.example' })).toEqual([
      'PORTAL_URL debe ser distinta de FRONTEND_URL.',
    ]);
  });

  it('valida como producción aunque NODE_ENV falte', () => {
    const { NODE_ENV: _omitted, ...env } = complete();
    expect(configProblems({ ...env, PORTAL_URL: '' }).join()).toContain('PORTAL_URL: ');
  });
});
