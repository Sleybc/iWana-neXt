import type { ConfigService } from '@nestjs/config';
import type IORedis from 'ioredis';
import type { DataSource } from 'typeorm';
import { PlatformAuditLog } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { hashEmail } from '../common/crypto/hash-email.util';
import { PlatformLoginThrottle } from '../modules/auth/platform-login-throttle.service';
import {
  ClearLoginThrottleError,
  clearPlatformLoginThrottle,
  parseClearLoginThrottleArgs,
} from './clear-platform-login-throttle';

const HEX = 'ab'.repeat(32);
const hashKey = Buffer.from(HEX, 'hex');
const config = { getOrThrow: () => HEX } as unknown as ConfigService;
const ACTOR = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'titular@example.test';

function database({
  admins = [ACTOR, ACCOUNT],
  account = ACCOUNT as string | null,
}: { admins?: string[]; account?: string | null } = {}) {
  const state = { rolledBack: false };
  const save = jest.fn().mockResolvedValue(undefined);
  const findOne = jest.fn().mockResolvedValue(account ? { id: account } : null);
  const manager = {
    find: jest.fn().mockResolvedValue(admins.map((id) => ({ id }))),
    findOne,
    save,
  };
  const dataSource = {
    transaction: (work: (m: typeof manager) => Promise<unknown>) =>
      work(manager).catch((error: unknown) => {
        state.rolledBack = true;
        throw error;
      }),
  } as unknown as Pick<DataSource, 'transaction'>;
  return { dataSource, save, findOne, state };
}

describe('clear-platform-login-throttle', () => {
  it('borra la pareja y el freno que usa el servicio y audita el retiro', async () => {
    const evalKeys: string[][] = [];
    const service = new PlatformLoginThrottle(
      {
        eval: (_script: string, count: number, ...rest: string[]) => {
          evalKeys.push(rest.slice(0, count));
          return Promise.resolve(null);
        },
      } as unknown as IORedis,
      config,
    );
    await service.reserve('Titular@Example.test', '::ffff:203.0.113.7');

    const { dataSource, save, findOne } = database();
    const del = jest.fn().mockResolvedValue(2);
    await expect(
      clearPlatformLoginThrottle(
        dataSource,
        { del },
        ` ${EMAIL} `,
        { ip: '::ffff:203.0.113.7', actor: ACTOR },
        hashKey,
      ),
    ).resolves.toBe(true);
    expect(del).toHaveBeenCalledWith(...evalKeys[0]!);
    expect(findOne).toHaveBeenCalledWith(expect.anything(), {
      where: { emailHash: hashEmail(EMAIL, hashKey) },
    });
    expect(save).toHaveBeenCalledWith(PlatformAuditLog, {
      userId: ACTOR,
      action: AuditAction.UPDATE,
      entityType: expect.any(String),
      entityId: ACCOUNT,
      ipAddress: '203.0.113.7',
      oldValue: null,
      newValue: { frenoContrasena: 'RETIRADO', origen: 'RETIRO_FRENO_CLI' },
    });
  });

  it('si la auditoría falla no borra el freno', async () => {
    const { dataSource, save } = database();
    save.mockRejectedValueOnce(new Error('base caída'));
    const del = jest.fn();
    await expect(
      clearPlatformLoginThrottle(
        dataSource,
        { del },
        EMAIL,
        { ip: '203.0.113.7', actor: ACTOR },
        hashKey,
      ),
    ).rejects.toThrow('base caída');
    expect(del).not.toHaveBeenCalled();
  });

  it('sin nada que borrar devuelve false y deshace la auditoría', async () => {
    const { dataSource, state } = database();
    await expect(
      clearPlatformLoginThrottle(
        dataSource,
        { del: jest.fn().mockResolvedValue(0) },
        EMAIL,
        { ip: '2001:db8::1', actor: ACTOR },
        hashKey,
      ),
    ).resolves.toBe(false);
    expect(state.rolledBack).toBe(true);
  });

  it.each([
    ['correo no válido', 'sin-arroba', '203.0.113.7', {}],
    ['IP no válida', EMAIL, 'no-es-ip', {}],
    ['actor que no es administrador activo', EMAIL, '203.0.113.7', { admins: [ACCOUNT] }],
    ['cuenta inexistente', EMAIL, '203.0.113.7', { account: null }],
    ['actor igual a la cuenta con otro administrador', EMAIL, '203.0.113.7', { account: ACTOR }],
  ])('rechaza %s sin tocar Redis ni auditar', async (_caso, email, ip, options) => {
    const { dataSource, save } = database(options);
    const del = jest.fn();
    await expect(
      clearPlatformLoginThrottle(dataSource, { del }, email, { ip, actor: ACTOR }, hashKey),
    ).rejects.toBeInstanceOf(ClearLoginThrottleError);
    expect(del).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('admite que la única administradora figure como actor', async () => {
    const { dataSource, save } = database({ admins: [ACTOR], account: ACTOR });
    await expect(
      clearPlatformLoginThrottle(
        dataSource,
        { del: jest.fn().mockResolvedValue(1) },
        EMAIL,
        { ip: '203.0.113.7', actor: ACTOR },
        hashKey,
      ),
    ).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('exige --ip y --actor, cada uno una vez', () => {
    expect(parseClearLoginThrottleArgs(['--ip=203.0.113.7', `--actor=${ACTOR}`])).toEqual({
      ip: '203.0.113.7',
      actor: ACTOR,
    });
    for (const argv of [
      [],
      ['--ip=203.0.113.7'],
      [`--actor=${ACTOR}`],
      ['--ip=1.1.1.1', '--ip=2.2.2.2', `--actor=${ACTOR}`],
      ['--email=a@example.test', `--actor=${ACTOR}`],
    ]) {
      expect(() => parseClearLoginThrottleArgs(argv)).toThrow(ClearLoginThrottleError);
    }
  });
});
