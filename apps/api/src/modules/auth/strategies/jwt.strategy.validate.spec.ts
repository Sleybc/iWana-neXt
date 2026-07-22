import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';
import {
  JWT_AUDIENCE_PLATFORM,
  JWT_AUDIENCE_TENANT,
  JWT_ISSUER_PLATFORM,
  JWT_ISSUER_TENANT,
} from '../auth.constants';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { JwtStrategy } from './jwt.strategy';

/**
 * H-01, defensa en profundidad: los tokens de plataforma y de tenant se firman
 * con la misma clave RSA. La unica frontera criptografica entre ambos son los
 * claims `iss` / `aud`, y `validate()` exige que casen con el claim `type`.
 *
 * Sin esta comprobacion, un token de tenant reetiquetado seguiria verificando.
 */

/** Clave publica ficticia: passport-jwt solo exige que `secretOrKey` exista. */
const FAKE_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\\nclave-de-test\\n-----END PUBLIC KEY-----';

function buildStrategy(redisGet: jest.Mock = jest.fn().mockResolvedValue(null)): JwtStrategy {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue(FAKE_PUBLIC_KEY),
  } as unknown as ConfigService;
  const redis = { get: redisGet } as unknown as Redis;

  return new JwtStrategy(configService, redis);
}

function buildPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'usuario-uuid',
    email: 'hash-sha256',
    role: 'ADMIN',
    tenantId: 'tenant-uuid',
    schemaName: 'tenant_demo',
    jti: 'jti-strategy',
    type: 'tenant',
    iss: JWT_ISSUER_TENANT,
    aud: JWT_AUDIENCE_TENANT,
    ...overrides,
  };
}

describe('JwtStrategy.validate() — coherencia entre (iss, aud) y el tipo de token', () => {
  it('acepta un token de tenant coherente', async () => {
    await expect(buildStrategy().validate(buildPayload())).resolves.toMatchObject({
      type: 'tenant',
    });
  });

  it('acepta un token de plataforma coherente', async () => {
    const payload = buildPayload({
      type: 'platform',
      role: 'SYSTEM_ADMIN',
      tenantId: null,
      schemaName: null,
      iss: JWT_ISSUER_PLATFORM,
      aud: JWT_AUDIENCE_PLATFORM,
    });

    await expect(buildStrategy().validate(payload)).resolves.toMatchObject({ type: 'platform' });
  });

  it('rechaza un token de tenant que se declara de plataforma', async () => {
    const payload = buildPayload({
      type: 'platform',
      role: 'SYSTEM_ADMIN',
      iss: JWT_ISSUER_TENANT,
      aud: JWT_AUDIENCE_TENANT,
    });

    await expect(buildStrategy().validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token con audiencia de tenant y emisor de plataforma', async () => {
    const payload = buildPayload({ iss: JWT_ISSUER_PLATFORM, aud: JWT_AUDIENCE_TENANT });

    await expect(buildStrategy().validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token sin claims de emisor ni audiencia (emitido antes del cambio)', async () => {
    const payload = buildPayload();
    delete payload.iss;
    delete payload.aud;

    await expect(buildStrategy().validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('sigue rechazando un JTI revocado', async () => {
    const redisGet = jest.fn().mockResolvedValue('1');

    await expect(buildStrategy(redisGet).validate(buildPayload())).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
