import { ConfigService } from '@nestjs/config';
import { PlatformUser } from '@iwana/db';
import { PlatformRole, UserStatus } from '@iwana/shared';
import { Repository } from 'typeorm';
import { hashEmail } from '../../common/crypto/hash-email.util';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformBootstrapService } from './platform-bootstrap.service';

const INJECTED_PII_HASH_KEY_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const MFA_ENCRYPTION_KEY_HEX = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

describe('PlatformBootstrapService', () => {
  const email = 'bootstrap-admin@example.test';
  const originalPiiHashKey = process.env.PII_HASH_KEY;
  let config: { get: jest.Mock; getOrThrow: jest.Mock };
  let repository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let audit: { log: jest.Mock };
  let service: PlatformBootstrapService;

  beforeEach(() => {
    delete process.env.PII_HASH_KEY;
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          PLATFORM_SUPER_ADMIN_EMAIL: email,
          PLATFORM_SUPER_ADMIN_PASSWORD: 'SyntheticBootstrapPass1!',
        };
        return values[key];
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'MFA_ENCRYPTION_KEY') return MFA_ENCRYPTION_KEY_HEX;
        if (key === 'PII_HASH_KEY') return INJECTED_PII_HASH_KEY_HEX;
        throw new Error(`Clave no configurada en fixture: ${key}`);
      }),
    };
    repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => data as PlatformUser),
      save: jest.fn(async (data) => ({ ...data, id: 'platform-user-synthetic' }) as PlatformUser),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new PlatformBootstrapService(
      config as unknown as ConfigService,
      repository as unknown as Repository<PlatformUser>,
      audit as unknown as PlatformAuditService,
    );
  });

  afterEach(() => {
    if (originalPiiHashKey === undefined) {
      delete process.env.PII_HASH_KEY;
    } else {
      process.env.PII_HASH_KEY = originalPiiHashKey;
    }
    jest.clearAllMocks();
  });

  it('busca la cuenta bootstrap con el HMAC inyectado aunque falte process.env', async () => {
    const expectedEmailHash = hashEmail(email, Buffer.from(INJECTED_PII_HASH_KEY_HEX, 'hex'));

    await service.onApplicationBootstrap();

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { emailHash: expectedEmailHash },
      withDeleted: false,
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        emailHash: expectedEmailHash,
        role: PlatformRole.SYSTEM_ADMIN,
        status: UserStatus.ACTIVE,
      }),
    );
  });

  it('conserva el HMAC si la clave inyectada coincide con process.env', async () => {
    process.env.PII_HASH_KEY = INJECTED_PII_HASH_KEY_HEX;
    const expectedEmailHash = hashEmail(email, Buffer.from(INJECTED_PII_HASH_KEY_HEX, 'hex'));

    expect(hashEmail(email)).toBe(expectedEmailHash);
    await service.onApplicationBootstrap();

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { emailHash: expectedEmailHash },
      withDeleted: false,
    });
  });
});
